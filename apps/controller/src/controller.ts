import http from 'node:http';
import crypto from 'node:crypto';
import { z } from 'zod';
import { containerName, volumeName, workerRunArgs, type DockerExec } from './docker.js';
import { ReplayGuard, verify } from './signing.js';

export type ControllerConfig = {
  secret: string;
  image: string;
  network: string;
  seccompProfile: string;
  egressProxy: string;
  maxWorkers: number;
  defaultMemoryMb: number;
  maxMemoryMb: number;
  defaultCpus: number;
  timezone: string;
  healthTimeoutMs: number;
};

export type RuntimeState = 'running' | 'paused' | 'stopped' | 'starting' | 'error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const StartBody = z
  .object({
    startUrl: z
      .string()
      .url()
      .max(2048)
      .refine((u) => u.startsWith('https://'), 'somente https'),
    memoryMb: z.number().int().min(512).max(4096).optional(),
    cpus: z.number().min(0.25).max(4).optional(),
  })
  .strict();

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Controller dos workers. Mantém em memória o token de cada runtime ativo;
 * se o controller reinicia, o próximo `start` recria o container (fail-closed:
 * token perdido nunca é reaproveitado).
 */
export function createController(cfg: ControllerConfig, docker: DockerExec, now: () => number = Date.now) {
  const tokens = new Map<string, string>();
  const locks = new Map<string, Promise<unknown>>();
  const guard = new ReplayGuard();

  const withLock = async <T>(id: string, fn: () => Promise<T>): Promise<T> => {
    const prev = locks.get(id) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    locks.set(id, run);
    try {
      return await run;
    } finally {
      if (locks.get(id) === run) locks.delete(id);
    }
  };

  async function inspect(id: string): Promise<{ status: string; health: string; exitCode: number } | null> {
    const r = await docker(['inspect', '--format', '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.State.ExitCode}}', containerName(id)]);
    if (r.code !== 0) return null;
    const [status = '', health = '', exit = '0'] = r.stdout.split('|');
    return { status, health, exitCode: Number(exit) };
  }

  function toState(i: Awaited<ReturnType<typeof inspect>>): RuntimeState {
    if (!i) return 'stopped';
    if (i.status === 'paused') return 'paused';
    if (i.status === 'running') return i.health === 'healthy' ? 'running' : i.health === 'unhealthy' ? 'error' : 'starting';
    if (i.status === 'created' || i.status === 'restarting') return 'starting';
    return i.exitCode === 0 ? 'stopped' : 'error';
  }

  async function removeContainer(id: string) {
    await docker(['stop', '-t', '20', containerName(id)], 30_000);
    await docker(['rm', '-f', containerName(id)]);
    tokens.delete(id);
  }

  async function countWorkers(): Promise<number> {
    const r = await docker(['ps', '--filter', 'label=swn.role=worker', '--format', '{{.Names}}']);
    return r.stdout ? r.stdout.split(/\r?\n/).filter(Boolean).length : 0;
  }

  async function waitHealthy(id: string): Promise<void> {
    const deadline = now() + cfg.healthTimeoutMs;
    while (now() < deadline) {
      const i = await inspect(id);
      const state = toState(i);
      if (state === 'running') return;
      if (!i || i.status === 'exited' || i.status === 'dead') {
        const logs = await docker(['logs', '--tail', '20', containerName(id)]);
        const sandbox = /sandbox_unavailable|No usable sandbox/i.test(logs.stdout + logs.stderr);
        await docker(['rm', '-f', containerName(id)]);
        tokens.delete(id);
        throw new HttpError(502, sandbox ? 'SANDBOX_UNAVAILABLE' : 'WORKER_EXITED', sandbox ? 'O sandbox do Chromium não pôde ser ativado; o worker foi recusado.' : 'O worker encerrou durante a inicialização.');
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    await removeContainer(id);
    throw new HttpError(504, 'WORKER_TIMEOUT', 'O worker não ficou pronto a tempo.');
  }

  async function start(id: string, body: z.infer<typeof StartBody>) {
    return withLock(id, async () => {
      const current = await inspect(id);
      const token = tokens.get(id);
      if (current && token) {
        if (current.status === 'paused') await docker(['unpause', containerName(id)]);
        if (current.status === 'running' || current.status === 'paused') {
          await waitHealthy(id);
          return { state: 'running' as const, token };
        }
      }
      // Sem token conhecido (ou parado/com erro): recria do zero.
      if (current) await removeContainer(id);
      if ((await countWorkers()) >= cfg.maxWorkers) throw new HttpError(429, 'WORKER_QUOTA', `Limite de ${cfg.maxWorkers} perfis ativos ao mesmo tempo. Suspenda ou pare outro perfil.`);
      const newToken = crypto.randomBytes(32).toString('base64url');
      const memoryMb = Math.min(body.memoryMb ?? cfg.defaultMemoryMb, cfg.maxMemoryMb);
      const run = await docker(
        workerRunArgs({ profileId: id, startUrl: body.startUrl, token: newToken, image: cfg.image, network: cfg.network, seccompProfile: cfg.seccompProfile, egressProxy: cfg.egressProxy, memoryMb, cpus: body.cpus ?? cfg.defaultCpus, timezone: cfg.timezone }),
        120_000,
      );
      if (run.code !== 0) throw new HttpError(502, 'WORKER_RUN_FAILED', 'Falha ao criar o container do worker.');
      tokens.set(id, newToken);
      await waitHealthy(id);
      return { state: 'running' as const, token: newToken };
    });
  }

  async function handle(method: string, path: string, body: string): Promise<{ status: number; json: unknown }> {
    if (method === 'GET' && path === '/v1/health') return { status: 200, json: { ok: true } };
    const m = /^\/v1\/runtimes\/([^/]+)(\/[a-z]+)?$/.exec(path);
    if (!m || !UUID.test(m[1]!)) throw new HttpError(404, 'NOT_FOUND', 'Não encontrado.');
    const id = m[1]!;
    const action = m[2] ?? '';

    if (method === 'PUT' && action === '') {
      let parsed: z.infer<typeof StartBody>;
      try {
        parsed = StartBody.parse(JSON.parse(body || '{}'));
      } catch {
        throw new HttpError(400, 'VALIDATION', 'Requisição inválida.');
      }
      return { status: 200, json: await start(id, parsed) };
    }
    if (method === 'GET' && action === '') {
      const state = toState(await inspect(id));
      return { status: 200, json: { state, hasToken: tokens.has(id) } };
    }
    if (method === 'GET' && action === '/token') {
      const token = tokens.get(id);
      const state = toState(await inspect(id));
      if (!token || (state !== 'running' && state !== 'paused')) throw new HttpError(409, 'NOT_RUNNING', 'Runtime não está ativo.');
      return { status: 200, json: { token } };
    }
    if (method === 'GET' && action === '/stats') {
      const r = await docker(['stats', '--no-stream', '--format', '{{.CPUPerc}}|{{.MemUsage}}', containerName(id)], 20_000);
      if (r.code !== 0) return { status: 200, json: { cpuPercent: null, memoryUsedMb: null } };
      const [cpu = '', mem = ''] = r.stdout.split('|');
      return { status: 200, json: { cpuPercent: parseFloat(cpu) || 0, memoryUsedMb: parseMem(mem.split('/')[0] ?? '') } };
    }
    if (method === 'POST' && action === '/suspend') {
      return withLock(id, async () => {
        const i = await inspect(id);
        if (i?.status === 'running') await docker(['pause', containerName(id)]);
        return { status: 200, json: { state: toState(await inspect(id)) } };
      });
    }
    if (method === 'POST' && action === '/stop') {
      return withLock(id, async () => {
        await removeContainer(id);
        return { status: 200, json: { state: 'stopped' } };
      });
    }
    if (method === 'DELETE' && action === '') {
      return withLock(id, async () => {
        await removeContainer(id);
        // Apaga o perfil persistente (cookies/sessões do site). Backups seguem a retenção.
        await docker(['volume', 'rm', '-f', volumeName(id)]);
        return { status: 200, json: { state: 'deleted' } };
      });
    }
    throw new HttpError(405, 'METHOD', 'Método não permitido.');
  }

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 8 * 1024) req.destroy();
      else chunks.push(c);
    });
    req.on('end', async () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const path = (req.url ?? '').split('?')[0]!;
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(json));
      };
      if (!(path === '/v1/health' && req.method === 'GET')) {
        const ok = verify(cfg.secret, { ts: header(req, 'x-swn-ts'), sig: header(req, 'x-swn-sig') }, req.method ?? '', path, body, now(), guard);
        if (!ok) return send(401, { code: 'UNAUTHORIZED', message: 'Assinatura inválida.' });
      }
      try {
        const r = await handle(req.method ?? 'GET', path, body);
        send(r.status, r.json);
      } catch (e) {
        if (e instanceof HttpError) return send(e.status, { code: e.code, message: e.message });
        process.stderr.write(`erro interno: ${e instanceof Error ? e.message : 'desconhecido'}\n`);
        send(500, { code: 'INTERNAL', message: 'Erro interno.' });
      }
    });
  });

  return { server, handle, tokens };
}

function header(req: http.IncomingMessage, name: string) {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function parseMem(v: string): number | null {
  const m = /([\d.]+)\s*([KMG]i?B)/i.exec(v.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toUpperCase();
  return Math.round(unit.startsWith('G') ? n * 1024 : unit.startsWith('K') ? n / 1024 : n);
}
