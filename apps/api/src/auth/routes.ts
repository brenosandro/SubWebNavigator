import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { audit } from '../services/audit.js';
import { clearSessionCookie, loadSession, requireSession, serializeSession, sessionOf } from './session.js';
import { unauthenticated } from '../lib/errors.js';
import { CLOSE } from '../runtime/stream-hub.js';

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/auth/config', async () => ({ googleEnabled: ctx.config.googleEnabled, devLogin: ctx.config.devLoginEnabled }));

  app.get('/api/auth/session', async (req) => {
    const session = await loadSession(ctx, req);
    if (!session) throw unauthenticated();
    return serializeSession(ctx, session);
  });

  /**
   * Atividade HUMANA (clique, tecla, toque). O front só chama em eventos reais de
   * entrada; requisições comuns e heartbeats nunca renovam o idle (S-013).
   */
  app.post('/api/auth/activity', { preHandler: requireSession(ctx, ['ACTIVE']), config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (req, reply) => {
    const session = sessionOf(req);
    await ctx.prisma.authSession.update({ where: { id: session.id }, data: { lastHumanInputAt: ctx.now(), lastSeenAt: ctx.now() } });
    return reply.code(204).send();
  });

  /** Bloqueio manual: corta no servidor, não é só overlay. */
  app.post('/api/auth/lock', { preHandler: requireSession(ctx, ['ACTIVE', 'LOCKED']) }, async (req, reply) => {
    const session = sessionOf(req);
    if (session.stage === 'ACTIVE') {
      await ctx.prisma.authSession.update({ where: { id: session.id }, data: { stage: 'LOCKED', lockReason: 'manual', stepUpAt: null, challenge: null } });
      await audit(ctx, req, { ownerId: session.ownerId, code: 'AUTH_LOCK', result: 'SUCCESS', metadata: { reason: 'manual' } });
    }
    // Corte imediato do stream e da entrada — não só overlay.
    ctx.streamHub.closeSession(session.id, CLOSE.LOCKED, 'sessão bloqueada');
    return reply.code(204).send();
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const session = await loadSession(ctx, req);
    if (session) {
      await ctx.prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: ctx.now(), challenge: null } });
      await audit(ctx, req, { ownerId: session.ownerId, code: 'AUTH_LOGOUT', result: 'SUCCESS' });
      ctx.streamHub.closeSession(session.id, CLOSE.REVOKED, 'sessão encerrada');
    }
    clearSessionCookie(ctx, reply);
    return reply.code(204).send();
  });
}
