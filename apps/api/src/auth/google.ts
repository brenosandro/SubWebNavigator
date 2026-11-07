import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AppContext } from '../context.js';
import { encryptField, hmac, randomToken, safeEqual, sha256 } from '../lib/crypto.js';
import { audit } from '../services/audit.js';
import { createSession } from './session.js';

/**
 * Google OIDC (Authorization Code + PKCE + nonce). Nenhum token vai na URL do
 * front: o callback grava o cookie de sessão (estágio MFA_PENDING) e redireciona
 * para a etapa da chave de segurança.
 */

const OAUTH_COOKIE = 'swn_oauth';
const OAUTH_COOKIE_PATH = '/api/auth/google';
const STATE_TTL_MS = 10 * 60_000;
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

type OAuthCookie = { state: string; nonce: string; verifier: string; returnTo: string; iat: number };

function stateSecret(ctx: AppContext): string {
  // Em produção OAUTH_STATE_SECRET é obrigatório (config.ts); em dev derivamos da chave de dados.
  return ctx.config.OAUTH_STATE_SECRET ?? sha256(`oauth-state:${ctx.dataKey.toString('base64')}`);
}

/** Só caminhos internos do app: evita open redirect. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/app';
  const v = value.trim();
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\') || v.length > 200) return '/app';
  if (/[\r\n]/.test(v) || v.startsWith('/api')) return '/app';
  return v;
}

function sealCookie(ctx: AppContext, payload: OAuthCookie): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${hmac(stateSecret(ctx), body)}`;
}

function openCookie(ctx: AppContext, raw: string | undefined): OAuthCookie | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  if (!safeEqual(raw.slice(dot + 1), hmac(stateSecret(ctx), body))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthCookie;
    if (ctx.now().getTime() - parsed.iat > STATE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function redirectError(ctx: AppContext, reply: FastifyReply, code: string) {
  return reply.redirect(`${ctx.config.APP_ORIGIN}/login?erro=${encodeURIComponent(code)}`, 302);
}

type GoogleIdentity = { sub: string; email: string; emailVerified: boolean; name: string; picture?: string; nonce?: string };

async function exchangeWithGoogle(ctx: AppContext, code: string, verifier: string): Promise<GoogleIdentity> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = ctx.config;
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID!,
      client_secret: GOOGLE_CLIENT_SECRET!,
      redirect_uri: GOOGLE_CALLBACK_URL!,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}`);
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error('id_token ausente');
  const { payload } = await jwtVerify(json.id_token, googleJwks, { issuer: GOOGLE_ISSUERS, audience: GOOGLE_CLIENT_ID! });
  return {
    sub: String(payload.sub ?? ''),
    email: String(payload.email ?? '').trim().toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: String(payload.name ?? payload.email ?? 'Titular'),
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined,
  };
}

/**
 * Autoriza a identidade Google como titular. MVP de titular único:
 * - identidade já cadastrada (hash do `sub`) continua precisando estar na allowlist;
 * - a primeira entrada de um e-mail/sub da allowlist cria o titular;
 * - existindo titular, qualquer outro `sub` é negado (mesmo com e-mail listado).
 */
export async function resolveOwner(ctx: AppContext, identity: { sub: string; email: string; name: string; picture?: string }) {
  const { OWNER_GOOGLE_EMAILS, OWNER_GOOGLE_SUBS } = ctx.config;
  const allowed = OWNER_GOOGLE_SUBS.includes(identity.sub) || OWNER_GOOGLE_EMAILS.map((e) => e.toLowerCase()).includes(identity.email);
  if (!allowed) return null;
  const subjectHash = sha256(`google|${identity.sub}`);
  const existing = await ctx.prisma.owner.findUnique({ where: { externalSubjectHash: subjectHash } });
  const avatarUrl = identity.picture && /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i.test(identity.picture) ? identity.picture : null;
  if (existing) {
    return ctx.prisma.owner.update({ where: { id: existing.id }, data: { name: identity.name.slice(0, 120), avatarUrl, lastSeenAt: ctx.now() } });
  }
  if ((await ctx.prisma.owner.count()) > 0) return null;
  const id = crypto.randomUUID();
  return ctx.prisma.owner.create({
    data: {
      id,
      externalSubjectHash: subjectHash,
      emailEncrypted: encryptField(ctx.dataKey, identity.email, `owner:${id}:email`),
      name: identity.name.slice(0, 120),
      avatarUrl,
    },
  });
}

export function registerGoogleRoutes(app: FastifyInstance, ctx: AppContext) {
  const rateLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.get('/api/auth/google/start', rateLimit, async (req: FastifyRequest<{ Querystring: { returnTo?: string } }>, reply) => {
    if (!ctx.config.googleEnabled) return redirectError(ctx, reply, 'config');
    const verifier = randomToken(32);
    const cookie: OAuthCookie = { state: randomToken(16), nonce: randomToken(16), verifier, returnTo: safeReturnTo(req.query.returnTo), iat: ctx.now().getTime() };
    reply.setCookie(OAUTH_COOKIE, sealCookie(ctx, cookie), {
      httpOnly: true,
      // Lax: o retorno do Google é navegação top-level vinda de outro site.
      sameSite: 'lax',
      secure: ctx.config.APP_ORIGIN.startsWith('https://'),
      path: OAUTH_COOKIE_PATH,
      maxAge: STATE_TTL_MS / 1000,
    });
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const params = new URLSearchParams({
      client_id: ctx.config.GOOGLE_CLIENT_ID!,
      redirect_uri: ctx.config.GOOGLE_CALLBACK_URL!,
      response_type: 'code',
      scope: 'openid email profile',
      state: cookie.state,
      nonce: cookie.nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return reply.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`, 302);
  });

  app.get('/api/auth/google/callback', rateLimit, async (req: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>, reply) => {
    const stored = openCookie(ctx, req.cookies[OAUTH_COOKIE]);
    reply.clearCookie(OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH });
    if (!ctx.config.googleEnabled && !ctx.googleExchange) return redirectError(ctx, reply, 'config');
    if (req.query.error) return redirectError(ctx, reply, 'google');
    if (!stored || typeof req.query.state !== 'string' || !safeEqual(req.query.state, stored.state)) return redirectError(ctx, reply, 'estado_invalido');
    if (typeof req.query.code !== 'string' || !req.query.code) return redirectError(ctx, reply, 'google');

    let identity: GoogleIdentity;
    try {
      identity = await (ctx.googleExchange ?? ((c, v) => exchangeWithGoogle(ctx, c, v)))(req.query.code, stored.verifier);
    } catch (error) {
      req.log.warn({ err: error instanceof Error ? error.message : 'erro' }, 'falha na troca de código Google');
      return redirectError(ctx, reply, 'google');
    }
    if (!identity.nonce || !safeEqual(identity.nonce, stored.nonce)) return redirectError(ctx, reply, 'estado_invalido');
    if (!identity.sub || !identity.email) return redirectError(ctx, reply, 'google');
    if (!identity.emailVerified) return redirectError(ctx, reply, 'email_nao_verificado');

    const owner = await resolveOwner(ctx, identity);
    if (!owner) {
      // Mensagem neutra: não revela se o e-mail existe ou se há titular.
      await audit(ctx, req, { ownerId: null, code: 'AUTH_GOOGLE_DENIED', result: 'DENIED', metadata: { emailDomain: identity.email.split('@')[1] ?? null } });
      return redirectError(ctx, reply, 'acesso_negado');
    }
    await createSession(ctx, req, reply, owner.id);
    await audit(ctx, req, { ownerId: owner.id, code: 'AUTH_GOOGLE_LOGIN', result: 'SUCCESS' });
    return reply.redirect(`${ctx.config.APP_ORIGIN}/entrar/chave?returnTo=${encodeURIComponent(stored.returnTo)}`, 302);
  });

  // Atalho só de desenvolvimento (bloqueado em produção por config.ts).
  app.post('/api/auth/dev-login', rateLimit, async (req, reply) => {
    if (!ctx.config.devLoginEnabled || !ctx.config.DEV_LOGIN_EMAIL) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Não encontrado.', traceId: req.id });
    const email = ctx.config.DEV_LOGIN_EMAIL.toLowerCase();
    const owner = await resolveOwner(
      { ...ctx, config: { ...ctx.config, OWNER_GOOGLE_EMAILS: [email] } },
      { sub: `dev:${email}`, email, name: 'Titular (desenvolvimento)' },
    );
    if (!owner) return reply.code(403).send({ code: 'ACCESS_DENIED', message: 'Já existe outro titular cadastrado.', traceId: req.id });
    await createSession(ctx, req, reply, owner.id);
    await audit(ctx, req, { ownerId: owner.id, code: 'AUTH_GOOGLE_LOGIN', result: 'SUCCESS', metadata: { dev: true } });
    return reply.code(204).send();
  });
}
