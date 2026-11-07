import type { WebSocket } from 'ws';
import { randomToken, sha256 } from '../lib/crypto.js';

/** Códigos de fechamento do canal de stream (o front mostra a mensagem certa). */
export const CLOSE = {
  UNAUTHORIZED: 4401,
  LOCKED: 4423,
  REVOKED: 4403,
  SUPERSEDED: 4409,
  RUNTIME_STOPPED: 4410,
  BAD_TICKET: 4400,
  WORKER_UNAVAILABLE: 4502,
} as const;

type Ticket = { sessionId: string; ownerId: string; profileId: string; leaseId: string; fencing: number; expiresAt: number };
type Conn = { sessionId: string; profileId: string; leaseId: string; close: (code: number, reason: string) => void };

/**
 * Estado efêmero do streaming, só em memória do processo:
 * - tickets de uso único (TTL <= 30 s), guardados por hash;
 * - conexões ativas, para corte IMEDIATO em lock/logout/revogação (S-007).
 * Se o processo reinicia, tudo some: fail-closed (novo ticket exige sessão ativa).
 */
export class StreamHub {
  private readonly tickets = new Map<string, Ticket>();
  private readonly conns = new Set<Conn>();

  issue(t: Omit<Ticket, 'expiresAt'>, ttlSeconds: number, now: number): string {
    this.sweep(now);
    const ticket = randomToken(32);
    this.tickets.set(sha256(ticket), { ...t, expiresAt: now + ttlSeconds * 1000 });
    return ticket;
  }

  /** Consome o ticket (S-008): segunda tentativa nunca encontra nada. */
  consume(ticket: string, now: number): Ticket | null {
    if (typeof ticket !== 'string' || ticket.length > 128) return null;
    const key = sha256(ticket);
    const t = this.tickets.get(key);
    this.tickets.delete(key);
    if (!t || t.expiresAt < now) return null;
    return t;
  }

  register(conn: Conn): () => void {
    this.conns.add(conn);
    return () => this.conns.delete(conn);
  }

  hasLiveConnection(profileId: string, leaseId: string | null): boolean {
    for (const c of this.conns) if (c.profileId === profileId && (!leaseId || c.leaseId === leaseId)) return true;
    return false;
  }

  closeSession(sessionId: string, code: number, reason: string) {
    for (const c of [...this.conns]) if (c.sessionId === sessionId) c.close(code, reason);
  }
  closeSessions(sessionIds: string[], code: number, reason: string) {
    for (const id of sessionIds) this.closeSession(id, code, reason);
  }
  closeProfile(profileId: string, code: number, reason: string, exceptLeaseId?: string) {
    for (const c of [...this.conns]) if (c.profileId === profileId && c.leaseId !== exceptLeaseId) c.close(code, reason);
  }

  private sweep(now: number) {
    for (const [k, t] of this.tickets) if (t.expiresAt < now) this.tickets.delete(k);
  }
}

export type { WebSocket };
