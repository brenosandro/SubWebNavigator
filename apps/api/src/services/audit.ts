import type { FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { AppContext } from '../context.js';
import { maskIp } from '../lib/crypto.js';

export type AuditCode =
  | 'AUTH_GOOGLE_LOGIN'
  | 'AUTH_GOOGLE_DENIED'
  | 'AUTH_MFA_SUCCESS'
  | 'AUTH_MFA_FAILED'
  | 'AUTH_STEP_UP'
  | 'AUTH_LOCK'
  | 'AUTH_UNLOCK'
  | 'AUTH_LOGOUT'
  | 'KEY_REGISTERED'
  | 'KEY_REJECTED'
  | 'KEY_RENAMED'
  | 'KEY_REMOVED'
  | 'ENROLLMENT_CODE_REJECTED'
  | 'PROFILE_CREATED'
  | 'PROFILE_UPDATED'
  | 'PROFILE_DELETED'
  | 'PROFILE_URL_REJECTED'
  | 'PROFILE_RUNTIME_UNAVAILABLE'
  | 'PROFILE_STARTED'
  | 'PROFILE_SUSPENDED'
  | 'PROFILE_STOPPED'
  | 'PROFILE_RUNTIME_FAILED'
  | 'STREAM_OPENED'
  | 'STREAM_DENIED'
  | 'STREAM_TAKEOVER'
  | 'POLICY_UPDATED'
  | 'SESSION_REVOKED';

/**
 * Registra evento SEM conteúdo: nada de URL com query, token, cookie, QR ou
 * mensagem. `metadata` aceita só valores escalares curtos.
 */
export async function audit(
  ctx: AppContext,
  req: FastifyRequest | null,
  event: { ownerId: string | null; code: AuditCode; result: 'SUCCESS' | 'DENIED' | 'FAILURE'; targetProfileId?: string | null; metadata?: Record<string, string | number | boolean | null> },
): Promise<void> {
  const metadata: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(event.metadata ?? {})) {
    metadata[k] = typeof v === 'string' ? v.slice(0, 120) : v;
  }
  try {
    await ctx.prisma.auditEvent.create({
      data: {
        ownerId: event.ownerId,
        eventCode: event.code,
        result: event.result,
        targetProfileId: event.targetProfileId ?? null,
        ipMasked: maskIp(req?.ip),
        traceId: req?.id ? String(req.id) : 'system',
        metadata: metadata as Prisma.InputJsonValue,
        createdAt: ctx.now(),
      },
    });
  } catch (error) {
    // Auditoria não pode derrubar a requisição, mas a falha precisa aparecer no log.
    req?.log.error({ err: error, code: event.code }, 'falha ao gravar auditoria');
  }
}
