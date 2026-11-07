import crypto from 'node:crypto';
import WebSocket from 'ws';

/**
 * Fronteira API → runtime remoto. A API nunca fala com o Docker: pede ao
 * controller (HMAC) e abre o canal do worker pelo relay, com o token do runtime
 * e o fencing token do lease atual.
 */
export interface RuntimeBackend {
  start(profileId: string, startUrl: string): Promise<void>;
  suspend(profileId: string): Promise<void>;
  stop(profileId: string): Promise<void>;
  destroy(profileId: string): Promise<void>;
  stats(profileId: string): Promise<{ cpuPercent: number | null; memoryUsedMb: number | null }>;
  /**
   * Abre o canal com o worker. Devolve o socket PAUSADO: o worker manda `ready` e o
   * primeiro quadro logo no handshake, e eles se perderiam antes dos listeners.
   * Quem chama liga os listeners e então chama `resume()`.
   */
  connect(profileId: string, fencing: number): Promise<WebSocket>;
}

export class RuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** Mesmo formato de apps/controller/src/signing.ts. */
export function signRequest(secret: string, ts: number, method: string, path: string, body: string) {
  return crypto.createHmac('sha256', secret).update(`${ts}\n${method.toUpperCase()}\n${path}\n${body}`).digest('base64url');
}

export function createControllerBackend(opts: { controllerUrl: string; secret: string; relayUrl: string }): RuntimeBackend {
  const base = opts.controllerUrl.replace(/\/$/, '');

  async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 90_000): Promise<T> {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const ts = Date.now();
    let res: Response;
    try {
      res = await fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json', 'x-swn-ts': String(ts), 'x-swn-sig': signRequest(opts.secret, ts, method, path, payload) },
        ...(payload ? { body: payload } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new RuntimeError('CONTROLLER_UNREACHABLE', 'O controller de workers não respondeu.', 503);
    }
    const json = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    if (!res.ok) throw new RuntimeError(json.code ?? 'CONTROLLER_ERROR', json.message ?? 'Falha no controller.', res.status === 429 ? 429 : 502);
    return json as T;
  }

  return {
    start: async (id, startUrl) => void (await call('PUT', `/v1/runtimes/${id}`, { startUrl })),
    suspend: async (id) => void (await call('POST', `/v1/runtimes/${id}/suspend`)),
    stop: async (id) => void (await call('POST', `/v1/runtimes/${id}/stop`)),
    destroy: async (id) => void (await call('DELETE', `/v1/runtimes/${id}`)),
    stats: (id) => call('GET', `/v1/runtimes/${id}/stats`, undefined, 25_000),
    async connect(id, fencing) {
      const { token } = await call<{ token: string }>('GET', `/v1/runtimes/${id}/token`);
      const ws = new WebSocket(`${opts.relayUrl.replace(/\/$/, '')}/runtime/${id}`, {
        headers: { authorization: `Bearer ${token}`, 'x-swn-fencing': String(fencing) },
        maxPayload: 8 * 1024 * 1024,
        handshakeTimeout: 8_000,
      });
      return new Promise<WebSocket>((resolve, reject) => {
        ws.once('open', () => {
          ws.pause();
          resolve(ws);
        });
        ws.once('unexpected-response', (_req, res) => reject(new RuntimeError(res.statusCode === 409 ? 'LEASE_STALE' : 'WORKER_UNAVAILABLE', 'Worker recusou a conexão.')));
        ws.once('error', () => reject(new RuntimeError('WORKER_UNAVAILABLE', 'Worker indisponível.')));
      });
    },
  };
}
