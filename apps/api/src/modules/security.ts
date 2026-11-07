import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { AppError, notFound } from '../lib/errors.js';
import { audit } from '../services/audit.js';
import { assertStepUp, getPolicy, requireSession, serializePolicy, sessionOf } from '../auth/session.js';
import { CLOSE } from '../runtime/stream-hub.js';

/** Política, dispositivos (viewer sessions), chaves e auditoria. */

const PolicyPatch = z
  .object({
    idleMinutes: z.union([z.literal(1), z.literal(5), z.literal(15), z.literal(30)]).optional(),
    absoluteMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
    lockOnBlur: z.boolean().optional(),
    suspendInactiveMinutes: z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)]).optional(),
    allowClipboard: z.boolean().optional(),
    allowUpload: z.boolean().optional(),
    allowDownload: z.boolean().optional(),
    requireStepUp: z.literal(true).optional(),
  })
  .strict();

const IdParams = z.object({ id: z.string().uuid() });

export function registerSecurityRoutes(app: FastifyInstance, ctx: AppContext) {
  const active = { preHandler: requireSession(ctx, ['ACTIVE']) };

  // ── Política ──────────────────────────────────────────────────────────────
  app.get('/api/v1/security-policy', active, async (req) => serializePolicy(await getPolicy(ctx, sessionOf(req).ownerId)));

  app.patch('/api/v1/security-policy', active, async (req) => {
    const session = sessionOf(req);
    const body = PolicyPatch.parse(req.body ?? {});
    assertStepUp(ctx, session);
    const { requireStepUp: _alwaysTrue, ...data } = body;
    // Teto do ambiente: o backend manda.
    if (data.idleMinutes && data.idleMinutes > ctx.config.MAX_IDLE_MINUTES) throw new AppError('VALIDATION', `O ambiente limita a inatividade a ${ctx.config.MAX_IDLE_MINUTES} min.`);
    if (data.absoluteMinutes && data.absoluteMinutes > ctx.config.MAX_VIEWER_ABSOLUTE_MINUTES) throw new AppError('VALIDATION', `O ambiente limita o controle a ${ctx.config.MAX_VIEWER_ABSOLUTE_MINUTES} min.`);
    await getPolicy(ctx, session.ownerId);
    const updated = await ctx.prisma.securityPolicy.update({ where: { ownerId: session.ownerId }, data });
    await audit(ctx, req, { ownerId: session.ownerId, code: 'POLICY_UPDATED', result: 'SUCCESS', metadata: { fields: Object.keys(data).join(',') } });
    return serializePolicy(updated);
  });

  // ── Dispositivos ──────────────────────────────────────────────────────────
  app.get('/api/v1/viewer-sessions', active, async (req) => {
    const session = sessionOf(req);
    const rows = await ctx.prisma.authSession.findMany({
      where: { ownerId: session.ownerId, revokedAt: null, sessionExpiresAt: { gt: ctx.now() } },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
    });
    return rows.map((s) => ({ id: s.id, current: s.id === session.id, deviceLabel: s.deviceLabel, ipMasked: s.ipMasked, stage: s.stage, createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString() }));
  });

  app.post('/api/v1/viewer-sessions/:id/revoke', active, async (req, reply) => {
    const session = sessionOf(req);
    const { id } = IdParams.parse(req.params);
    if (id !== session.id) assertStepUp(ctx, session);
    const result = await ctx.prisma.authSession.updateMany({ where: { id, ownerId: session.ownerId, revokedAt: null }, data: { revokedAt: ctx.now(), challenge: null } });
    if (result.count === 0) throw notFound();
    ctx.streamHub.closeSession(id, CLOSE.REVOKED, 'dispositivo revogado');
    await audit(ctx, req, { ownerId: session.ownerId, code: 'SESSION_REVOKED', result: 'SUCCESS', metadata: { scope: id === session.id ? 'self' : 'one' } });
    return reply.code(204).send();
  });

  app.post('/api/v1/viewer-sessions/revoke-others', active, async (req) => {
    const session = sessionOf(req);
    assertStepUp(ctx, session);
    const others = await ctx.prisma.authSession.findMany({ where: { ownerId: session.ownerId, revokedAt: null, id: { not: session.id } }, select: { id: true } });
    const result = await ctx.prisma.authSession.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { revokedAt: ctx.now(), challenge: null } });
    ctx.streamHub.closeSessions(others.map((o) => o.id), CLOSE.REVOKED, 'dispositivo revogado');
    await audit(ctx, req, { ownerId: session.ownerId, code: 'SESSION_REVOKED', result: 'SUCCESS', metadata: { scope: 'others', count: result.count } });
    return { revoked: result.count };
  });

  // ── Chaves de segurança ───────────────────────────────────────────────────
  const serializeKey = (k: { id: string; label: string; createdAt: Date; lastUsedAt: Date | null; deviceType: string; backedUp: boolean; transports: string[] }) => ({
    id: k.id,
    label: k.label,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    deviceType: k.deviceType,
    backedUp: k.backedUp,
    transports: k.transports,
  });

  app.get('/api/v1/security-keys', active, async (req) => {
    const rows = await ctx.prisma.webAuthnCredential.findMany({ where: { ownerId: sessionOf(req).ownerId, revokedAt: null }, orderBy: { createdAt: 'asc' } });
    return rows.map(serializeKey);
  });

  app.patch('/api/v1/security-keys/:id', active, async (req) => {
    const session = sessionOf(req);
    const { id } = IdParams.parse(req.params);
    const { label } = z.object({ label: z.string().trim().min(1).max(60) }).strict().parse(req.body ?? {});
    const key = await ctx.prisma.webAuthnCredential.findFirst({ where: { id, ownerId: session.ownerId, revokedAt: null } });
    if (!key) throw notFound();
    const updated = await ctx.prisma.webAuthnCredential.update({ where: { id }, data: { label } });
    await audit(ctx, req, { ownerId: session.ownerId, code: 'KEY_RENAMED', result: 'SUCCESS', metadata: { keyId: id } });
    return serializeKey(updated);
  });

  app.delete('/api/v1/security-keys/:id', active, async (req, reply) => {
    const session = sessionOf(req);
    const { id } = IdParams.parse(req.params);
    assertStepUp(ctx, session);
    const keys = await ctx.prisma.webAuthnCredential.findMany({ where: { ownerId: session.ownerId, revokedAt: null }, select: { id: true } });
    if (!keys.some((k) => k.id === id)) throw notFound();
    // Remover a última chave abriria um caminho sem segundo fator.
    if (keys.length <= 1) throw new AppError('LAST_KEY', 'Cadastre outra chave antes de remover a última.');
    await ctx.prisma.webAuthnCredential.update({ where: { id }, data: { revokedAt: ctx.now() } });
    await audit(ctx, req, { ownerId: session.ownerId, code: 'KEY_REMOVED', result: 'SUCCESS', metadata: { keyId: id } });
    return reply.code(204).send();
  });

  // ── Auditoria ─────────────────────────────────────────────────────────────
  app.get('/api/v1/audit', active, async (req) => {
    const q = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().uuid().optional(), eventCode: z.string().regex(/^[A-Z_]{3,40}$/).optional() })
      .parse(req.query ?? {});
    const ownerId = sessionOf(req).ownerId;
    const rows = await ctx.prisma.auditEvent.findMany({
      where: { ownerId, ...(q.eventCode ? { eventCode: q.eventCode } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((e) => ({ id: e.id, eventCode: e.eventCode, result: e.result, targetProfileId: e.targetProfileId, ipMasked: e.ipMasked, createdAt: e.createdAt.toISOString(), metadata: e.metadata })),
      nextCursor: rows.length > q.limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  });
}
