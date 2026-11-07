import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { AppError, notFound } from '../lib/errors.js';
import { randomToken } from '../lib/crypto.js';
import { audit } from '../services/audit.js';
import { assertStepUp, loadSession, requireSession, sessionOf, type LoadedSession } from '../auth/session.js';
import { InputMessage } from '@subweb/protocol';
import { CLOSE } from './stream-hub.js';
import { RuntimeError } from './backend.js';

/**
 * Gateway de streaming (ADR-002): mídia e entrada pelo MESMO hostname protegido
 * pelo Access, em WSS, com sessão (cookie) + ticket de uso único + control lease.
 * O ticket vai na PRIMEIRA MENSAGEM, nunca na URL (não vaza em log/referrer).
 */

const HUMAN_INPUT_THROTTLE_MS = 15_000;

export function registerStreamRoutes(app: FastifyInstance, ctx: AppContext) {
  const hub = ctx.streamHub;
  const active = { preHandler: requireSession(ctx, ['ACTIVE']) };

  async function ownedProfile(req: FastifyRequest, id: string) {
    const profile = await ctx.prisma.browserProfile.findFirst({ where: { id, ownerId: sessionOf(req).ownerId, deletedAt: null } });
    if (!profile) throw notFound();
    return profile;
  }

  /** POST /api/v1/profiles/:id/stream-ticket — cria lease + ticket (TTL <= 30 s). */
  app.post('/api/v1/profiles/:id/stream-ticket', { ...active, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const session = sessionOf(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { takeover } = z.object({ takeover: z.boolean().default(false) }).strict().parse(req.body ?? {});
    const profile = await ownedProfile(req, id);
    if (!ctx.runtime) throw new AppError('RUNTIME_NOT_AVAILABLE', 'O runtime remoto não está configurado neste servidor.');
    if (profile.status !== 'ONLINE') throw new AppError('VALIDATION', 'Inicie o perfil antes de abrir a transmissão.');

    const runtime = await ctx.prisma.runtime.upsert({ where: { profileId: id }, create: { profileId: id, state: 'ONLINE' }, update: {} });
    // Um controlador por runtime. Outro dispositivo só assume com step-up.
    const busy = runtime.leaseSessionId && runtime.leaseSessionId !== session.id && hub.hasLiveConnection(id, runtime.leaseId);
    if (busy) {
      if (!takeover) throw new AppError('CONTROL_BUSY', 'Este perfil está sendo controlado em outro dispositivo.');
      assertStepUp(ctx, session);
    }
    const leaseId = randomToken(16);
    // Incremento atômico: o fencing nunca volta (o worker recusa token menor).
    const updated = await ctx.prisma.runtime.update({
      where: { profileId: id },
      data: { fencingToken: { increment: 1 }, leaseId, leaseSessionId: session.id, leaseAt: ctx.now() },
    });
    if (busy) {
      hub.closeProfile(id, CLOSE.SUPERSEDED, 'controle assumido por outro dispositivo', leaseId);
      await audit(ctx, req, { ownerId: session.ownerId, code: 'STREAM_TAKEOVER', result: 'SUCCESS', targetProfileId: id });
    }
    const ticket = hub.issue({ sessionId: session.id, ownerId: session.ownerId, profileId: id, leaseId, fencing: updated.fencingToken }, ctx.config.STREAM_TICKET_TTL_SECONDS, ctx.now().getTime());
    return { ticket, expiresInSeconds: ctx.config.STREAM_TICKET_TTL_SECONDS, transport: 'wss' as const };
  });

  /** GET /api/v1/stream (WebSocket). */
  app.get(
    '/api/v1/stream',
    {
      websocket: true,
      // Cross-Site WebSocket Hijacking: só a origem do app abre o canal.
      preValidation: async (req) => {
        if (req.headers.origin !== new URL(ctx.config.APP_ORIGIN).origin) throw new AppError('CSRF', 'Origem não permitida.');
      },
      preHandler: requireSession(ctx, ['ACTIVE']),
    },
    (socket: WebSocket, req) => {
      void handleStream(socket, sessionOf(req), req);
    },
  );

  async function handleStream(client: WebSocket, session: LoadedSession, req: FastifyRequest) {
    let upstream: WebSocket | null = null;
    let unregister: (() => void) | null = null;
    let recheck: NodeJS.Timeout | null = null;
    let closed = false;
    const close = (code: number, reason: string) => {
      if (closed) return;
      closed = true;
      if (recheck) clearInterval(recheck);
      unregister?.();
      upstream?.close();
      if (client.readyState === client.OPEN || client.readyState === client.CONNECTING) client.close(code, reason);
    };
    client.on('close', () => close(1000, 'cliente saiu'));
    client.on('error', () => close(1011, 'erro'));

    // 1) Primeira mensagem: o ticket.
    const authTimer = setTimeout(() => close(CLOSE.BAD_TICKET, 'sem ticket'), 5_000);
    const first = await new Promise<string | null>((resolve) => {
      client.once('message', (d, isBinary) => resolve(isBinary ? null : String(d)));
      client.once('close', () => resolve(null));
    });
    clearTimeout(authTimer);
    if (closed || !first) return close(CLOSE.BAD_TICKET, 'sem ticket');
    let ticketValue = '';
    try {
      const parsed = z.object({ t: z.literal('auth'), ticket: z.string().max(128) }).strict().parse(JSON.parse(first));
      ticketValue = parsed.ticket;
    } catch {
      return close(CLOSE.BAD_TICKET, 'mensagem inválida');
    }
    const ticket = hub.consume(ticketValue, ctx.now().getTime());
    // Ticket de outra sessão/dispositivo não vale aqui (S-009, S-015).
    if (!ticket || ticket.sessionId !== session.id || ticket.ownerId !== session.ownerId) {
      await audit(ctx, req, { ownerId: session.ownerId, code: 'STREAM_DENIED', result: 'DENIED', metadata: { reason: 'ticket' } });
      return close(CLOSE.BAD_TICKET, 'ticket inválido');
    }
    const runtime = await ctx.prisma.runtime.findUnique({ where: { profileId: ticket.profileId } });
    if (!runtime || runtime.leaseId !== ticket.leaseId) return close(CLOSE.SUPERSEDED, 'lease substituído');

    unregister = hub.register({ sessionId: session.id, profileId: ticket.profileId, leaseId: ticket.leaseId, close });

    // 2) Canal com o worker (via relay), com o fencing do lease.
    try {
      upstream = await ctx.runtime!.connect(ticket.profileId, ticket.fencing);
    } catch (error) {
      const code = error instanceof RuntimeError && error.code === 'LEASE_STALE' ? CLOSE.SUPERSEDED : CLOSE.WORKER_UNAVAILABLE;
      if (code === CLOSE.WORKER_UNAVAILABLE) await ctx.prisma.browserProfile.update({ where: { id: ticket.profileId }, data: { status: 'ERROR' } }).catch(() => {});
      return close(code, 'worker indisponível');
    }
    if (closed) return upstream.close();

    // Listeners ANTES de qualquer await: o worker manda `ready` e o 1º quadro na hora.
    upstream.on('message', (data, isBinary) => {
      if (client.readyState !== client.OPEN) return;
      // Backpressure: cliente lento perde quadros, nunca acumula memória no servidor.
      if (isBinary && client.bufferedAmount > 4_000_000) return;
      client.send(data, { binary: isBinary });
    });
    upstream.on('close', (code) => close(code === CLOSE.SUPERSEDED ? CLOSE.SUPERSEDED : CLOSE.RUNTIME_STOPPED, 'worker encerrou'));
    upstream.on('error', () => close(CLOSE.WORKER_UNAVAILABLE, 'erro no worker'));
    upstream.resume();
    void audit(ctx, req, { ownerId: session.ownerId, code: 'STREAM_OPENED', result: 'SUCCESS', targetProfileId: ticket.profileId });

    // 3) Entrada humana validada; atividade renova o idle (heartbeat não conta).
    let lastActivity = 0;
    let windowStart = Date.now();
    let count = 0;
    client.on('message', (data, isBinary) => {
      if (isBinary || closed) return;
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > 240) return;
      let msg: InputMessage;
      try {
        msg = InputMessage.parse(JSON.parse(String(data)));
      } catch {
        return;
      }
      upstream?.send(JSON.stringify(msg));
      // `ack` (confirmação de quadro) e `viewport` não são entrada humana: não renovam o idle.
      if (msg.t !== 'viewport' && msg.t !== 'ack' && now - lastActivity > HUMAN_INPUT_THROTTLE_MS) {
        lastActivity = now;
        void ctx.prisma.authSession.update({ where: { id: session.id }, data: { lastHumanInputAt: ctx.now() } }).catch(() => {});
      }
    });

    // 4) Revalidação periódica no servidor (S-007, S-013, S-014, S-034).
    recheck = setInterval(() => {
      void (async () => {
        const fresh = await loadSession(ctx, req).catch(() => null);
        if (!fresh || fresh.id !== session.id) return close(CLOSE.REVOKED, 'sessão encerrada');
        if (fresh.stage !== 'ACTIVE') return close(CLOSE.LOCKED, 'sessão bloqueada');
        const rt = await ctx.prisma.runtime.findUnique({ where: { profileId: ticket.profileId } });
        if (rt?.leaseId !== ticket.leaseId) return close(CLOSE.SUPERSEDED, 'lease substituído');
      })();
    }, ctx.config.STREAM_AUTH_RECHECK_SECONDS * 1000);
  }
}
