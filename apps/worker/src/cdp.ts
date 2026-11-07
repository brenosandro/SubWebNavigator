import type { Readable, Writable } from 'node:stream';

/**
 * Cliente CDP mínimo sobre `--remote-debugging-pipe` (fds 3/4).
 * Sem porta TCP: o DevTools nunca fica acessível pela rede (S-023).
 * Mensagens JSON separadas por '\0'; sessões "flatten" via `sessionId`.
 */
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; method: string };
type Listener = (params: any, sessionId?: string) => void;

export class CdpPipe {
  private nextId = 1;
  private buffer = '';
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private closed = false;

  constructor(
    private readonly out: Writable,
    input: Readable,
  ) {
    input.setEncoding('utf8');
    input.on('data', (chunk: string) => this.onData(chunk));
    input.on('close', () => this.fail(new Error('pipe CDP fechado')));
    out.on('error', (e) => this.fail(e));
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\0')) >= 0) {
      const raw = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      let msg: any;
      try {
        msg = JSON.parse(raw);
      } catch {
        continue;
      }
      if (typeof msg.id === 'number') {
        const p = this.pending.get(msg.id);
        if (!p) continue;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
        else p.resolve(msg.result ?? {});
      } else if (typeof msg.method === 'string') {
        for (const l of this.listeners.get(msg.method) ?? []) l(msg.params ?? {}, msg.sessionId);
      }
    }
  }

  private fail(e: Error) {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
    for (const l of this.listeners.get('__closed') ?? []) l({});
  }

  send<T = any>(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = 15_000): Promise<T> {
    if (this.closed) return Promise.reject(new Error('pipe CDP fechado'));
    const id = this.nextId++;
    const payload = JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params });
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: timeout`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.out.write(payload + '\0');
    });
  }

  on(method: string, listener: Listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method)!.add(listener);
  }

  onClose(listener: () => void) {
    this.on('__closed', listener);
  }
}
