import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import type { AppContext } from './context.js';
import { AppError } from './lib/errors.js';
import { assertCsrf, createAccessVerifier } from './security/guards.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerGoogleRoutes } from './auth/google.js';
import { registerWebAuthnRoutes } from './auth/webauthn.js';
import { registerProfileRoutes } from './modules/profiles.js';
import { registerSecurityRoutes } from './modules/security.js';
import { registerStreamRoutes } from './runtime/stream-routes.js';

/** Campos que nunca podem aparecer em log (S-029). */
const REDACT = ['req.headers.cookie', 'req.headers.authorization', 'req.headers["cf-access-jwt-assertion"]', 'res.headers["set-cookie"]'];

export async function buildApp(ctx: AppContext, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: ctx.config.isProduction ? 'info' : 'debug',
            redact: { paths: REDACT, censor: '[redigido]' },
            // Só método e caminho: a query pode trazer `code`/`state` do OAuth.
            serializers: { req: (req) => ({ method: req.method, path: String(req.url).split('?')[0] }) },
          },
    // Número = confia só nos N saltos mais próximos (cloudflared + nginx): o
    // X-Forwarded-For forjado pelo cliente fica além deles e é ignorado.
    trustProxy: typeof ctx.config.TRUST_PROXY === 'number' ? ((hops) => (_addr: string, i: number) => i < hops)(ctx.config.TRUST_PROXY) : ctx.config.TRUST_PROXY,
    bodyLimit: 64 * 1024,
    genReqId: () => randomUUID(),
  });

  // JSON vazio vira {} (ações como /lock e /start não têm corpo); JSON inválido continua 400.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = String(body);
    if (text.trim() === '') return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch {
      done(Object.assign(new Error('JSON inválido'), { statusCode: 400 }), undefined);
    }
  });

  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: 'same-origin' } });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (req) => ({ statusCode: 429, code: 'RATE_LIMITED', message: 'Muitas requisições. Aguarde um pouco.', traceId: String(req.id) }),
  });

  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });

  const verifyAccess = createAccessVerifier(ctx);

  app.addHook('onRequest', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    reply.header('x-trace-id', String(req.id));
    if (req.url === '/api/health/live') return;
    if (verifyAccess) await verifyAccess(req);
    assertCsrf(ctx, req);
  });

  app.setErrorHandler((error, req, reply) => {
    const traceId = String(req.id);
    if (error instanceof AppError) {
      return reply.code(error.status).send({ code: error.code, message: error.message, traceId, ...(error.issues ? { issues: error.issues } : {}) });
    }
    if (error instanceof ZodError) {
      const issues = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return reply.code(400).send({ code: 'VALIDATION', message: issues[0]?.message ?? 'Dados inválidos.', traceId, issues });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) return reply.code(429).send({ code: 'RATE_LIMITED', message: 'Muitas requisições. Aguarde um pouco.', traceId });
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ code: 'VALIDATION', message: 'Requisição inválida.', traceId });
    }
    req.log.error({ err: error }, 'erro não tratado');
    // Sem stacktrace para o cliente.
    return reply.code(500).send({ code: 'INTERNAL', message: 'Erro interno.', traceId });
  });

  app.setNotFoundHandler((req, reply) => reply.code(404).send({ code: 'NOT_FOUND', message: 'Não encontrado.', traceId: String(req.id) }));

  app.get('/api/health/live', async () => ({ ok: true }));

  registerAuthRoutes(app, ctx);
  registerGoogleRoutes(app, ctx);
  registerWebAuthnRoutes(app, ctx);
  registerProfileRoutes(app, ctx);
  registerSecurityRoutes(app, ctx);
  registerStreamRoutes(app, ctx);

  return app;
}
