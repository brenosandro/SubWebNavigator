import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BrowserProfile } from '@prisma/client';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { AppError, notFound } from '../lib/errors.js';
import { audit } from '../services/audit.js';
import { assertStepUp, requireSession, sessionOf } from '../auth/session.js';
import { UrlRejected, validateStartUrl } from '../security/url-policy.js';
import { RuntimeError } from '../runtime/backend.js';
import { CLOSE } from '../runtime/stream-hub.js';

export const PROVIDERS = ['whatsapp', 'telegram', 'instagram', 'custom'] as const;
export const GROUPS = ['MENSAGENS', 'SOCIAL', 'PRODUTIVIDADE', 'PESSOAL', 'FAVORITOS'] as const;
export const COLOR_TOKENS = ['slate', 'blue', 'emerald', 'amber', 'rose', 'violet', 'sky', 'teal', 'orange'] as const;
const MAX_PROFILES = 50;

/** Título só com texto: a UI escapa tudo, mas não aceitamos controle/markup (S-017). */
const Title = z
  .string()
  .trim()
  .min(1, 'Informe um nome.')
  .max(80)
  .refine((v) => !/[<>\u0000-\u001f\u007f]/.test(v), 'O nome não pode conter < > nem caracteres de controle.');

const CreateSchema = z
  .object({
    title: Title,
    provider: z.enum(PROVIDERS).default('custom'),
    startUrl: z.string().max(2048),
    group: z.enum(GROUPS).default('PESSOAL'),
    colorToken: z.enum(COLOR_TOKENS).default('slate'),
    autoStart: z.boolean().default(false),
  })
  .strict();

const PatchSchema = z
  .object({
    title: Title.optional(),
    startUrl: z.string().max(2048).optional(),
    group: z.enum(GROUPS).optional(),
    colorToken: z.enum(COLOR_TOKENS).optional(),
    pinned: z.boolean().optional(),
    autoStart: z.boolean().optional(),
  })
  .strict();

const IdParams = z.object({ id: z.string().uuid() });

export function serializeProfile(p: BrowserProfile) {
  return {
    id: p.id,
    title: p.title,
    provider: p.provider,
    startUrl: p.normalizedStartUrl,
    host: p.host,
    group: p.group,
    colorToken: p.colorToken,
    status: p.status,
    pinned: p.pinned,
    autoStart: p.autoStart,
    orderIndex: p.orderIndex,
    lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function registerProfileRoutes(app: FastifyInstance, ctx: AppContext) {
  const active = { preHandler: requireSession(ctx, ['ACTIVE']) };

  /** Ownership em TODA consulta: id de outro titular devolve 404 neutro (S-010). */
  async function findOwned(req: FastifyRequest): Promise<BrowserProfile> {
    const { id } = IdParams.parse(req.params);
    const profile = await ctx.prisma.browserProfile.findFirst({ where: { id, ownerId: sessionOf(req).ownerId, deletedAt: null } });
    if (!profile) throw notFound();
    return profile;
  }

  async function checkUrl(req: FastifyRequest, raw: string) {
    try {
      return await validateStartUrl(raw, { resolveDns: ctx.config.URL_POLICY_RESOLVE_DNS, resolver: ctx.dnsResolver });
    } catch (error) {
      if (error instanceof UrlRejected) {
        await audit(ctx, req, { ownerId: sessionOf(req).ownerId, code: 'PROFILE_URL_REJECTED', result: 'DENIED' });
        throw new AppError('URL_REJECTED', error.message);
      }
      throw error;
    }
  }

  app.get('/api/v1/profiles', active, async (req) => {
    const rows = await ctx.prisma.browserProfile.findMany({ where: { ownerId: sessionOf(req).ownerId, deletedAt: null }, orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] });
    return rows.map(serializeProfile);
  });

  app.post('/api/v1/profiles', active, async (req, reply) => {
    const ownerId = sessionOf(req).ownerId;
    const body = CreateSchema.parse(req.body ?? {});
    const count = await ctx.prisma.browserProfile.count({ where: { ownerId, deletedAt: null } });
    if (count >= MAX_PROFILES) throw new AppError('VALIDATION', `Limite de ${MAX_PROFILES} perfis atingido.`);
    const url = await checkUrl(req, body.startUrl);
    const profile = await ctx.prisma.browserProfile.create({
      data: { ownerId, title: body.title, provider: body.provider, normalizedStartUrl: url.url, host: url.host, group: body.group, colorToken: body.colorToken, autoStart: body.autoStart, orderIndex: count },
    });
    await audit(ctx, req, { ownerId, code: 'PROFILE_CREATED', result: 'SUCCESS', targetProfileId: profile.id, metadata: { provider: profile.provider, host: profile.host } });
    return reply.code(201).send(serializeProfile(profile));
  });

  app.get('/api/v1/profiles/:id', active, async (req) => serializeProfile(await findOwned(req)));

  app.patch('/api/v1/profiles/:id', active, async (req) => {
    const profile = await findOwned(req);
    const body = PatchSchema.parse(req.body ?? {});
    const url = body.startUrl !== undefined ? await checkUrl(req, body.startUrl) : null;
    const { startUrl: _ignored, ...rest } = body;
    const updated = await ctx.prisma.browserProfile.update({
      where: { id: profile.id },
      data: { ...rest, ...(url ? { normalizedStartUrl: url.url, host: url.host } : {}) },
    });
    await audit(ctx, req, { ownerId: profile.ownerId, code: 'PROFILE_UPDATED', result: 'SUCCESS', targetProfileId: profile.id, metadata: { fields: Object.keys(body).join(',') } });
    return serializeProfile(updated);
  });

  /** Exclusão exige step-up. O material criptográfico do vault entra na P3. */
  app.delete('/api/v1/profiles/:id', active, async (req, reply) => {
    const session = sessionOf(req);
    const profile = await findOwned(req);
    assertStepUp(ctx, session);
    ctx.streamHub.closeProfile(profile.id, CLOSE.RUNTIME_STOPPED, 'perfil excluído');
    // Destrói container e volume do perfil (cookies/sessão do site). Falha aqui bloqueia a exclusão.
    if (ctx.runtime) {
      try {
        await ctx.runtime.destroy(profile.id);
      } catch (error) {
        throw runtimeFailure(error);
      }
    }
    await ctx.prisma.browserProfile.update({ where: { id: profile.id }, data: { deletedAt: ctx.now(), status: 'STOPPED', encryptedVaultRef: null } });
    await audit(ctx, req, { ownerId: session.ownerId, code: 'PROFILE_DELETED', result: 'SUCCESS', targetProfileId: profile.id });
    return reply.code(204).send();
  });

  app.post('/api/v1/profiles/reorder', active, async (req, reply) => {
    const ownerId = sessionOf(req).ownerId;
    const { ids } = z.object({ ids: z.array(z.string().uuid()).max(MAX_PROFILES) }).strict().parse(req.body ?? {});
    const owned = await ctx.prisma.browserProfile.findMany({ where: { ownerId, deletedAt: null, id: { in: ids } }, select: { id: true } });
    if (owned.length !== new Set(ids).size) throw notFound();
    await ctx.prisma.$transaction(ids.map((id, index) => ctx.prisma.browserProfile.update({ where: { id }, data: { orderIndex: index } })));
    return reply.code(204).send();
  });

  app.post('/api/v1/profiles/:id/touch', active, async (req, reply) => {
    const profile = await findOwned(req);
    await ctx.prisma.browserProfile.update({ where: { id: profile.id }, data: { lastUsedAt: ctx.now() } });
    return reply.code(204).send();
  });

  // ── Runtime remoto (P3) ────────────────────────────────────────────────────
  function requireRuntime(req: FastifyRequest, profile: BrowserProfile, action: string) {
    if (ctx.runtime) return ctx.runtime;
    void audit(ctx, req, { ownerId: profile.ownerId, code: 'PROFILE_RUNTIME_UNAVAILABLE', result: 'FAILURE', targetProfileId: profile.id, metadata: { action } });
    throw new AppError('RUNTIME_NOT_AVAILABLE', 'O runtime remoto (worker Chromium isolado) não está configurado neste servidor.');
  }

  async function setStatus(profile: BrowserProfile, status: string, error: string | null = null) {
    await ctx.prisma.runtime.upsert({
      where: { profileId: profile.id },
      create: { profileId: profile.id, state: status, lastError: error, startedAt: status === 'ONLINE' ? ctx.now() : null },
      update: { state: status, lastError: error, ...(status === 'ONLINE' ? { startedAt: ctx.now() } : {}), ...(status !== 'ONLINE' ? { leaseId: null, leaseSessionId: null } : {}) },
    });
    return ctx.prisma.browserProfile.update({ where: { id: profile.id }, data: { status, ...(status === 'ONLINE' ? { lastUsedAt: ctx.now() } : {}) } });
  }

  function runtimeFailure(error: unknown): AppError {
    if (error instanceof RuntimeError) {
      if (error.status === 429) return new AppError('RUNTIME_QUOTA', error.message);
      if (error.code === 'CONTROLLER_UNREACHABLE') return new AppError('RUNTIME_NOT_AVAILABLE', error.message);
      return new AppError('RUNTIME_FAILED', error.message);
    }
    return new AppError('RUNTIME_FAILED', 'Falha ao operar o runtime remoto.');
  }

  /** Inicia (ou acorda) o worker isolado do perfil. Idempotente. */
  app.post('/api/v1/profiles/:id/start', { ...active, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const profile = await findOwned(req);
    const runtime = requireRuntime(req, profile, 'start');
    await setStatus(profile, 'STARTING');
    try {
      await runtime.start(profile.id, profile.normalizedStartUrl);
    } catch (error) {
      const failure = runtimeFailure(error);
      await setStatus(profile, failure.code === 'RUNTIME_QUOTA' ? profile.status === 'STARTING' ? 'STOPPED' : profile.status : 'ERROR', failure.message);
      await audit(ctx, req, { ownerId: profile.ownerId, code: 'PROFILE_RUNTIME_FAILED', result: 'FAILURE', targetProfileId: profile.id, metadata: { reason: error instanceof RuntimeError ? error.code : 'erro' } });
      throw failure;
    }
    const updated = await setStatus(profile, 'ONLINE');
    await audit(ctx, req, { ownerId: profile.ownerId, code: 'PROFILE_STARTED', result: 'SUCCESS', targetProfileId: profile.id });
    return serializeProfile(updated);
  });

  /** Suspende: congela o worker (CPU livre), mantendo a sessão do site em memória. */
  app.post('/api/v1/profiles/:id/suspend', active, async (req) => {
    const profile = await findOwned(req);
    const runtime = requireRuntime(req, profile, 'suspend');
    ctx.streamHub.closeProfile(profile.id, CLOSE.RUNTIME_STOPPED, 'perfil suspenso');
    try {
      await runtime.suspend(profile.id);
    } catch (error) {
      throw runtimeFailure(error);
    }
    const updated = await setStatus(profile, 'SUSPENDED');
    await audit(ctx, req, { ownerId: profile.ownerId, code: 'PROFILE_SUSPENDED', result: 'SUCCESS', targetProfileId: profile.id });
    return serializeProfile(updated);
  });

  /** Para: fecha o Chromium de forma limpa (perfil persistido) e remove o container. */
  app.post('/api/v1/profiles/:id/stop', active, async (req) => {
    const profile = await findOwned(req);
    ctx.streamHub.closeProfile(profile.id, CLOSE.RUNTIME_STOPPED, 'perfil parado');
    if (ctx.runtime) {
      try {
        await ctx.runtime.stop(profile.id);
      } catch (error) {
        throw runtimeFailure(error);
      }
    }
    const updated = await setStatus(profile, 'STOPPED');
    await audit(ctx, req, { ownerId: profile.ownerId, code: 'PROFILE_STOPPED', result: 'SUCCESS', targetProfileId: profile.id });
    return serializeProfile(updated);
  });

  /** Consumo do worker — só números, nunca conteúdo. */
  app.get('/api/v1/profiles/:id/stats', active, async (req) => {
    const profile = await findOwned(req);
    if (!ctx.runtime || profile.status === 'STOPPED') return { cpuPercent: null, memoryUsedMb: null };
    return ctx.runtime.stats(profile.id).catch(() => ({ cpuPercent: null, memoryUsedMb: null }));
  });
}
