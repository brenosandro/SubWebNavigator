import crypto from 'node:crypto';

/**
 * Assinatura HMAC das chamadas API → controller (F3). Corpo, método, caminho e
 * timestamp entram na assinatura; janela de 30 s e anti-replay por assinatura.
 * Mesmo formato em apps/api/src/runtime/controller-client.ts.
 */
export const MAX_SKEW_MS = 30_000;

export function sign(secret: string, ts: number, method: string, path: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(`${ts}\n${method.toUpperCase()}\n${path}\n${body}`).digest('base64url');
}

export class ReplayGuard {
  private readonly seen = new Map<string, number>();
  check(sig: string, now: number): boolean {
    for (const [k, exp] of this.seen) if (exp < now) this.seen.delete(k);
    if (this.seen.has(sig)) return false;
    this.seen.set(sig, now + 2 * MAX_SKEW_MS);
    return true;
  }
}

export function verify(secret: string, headers: { ts?: string; sig?: string }, method: string, path: string, body: string, now: number, guard: ReplayGuard): boolean {
  const ts = Number(headers.ts);
  if (!Number.isSafeInteger(ts) || Math.abs(now - ts) > MAX_SKEW_MS || !headers.sig) return false;
  const expected = Buffer.from(sign(secret, ts, method, path, body));
  const got = Buffer.from(headers.sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return false;
  return guard.check(headers.sig, now);
}
