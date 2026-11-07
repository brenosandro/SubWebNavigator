import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthSession, Owner, SecurityPolicy } from '@prisma/client';
import type { AppContext } from '../context.js';
import { AppError, unauthenticated } from '../lib/errors.js';
import { decryptField, deviceLabelFromUserAgent, maskIp, randomToken, sha256 } from '../lib/crypto.js';

export const SESSION_COOKIE = 'swn_session';

export type Stage = 'MFA_PENDING' | 'ACTIVE' | 'LOCKED';
export type LockReason = 'manual' | 'idle' | 'absolute';
export type LoadedSession = AuthSession & { owner: Owner };

const MINUTE = 60_000;

export function cookieOptions(ctx: AppContext) {
  return {
    httpOnly: true,
    // Strict: o cookie nunca acompanha requisição iniciada por outro site.
    sameSite: 'strict' as const,
    secure: ctx.config.APP_ORIGIN.startsWith('https://'),
    path: '/',
  };
}

export function setSessionCookie(ctx: AppContext, reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions(ctx), expires: expiresAt });
}

export function clearSessionCookie(ctx: AppContext, reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, cookieOptions(ctx));
}

/** Política efetiva: limitada pelos tetos do ambiente (a mais restritiva vence). */
export async function getPolicy(ctx: AppContext, ownerId: string): Promise<SecurityPolicy> {
  const existing = await ctx.prisma.securityPolicy.findUnique({ where: { ownerId } });
  if (existing) return existing;
  return ctx.prisma.securityPolicy.create({
    data: {
      ownerId,
      idleMinutes: Math.min(ctx.config.DEFAULT_IDLE_MINUTES, ctx.config.MAX_IDLE_MINUTES),
      absoluteMinutes: Math.min(ctx.config.DEFAULT_VIEWER_ABSOLUTE_MINUTES, ctx.config.MAX_VIEWER_ABSOLUTE_MINUTES),
    },
  });
}

export function effectiveIdleMinutes(ctx: AppContext, policy: SecurityPolicy) {
  return Math.min(policy.idleMinutes, ctx.config.MAX_IDLE_MINUTES);
}
export function effectiveAbsoluteMinutes(ctx: AppContext, policy: SecurityPolicy) {
  return Math.min(policy.absoluteMinutes, ctx.config.MAX_VIEWER_ABSOLUTE_MINUTES);
}

/**
 * Decide o estágio da sessão pelo RELÓGIO DO SERVIDOR (S-013, S-014).
 * Requisições comuns e heartbeats não renovam `lastHumanInputAt`: só /auth/activity.
 */
export function evaluateStage(
  session: Pick<AuthSession, 'stage' | 'lockReason' | 'lastHumanInputAt' | 'controlExpiresAt'>,
  idleMinutes: number,
  now: Date,
): { stage: Stage; lockReason: LockReason | null } {
  const stage = session.stage as Stage;
  if (stage !== 'ACTIVE') return { stage, lockReason: (session.lockReason as LockReason | null) ?? null };
  if (session.controlExpiresAt && now.getTime() >= session.controlExpiresAt.getTime()) return { stage: 'LOCKED', lockReason: 'absolute' };
  if (now.getTime() - session.lastHumanInputAt.getTime() >= idleMinutes * MINUTE) return { stage: 'LOCKED', lockReason: 'idle' };
  return { stage: 'ACTIVE', lockReason: null };
}

export async function createSession(ctx: AppContext, req: FastifyRequest, reply: FastifyReply, ownerId: string): Promise<AuthSession> {
  const token = randomToken();
  const now = ctx.now();
  const sessionExpiresAt = new Date(now.getTime() + ctx.config.MFA_PENDING_MINUTES * MINUTE);
  const session = await ctx.prisma.authSession.create({
    data: {
      ownerId,
      tokenHash: sha256(token),
      stage: 'MFA_PENDING',
      deviceLabel: deviceLabelFromUserAgent(req.headers['user-agent']),
      ipMasked: maskIp(req.ip),
      createdAt: now,
      lastSeenAt: now,
      lastHumanInputAt: now,
      sessionExpiresAt,
    },
  });
  setSessionCookie(ctx, reply, token, sessionExpiresAt);
  return session;
}

/**
 * Promove a sessão para ACTIVE depois de uma prova com a chave. Gira o segredo
 * do cookie (S-041 — session fixation) e reinicia as janelas de idle e controle.
 */
export async function activateSession(ctx: AppContext, reply: FastifyReply, session: AuthSession, opts: { extendSession: boolean }): Promise<AuthSession> {
  const policy = await getPolicy(ctx, session.ownerId);
  const now = ctx.now();
  const token = randomToken();
  const sessionExpiresAt = opts.extendSession ? new Date(now.getTime() + ctx.config.SESSION_MAX_HOURS * 60 * MINUTE) : session.sessionExpiresAt;
  const updated = await ctx.prisma.authSession.update({
    where: { id: session.id },
    data: {
      tokenHash: sha256(token),
      stage: 'ACTIVE',
      lockReason: null,
      lastHumanInputAt: now,
      lastSeenAt: now,
      stepUpAt: now,
      controlExpiresAt: new Date(now.getTime() + effectiveAbsoluteMinutes(ctx, policy) * MINUTE),
      sessionExpiresAt,
      challenge: null,
      challengePurpose: null,
      challengeExpiresAt: null,
    },
  });
  setSessionCookie(ctx, reply, token, sessionExpiresAt);
  return updated;
}

/** Lê a sessão do cookie e aplica bloqueios vencidos. Retorna null se inválida. */
export async function loadSession(ctx: AppContext, req: FastifyRequest): Promise<LoadedSession | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token || token.length > 128) return null;
  const session = await ctx.prisma.authSession.findUnique({ where: { tokenHash: sha256(token) }, include: { owner: true } });
  const now = ctx.now();
  if (!session || session.revokedAt || session.sessionExpiresAt.getTime() <= now.getTime()) return null;

  const policy = await getPolicy(ctx, session.ownerId);
  const next = evaluateStage(session, effectiveIdleMinutes(ctx, policy), now);
  const changed = next.stage !== session.stage || next.lockReason !== session.lockReason;
  const touchSeen = now.getTime() - session.lastSeenAt.getTime() > MINUTE;
  if (changed || touchSeen) {
    const updated = await ctx.prisma.authSession.update({
      where: { id: session.id },
      data: { stage: next.stage, lockReason: next.lockReason, lastSeenAt: now, ...(changed ? { stepUpAt: null } : {}) },
      include: { owner: true },
    });
    return updated;
  }
  return session;
}

declare module 'fastify' {
  interface FastifyRequest {
    authSession?: LoadedSession;
  }
}

/** preHandler: exige sessão nos estágios dados. */
export function requireSession(ctx: AppContext, stages: Stage[]) {
  return async (req: FastifyRequest) => {
    const session = await loadSession(ctx, req);
    if (!session) throw unauthenticated();
    if (!stages.includes(session.stage as Stage)) {
      if (session.stage === 'MFA_PENDING') throw new AppError('MFA_REQUIRED', 'Confirme o acesso com a sua chave de segurança.');
      if (session.stage === 'LOCKED') throw new AppError('LOCKED', 'Sessão bloqueada. Desbloqueie com a chave de segurança.');
      throw new AppError('FORBIDDEN', 'Operação não permitida neste estado da sessão.');
    }
    req.authSession = session;
  };
}

export function sessionOf(req: FastifyRequest): LoadedSession {
  if (!req.authSession) throw unauthenticated();
  return req.authSession;
}

/** Ações sensíveis exigem prova recente com a chave (<= STEP_UP_MINUTES). */
export function assertStepUp(ctx: AppContext, session: AuthSession) {
  const limit = ctx.config.STEP_UP_MINUTES * MINUTE;
  if (!session.stepUpAt || ctx.now().getTime() - session.stepUpAt.getTime() > limit) {
    throw new AppError('STEP_UP_REQUIRED', 'Confirme esta ação com a sua chave de segurança.');
  }
}

export async function ownerHasKey(ctx: AppContext, ownerId: string) {
  return (await ctx.prisma.webAuthnCredential.count({ where: { ownerId, revokedAt: null } })) > 0;
}

export async function serializeSession(ctx: AppContext, session: LoadedSession) {
  const policy = await getPolicy(ctx, session.ownerId);
  const hasSecurityKey = await ownerHasKey(ctx, session.ownerId);
  const idleMinutes = effectiveIdleMinutes(ctx, policy);
  const stepUpValidUntil = session.stepUpAt ? new Date(session.stepUpAt.getTime() + ctx.config.STEP_UP_MINUTES * MINUTE) : null;
  let email = '';
  try {
    email = decryptField(ctx.dataKey, session.owner.emailEncrypted, `owner:${session.owner.id}:email`);
  } catch {
    email = '';
  }
  return {
    sessionId: session.id,
    stage: session.stage as Stage,
    lockReason: (session.lockReason as LockReason | null) ?? null,
    owner: { id: session.owner.id, name: session.owner.name, email, avatarUrl: session.owner.avatarUrl },
    hasSecurityKey,
    enrollment: { required: !hasSecurityKey, codeRequired: !hasSecurityKey && !ctx.config.WEBAUTHN_DEV_OPEN_ENROLLMENT },
    policy: serializePolicy(policy),
    idleExpiresAt: session.stage === 'ACTIVE' ? new Date(session.lastHumanInputAt.getTime() + idleMinutes * MINUTE).toISOString() : null,
    controlExpiresAt: session.stage === 'ACTIVE' && session.controlExpiresAt ? session.controlExpiresAt.toISOString() : null,
    sessionExpiresAt: session.sessionExpiresAt.toISOString(),
    stepUpValidUntil: stepUpValidUntil && stepUpValidUntil.getTime() > ctx.now().getTime() ? stepUpValidUntil.toISOString() : null,
  };
}

export function serializePolicy(p: SecurityPolicy) {
  return {
    idleMinutes: p.idleMinutes,
    absoluteMinutes: p.absoluteMinutes,
    lockOnBlur: p.lockOnBlur,
    suspendInactiveMinutes: p.suspendInactiveMinutes,
    allowClipboard: p.allowClipboard,
    allowUpload: p.allowUpload,
    allowDownload: p.allowDownload,
    requireStepUp: true as const,
    updatedAt: p.updatedAt.toISOString(),
  };
}
