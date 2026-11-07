import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { AppContext } from '../context.js';
import { AppError } from '../lib/errors.js';
import { sha256 } from '../lib/crypto.js';
import { audit } from '../services/audit.js';
import { activateSession, assertStepUp, ownerHasKey, requireSession, serializeSession, sessionOf, type LoadedSession } from './session.js';

/**
 * Chave de segurança WebAuthn: segundo fator obrigatório, desbloqueio e step-up.
 *
 * Exigência de hardware: recusamos credenciais `multiDevice`/`backedUp` (passkeys
 * sincronizadas em nuvem). As flags são declaradas pelo autenticador; garantia
 * forte de modelo exige atestação + FIDO MDS (registrado como risco residual).
 */

const CHALLENGE_TTL_MS = 2 * 60_000;
const TRANSPORTS = new Set(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']);

const PurposeSchema = z.object({ purpose: z.enum(['login', 'unlock', 'step-up']) });
const RegisterOptionsSchema = z.object({ enrollmentCode: z.string().trim().max(64).optional() }).strict();
const LabelSchema = z.string().trim().min(1).max(60).default('Chave de segurança');

const STAGE_FOR_PURPOSE = { login: 'MFA_PENDING', unlock: 'LOCKED', 'step-up': 'ACTIVE' } as const;

async function storeChallenge(ctx: AppContext, sessionId: string, challenge: string, purpose: string) {
  await ctx.prisma.authSession.update({
    where: { id: sessionId },
    data: { challenge, challengePurpose: purpose, challengeExpiresAt: new Date(ctx.now().getTime() + CHALLENGE_TTL_MS) },
  });
}

/** Desafio de uso único: consumido antes da verificação (S-042, sem replay). */
async function consumeChallenge(ctx: AppContext, session: LoadedSession, purposePrefix: string): Promise<{ challenge: string; purpose: string }> {
  const { challenge, challengePurpose, challengeExpiresAt } = session;
  await ctx.prisma.authSession.update({ where: { id: session.id }, data: { challenge: null, challengePurpose: null, challengeExpiresAt: null } });
  if (!challenge || !challengePurpose || !challengeExpiresAt || !challengePurpose.startsWith(purposePrefix) || challengeExpiresAt.getTime() < ctx.now().getTime()) {
    throw new AppError('WEBAUTHN_FAILED', 'O desafio expirou. Tente novamente.');
  }
  return { challenge, purpose: challengePurpose };
}

async function findEnrollmentCode(ctx: AppContext, ownerId: string, code: string | undefined) {
  if (!code) return null;
  const row = await ctx.prisma.enrollmentCode.findUnique({ where: { codeHash: sha256(code.replace(/[\s-]/g, '').toUpperCase()) } });
  if (!row || row.usedAt || row.expiresAt.getTime() < ctx.now().getTime()) return null;
  if (row.ownerId && row.ownerId !== ownerId) return null;
  return row;
}

export function registerWebAuthnRoutes(app: FastifyInstance, ctx: AppContext) {
  const rp = { rpID: ctx.config.WEBAUTHN_RP_ID, origin: ctx.config.webauthnOrigin };
  const limited = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  // ── Cadastro ──────────────────────────────────────────────────────────────
  app.post('/api/auth/webauthn/register/options', { ...limited, preHandler: requireSession(ctx, ['MFA_PENDING', 'ACTIVE']) }, async (req) => {
    const session = sessionOf(req);
    const body = RegisterOptionsSchema.parse(req.body ?? {});
    const hasKey = await ownerHasKey(ctx, session.ownerId);
    let purpose: string;

    if (session.stage === 'MFA_PENDING') {
      // Primeira chave: só com o código gerado no servidor (ou modo dev explícito).
      if (hasKey) throw new AppError('FORBIDDEN', 'Já existe chave cadastrada: entre com ela.');
      if (ctx.config.WEBAUTHN_DEV_OPEN_ENROLLMENT) {
        purpose = 'register:dev';
      } else {
        const code = await findEnrollmentCode(ctx, session.ownerId, body.enrollmentCode);
        if (!code) {
          await audit(ctx, req, { ownerId: session.ownerId, code: 'ENROLLMENT_CODE_REJECTED', result: 'DENIED' });
          throw new AppError('ENROLLMENT_CODE_INVALID', 'Código de cadastro inválido ou expirado.');
        }
        purpose = `register:code:${code.id}`;
      }
    } else {
      // Chave adicional: exige prova recente com uma chave já cadastrada.
      assertStepUp(ctx, session);
      purpose = 'register:extra';
    }

    const existing = await ctx.prisma.webAuthnCredential.findMany({ where: { ownerId: session.ownerId, revokedAt: null } });
    const options = await generateRegistrationOptions({
      rpName: ctx.config.WEBAUTHN_RP_NAME,
      rpID: rp.rpID,
      userID: new TextEncoder().encode(session.ownerId),
      userName: session.owner.name,
      userDisplayName: session.owner.name,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports.filter((t) => TRANSPORTS.has(t)) as AuthenticatorTransportFuture[] })),
      authenticatorSelection: { authenticatorAttachment: 'cross-platform', residentKey: 'discouraged', userVerification: 'preferred' },
      preferredAuthenticatorType: 'securityKey',
      timeout: CHALLENGE_TTL_MS,
    });
    await storeChallenge(ctx, session.id, options.challenge, purpose);
    return options;
  });

  app.post('/api/auth/webauthn/register/verify', { ...limited, preHandler: requireSession(ctx, ['MFA_PENDING', 'ACTIVE']) }, async (req, reply) => {
    const session = sessionOf(req);
    const body = z.object({ response: z.record(z.string(), z.unknown()), label: LabelSchema.optional() }).parse(req.body ?? {});
    const { challenge, purpose } = await consumeChallenge(ctx, session, 'register:');
    if (session.stage === 'ACTIVE') assertStepUp(ctx, session);

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body.response as unknown as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: false,
      });
    } catch (error) {
      await audit(ctx, req, { ownerId: session.ownerId, code: 'KEY_REJECTED', result: 'FAILURE', metadata: { reason: 'verify' } });
      req.log.warn({ err: error instanceof Error ? error.message : 'erro' }, 'falha ao verificar cadastro WebAuthn');
      throw new AppError('WEBAUTHN_FAILED', 'Não foi possível validar a chave de segurança.');
    }
    if (!verification.verified) throw new AppError('WEBAUTHN_FAILED', 'Não foi possível validar a chave de segurança.');
    const info = verification.registrationInfo;

    if (ctx.config.ENFORCE_HARDWARE_WEBAUTHN && (info.credentialDeviceType !== 'singleDevice' || info.credentialBackedUp)) {
      await audit(ctx, req, { ownerId: session.ownerId, code: 'KEY_REJECTED', result: 'DENIED', metadata: { reason: 'synced_passkey' } });
      throw new AppError('HARDWARE_KEY_REQUIRED', 'Use uma chave de segurança física. Passkeys sincronizadas (celular, gerenciador de senhas) não são aceitas.');
    }

    // Consome o código de cadastro (uso único) antes de gravar a chave.
    if (purpose.startsWith('register:code:')) {
      const codeId = purpose.slice('register:code:'.length);
      const consumed = await ctx.prisma.enrollmentCode.updateMany({ where: { id: codeId, usedAt: null, expiresAt: { gt: ctx.now() } }, data: { usedAt: ctx.now(), ownerId: session.ownerId } });
      if (consumed.count !== 1) throw new AppError('ENROLLMENT_CODE_INVALID', 'Código de cadastro inválido ou expirado.');
    }

    const credential = await ctx.prisma.webAuthnCredential.create({
      data: {
        ownerId: session.ownerId,
        credentialId: info.credential.id,
        publicKey: Buffer.from(info.credential.publicKey),
        counter: BigInt(info.credential.counter),
        transports: (info.credential.transports ?? []).filter((t) => TRANSPORTS.has(t)),
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        aaguid: info.aaguid,
        label: body.label ?? 'Chave de segurança',
      },
    });
    await audit(ctx, req, { ownerId: session.ownerId, code: 'KEY_REGISTERED', result: 'SUCCESS', metadata: { keyId: credential.id, aaguid: info.aaguid } });

    let current = session;
    if (session.stage === 'MFA_PENDING') {
      const activated = await activateSession(ctx, reply, session, { extendSession: true });
      current = { ...activated, owner: session.owner };
      await audit(ctx, req, { ownerId: session.ownerId, code: 'AUTH_MFA_SUCCESS', result: 'SUCCESS', metadata: { via: 'enrollment' } });
    }
    return { session: await serializeSession(ctx, current) };
  });

  // ── Autenticação: login (2º fator), desbloqueio e step-up ──────────────────
  app.post('/api/auth/webauthn/authenticate/options', { ...limited, preHandler: requireSession(ctx, ['MFA_PENDING', 'LOCKED', 'ACTIVE']) }, async (req) => {
    const session = sessionOf(req);
    const { purpose } = PurposeSchema.parse(req.body ?? {});
    if (session.stage !== STAGE_FOR_PURPOSE[purpose]) throw new AppError('FORBIDDEN', 'Operação incompatível com o estado da sessão.');
    const creds = await ctx.prisma.webAuthnCredential.findMany({ where: { ownerId: session.ownerId, revokedAt: null } });
    if (creds.length === 0) throw new AppError('FORBIDDEN', 'Nenhuma chave de segurança cadastrada.');
    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      allowCredentials: creds.map((c) => ({ id: c.credentialId, transports: c.transports.filter((t) => TRANSPORTS.has(t)) as AuthenticatorTransportFuture[] })),
      userVerification: 'preferred',
      timeout: CHALLENGE_TTL_MS,
    });
    await storeChallenge(ctx, session.id, options.challenge, `auth:${purpose}`);
    return options;
  });

  app.post('/api/auth/webauthn/authenticate/verify', { ...limited, preHandler: requireSession(ctx, ['MFA_PENDING', 'LOCKED', 'ACTIVE']) }, async (req, reply) => {
    const session = sessionOf(req);
    const body = z.object({ response: z.record(z.string(), z.unknown()) }).parse(req.body ?? {});
    const { challenge, purpose: stored } = await consumeChallenge(ctx, session, 'auth:');
    const purpose = stored.slice('auth:'.length) as keyof typeof STAGE_FOR_PURPOSE;
    if (session.stage !== STAGE_FOR_PURPOSE[purpose]) throw new AppError('FORBIDDEN', 'Operação incompatível com o estado da sessão.');

    const response = body.response as unknown as AuthenticationResponseJSON;
    const credential = typeof response.id === 'string' ? await ctx.prisma.webAuthnCredential.findUnique({ where: { credentialId: response.id } }) : null;
    // Chave de outro titular ou revogada: mesma resposta neutra.
    if (!credential || credential.ownerId !== session.ownerId || credential.revokedAt) {
      await audit(ctx, req, { ownerId: session.ownerId, code: 'AUTH_MFA_FAILED', result: 'DENIED', metadata: { purpose, reason: 'unknown_key' } });
      throw new AppError('WEBAUTHN_FAILED', 'Chave de segurança não reconhecida.');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        credential: { id: credential.credentialId, publicKey: new Uint8Array(credential.publicKey), counter: Number(credential.counter), transports: credential.transports as AuthenticatorTransportFuture[] },
        requireUserVerification: false,
      });
    } catch (error) {
      req.log.warn({ err: error instanceof Error ? error.message : 'erro' }, 'falha ao verificar autenticação WebAuthn');
      verification = null;
    }
    if (!verification?.verified) {
      await audit(ctx, req, { ownerId: session.ownerId, code: 'AUTH_MFA_FAILED', result: 'FAILURE', metadata: { purpose } });
      throw new AppError('WEBAUTHN_FAILED', 'Não foi possível validar a chave de segurança.');
    }
    const info = verification.authenticationInfo;
    if (ctx.config.ENFORCE_HARDWARE_WEBAUTHN && (info.credentialDeviceType !== 'singleDevice' || info.credentialBackedUp)) {
      await audit(ctx, req, { ownerId: session.ownerId, code: 'AUTH_MFA_FAILED', result: 'DENIED', metadata: { purpose, reason: 'synced_passkey' } });
      throw new AppError('HARDWARE_KEY_REQUIRED', 'Esta credencial passou a ser sincronizada e não é mais aceita. Use uma chave física.');
    }
    await ctx.prisma.webAuthnCredential.update({ where: { id: credential.id }, data: { counter: BigInt(info.newCounter), lastUsedAt: ctx.now() } });

    let current: LoadedSession = session;
    if (purpose === 'step-up') {
      const updated = await ctx.prisma.authSession.update({ where: { id: session.id }, data: { stepUpAt: ctx.now() } });
      current = { ...updated, owner: session.owner };
      await audit(ctx, req, { ownerId: session.ownerId, code: 'AUTH_STEP_UP', result: 'SUCCESS' });
    } else {
      const activated = await activateSession(ctx, reply, session, { extendSession: purpose === 'login' });
      current = { ...activated, owner: session.owner };
      await audit(ctx, req, { ownerId: session.ownerId, code: purpose === 'login' ? 'AUTH_MFA_SUCCESS' : 'AUTH_UNLOCK', result: 'SUCCESS' });
    }
    return { session: await serializeSession(ctx, current) };
  });
}
