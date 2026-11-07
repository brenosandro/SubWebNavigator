import { z } from 'zod';

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase())));

const list = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().positive().default(3460),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL obrigatório'),
  /** Origem pública do app (a mesma do navegador). Usada em CSRF, redirects e WebAuthn. */
  APP_ORIGIN: z.string().url().default('http://localhost:5180'),
  /** false | true | número de proxies confiáveis à frente (produção: 2 = cloudflared + nginx). */
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v): boolean | number => {
      const t = (v ?? '').trim().toLowerCase();
      if (/^d+$/.test(t)) return Number(t);
      return ['1', 'true', 'yes', 'on'].includes(t);
    }),

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_CALLBACK_URL: optionalString,
  /** Allowlist do titular. O primeiro login de um e-mail listado cria o Owner. */
  OWNER_GOOGLE_EMAILS: list,
  /** Opcional e mais forte: `sub` do Google aceitos. */
  OWNER_GOOGLE_SUBS: list,
  OAUTH_STATE_SECRET: optionalString,

  WEBAUTHN_RP_ID: z.string().default('localhost'),
  WEBAUTHN_RP_NAME: z.string().default('SubWebNavigator'),
  WEBAUTHN_RP_ORIGIN: optionalString,
  /** Recusa passkeys sincronizadas (multiDevice/backedUp): exige chave física. */
  ENFORCE_HARDWARE_WEBAUTHN: bool(true),
  /** Só desenvolvimento: dispensa o código de cadastro da primeira chave. */
  WEBAUTHN_DEV_OPEN_ENROLLMENT: bool(false),

  /** 32 bytes em base64 — cifra campos sensíveis (e-mail). */
  DATA_ENCRYPTION_KEY: z.string().min(1, 'DATA_ENCRYPTION_KEY obrigatório (32 bytes base64)'),

  SESSION_MAX_HOURS: z.coerce.number().int().min(1).max(24).default(12),
  MFA_PENDING_MINUTES: z.coerce.number().int().min(2).max(30).default(10),
  STEP_UP_MINUTES: z.coerce.number().int().min(1).max(5).default(5),
  DEFAULT_IDLE_MINUTES: z.coerce.number().int().default(5),
  MAX_IDLE_MINUTES: z.coerce.number().int().default(30),
  DEFAULT_VIEWER_ABSOLUTE_MINUTES: z.coerce.number().int().default(30),
  MAX_VIEWER_ABSOLUTE_MINUTES: z.coerce.number().int().default(60),

  /** Cloudflare Access: valida o JWT do Access em TODA requisição. */
  ENFORCE_ACCESS_JWT: bool(false),
  CF_ACCESS_TEAM_DOMAIN: optionalString,
  CF_ACCESS_AUDIENCE: optionalString,

  /** Só desenvolvimento: login sem Google para este e-mail. Nunca em produção. */
  DEV_LOGIN_EMAIL: optionalString,

  /** Runtime remoto (P3): controller de workers (HMAC) e relay da rede dos workers. */
  CONTROLLER_URL: optionalString,
  CONTROLLER_SECRET: optionalString,
  RELAY_URL: z.string().default('ws://127.0.0.1:7460'),
  STREAM_TICKET_TTL_SECONDS: z.coerce.number().int().min(5).max(30).default(30),
  STREAM_AUTH_RECHECK_SECONDS: z.coerce.number().int().min(1).max(10).default(5),

  /** Resolve DNS do host ao cadastrar perfil e recusa IP privado. */
  URL_POLICY_RESOLVE_DNS: bool(true),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  webauthnOrigin: string;
  googleEnabled: boolean;
  devLoginEnabled: boolean;
  isProduction: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${msg}`);
  }
  const c = parsed.data;
  const isProduction = c.NODE_ENV === 'production';

  if (isProduction) {
    // Fail-closed: em produção, nada de atalhos de desenvolvimento.
    if (c.DEV_LOGIN_EMAIL) throw new Error('DEV_LOGIN_EMAIL não pode ser usado em produção.');
    if (c.WEBAUTHN_DEV_OPEN_ENROLLMENT) throw new Error('WEBAUTHN_DEV_OPEN_ENROLLMENT não pode ser usado em produção.');
    if (!c.ENFORCE_HARDWARE_WEBAUTHN) throw new Error('ENFORCE_HARDWARE_WEBAUTHN deve ser true em produção.');
    if (!c.APP_ORIGIN.startsWith('https://')) throw new Error('APP_ORIGIN deve usar HTTPS em produção.');
    if (!c.OAUTH_STATE_SECRET || c.OAUTH_STATE_SECRET.length < 32) throw new Error('OAUTH_STATE_SECRET (>= 32 caracteres) obrigatório em produção.');
  }
  if (c.ENFORCE_ACCESS_JWT && (!c.CF_ACCESS_TEAM_DOMAIN || !c.CF_ACCESS_AUDIENCE)) {
    throw new Error('ENFORCE_ACCESS_JWT exige CF_ACCESS_TEAM_DOMAIN e CF_ACCESS_AUDIENCE.');
  }
  if (c.CONTROLLER_URL && (!c.CONTROLLER_SECRET || c.CONTROLLER_SECRET.length < 32)) throw new Error('CONTROLLER_URL exige CONTROLLER_SECRET (>= 32 caracteres).');
  const key = Buffer.from(c.DATA_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY deve ter exatamente 32 bytes em base64.');

  return {
    ...c,
    webauthnOrigin: c.WEBAUTHN_RP_ORIGIN ?? c.APP_ORIGIN,
    googleEnabled: Boolean(c.GOOGLE_CLIENT_ID && c.GOOGLE_CLIENT_SECRET && c.GOOGLE_CALLBACK_URL),
    devLoginEnabled: !isProduction && Boolean(c.DEV_LOGIN_EMAIL),
    isProduction,
  };
}
