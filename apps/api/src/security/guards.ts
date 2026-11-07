import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AppContext } from '../context.js';
import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF (S-016, S-033): cookie SameSite=Strict + cabeçalho próprio obrigatório
 * (força preflight cross-origin, e o CORS está fechado) + Origin/Sec-Fetch-Site.
 */
export function assertCsrf(ctx: AppContext, req: FastifyRequest) {
  if (SAFE_METHODS.has(req.method)) return;
  if (req.headers['x-swn-csrf'] !== '1') throw new AppError('CSRF', 'Requisição recusada (CSRF).');
  const origin = req.headers.origin;
  if (origin && origin !== new URL(ctx.config.APP_ORIGIN).origin) throw new AppError('CSRF', 'Origem não permitida.');
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') throw new AppError('CSRF', 'Origem não permitida.');
}

/**
 * Cloudflare Access na borda + validação independente no origin (TH-03, S-001..S-004).
 * Valida assinatura (JWKS do time), issuer, audience e expiração.
 */
export function createAccessVerifier(ctx: AppContext, jwks?: JWTVerifyGetKey) {
  if (!ctx.config.ENFORCE_ACCESS_JWT) return null;
  const team = ctx.config.CF_ACCESS_TEAM_DOMAIN!.replace(/\/$/, '');
  const keys = jwks ?? createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
  return async (req: FastifyRequest) => {
    const token = req.headers['cf-access-jwt-assertion'];
    if (typeof token !== 'string' || !token) throw new AppError('ACCESS_DENIED', 'Acesso negado.');
    try {
      await jwtVerify(token, keys, { issuer: team, audience: ctx.config.CF_ACCESS_AUDIENCE!, algorithms: ['RS256'] });
    } catch {
      throw new AppError('ACCESS_DENIED', 'Acesso negado.');
    }
  };
}
