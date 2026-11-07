/**
 * Integração ponta a ponta da API contra um Postgres de TESTE (dados sintéticos).
 * Requer TEST_DATABASE_URL apontando para um banco descartável com as migrations.
 *   npm run test:integration -w @subweb/api
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import type { AppContext } from './context.js';
import { sha256 } from './lib/crypto.js';
import { SoftAuthenticator } from './test/soft-authenticator.js';
import { StreamHub } from './runtime/stream-hub.js';

const DB = process.env.TEST_DATABASE_URL;
const ORIGIN = 'http://localhost:5180';
const OWNER_EMAIL = 'titular@example.com';

describe('API SubWebNavigator (integração)', { skip: !DB && 'TEST_DATABASE_URL ausente' }, () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let clock = new Date('2026-11-06T12:00:00Z').getTime();
  const advance = (minutes: number) => (clock += minutes * 60_000);
  let googleIdentity = { sub: 'google-sub-1', email: OWNER_EMAIL, emailVerified: true, name: 'Titular Teste', nonce: '' };

  const hardware = new SoftAuthenticator('localhost', ORIGIN);
  const synced = new SoftAuthenticator('localhost', ORIGIN, true);

  before(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB! } } });
    await prisma.$executeRawUnsafe('TRUNCATE "AuditEvent","EnrollmentCode","WebAuthnCredential","AuthSession","BrowserProfile","SecurityPolicy","Owner" CASCADE');
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: DB!,
      APP_ORIGIN: ORIGIN,
      DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
      GOOGLE_CLIENT_ID: 'test-client',
      GOOGLE_CLIENT_SECRET: 'test-secret',
      GOOGLE_CALLBACK_URL: `${ORIGIN}/api/auth/google/callback`,
      OWNER_GOOGLE_EMAILS: OWNER_EMAIL,
      WEBAUTHN_RP_ID: 'localhost',
    });
    const ctx: AppContext = {
      config,
      prisma,
      now: () => new Date(clock),
      dataKey: Buffer.from(config.DATA_ENCRYPTION_KEY, 'base64'),
      dnsResolver: async (host) => (host.endsWith('rebind.example.net') ? ['10.0.0.7'] : ['93.184.216.34']),
      googleExchange: async () => googleIdentity,
      streamHub: new StreamHub(),
    };
    app = await buildApp(ctx, { logger: false });
  });

  after(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  const sessionCookie = (res: LightMyRequestResponse) => res.cookies.find((c) => c.name === 'swn_session')?.value;
  async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, opts: { cookie?: string; body?: unknown; csrf?: boolean; origin?: string } = {}) {
    const headers: Record<string, string> = { origin: opts.origin ?? ORIGIN };
    if (opts.csrf !== false) headers['x-swn-csrf'] = '1';
    if (opts.cookie) headers.cookie = `swn_session=${opts.cookie}`;
    return app.inject({ method, url, headers, ...(opts.body !== undefined ? { payload: opts.body as object } : {}) });
  }

  async function googleLogin(): Promise<{ res: LightMyRequestResponse; cookie?: string }> {
    const start = await app.inject({ method: 'GET', url: '/api/auth/google/start?returnTo=/app' });
    const location = new URL(start.headers.location as string);
    const oauth = start.cookies.find((c) => c.name === 'swn_oauth')!.value;
    googleIdentity = { ...googleIdentity, nonce: location.searchParams.get('nonce')! };
    const res = await app.inject({ method: 'GET', url: `/api/auth/google/callback?code=abc&state=${location.searchParams.get('state')}`, headers: { cookie: `swn_oauth=${oauth}` } });
    return { res, cookie: sessionCookie(res) };
  }

  async function prove(cookie: string, purpose: 'login' | 'unlock' | 'step-up', auth = hardware) {
    const opts = await call('POST', '/api/auth/webauthn/authenticate/options', { cookie, body: { purpose } });
    assert.equal(opts.statusCode, 200, opts.body);
    return call('POST', '/api/auth/webauthn/authenticate/verify', { cookie, body: { response: auth.authenticate(opts.json().challenge) } });
  }

  let cookie = '';
  let profileId = '';

  test('S-001/S-040: sem sessão, nada da API', async () => {
    for (const url of ['/api/v1/profiles', '/api/v1/security-policy', '/api/v1/audit', '/api/auth/session']) {
      const res = await call('GET', url);
      assert.equal(res.statusCode, 401, url);
      assert.equal(res.json().code, 'UNAUTHENTICATED');
    }
  });

  test('S-016/S-033: CSRF sem cabeçalho ou com origem estranha', async () => {
    assert.equal((await call('POST', '/api/auth/logout', { csrf: false })).json().code, 'CSRF');
    assert.equal((await call('POST', '/api/auth/logout', { origin: 'https://evil.example' })).json().code, 'CSRF');
  });

  test('Google: estado inválido e conta fora da allowlist são negados', async () => {
    const bad = await app.inject({ method: 'GET', url: '/api/auth/google/callback?code=abc&state=forjado' });
    assert.match(bad.headers.location as string, /erro=estado_invalido/);

    googleIdentity = { ...googleIdentity, email: 'intruso@example.com', sub: 'google-sub-x' };
    const denied = await googleLogin();
    assert.match(denied.res.headers.location as string, /\/login\?erro=acesso_negado/);
    assert.equal(denied.cookie, undefined);
    googleIdentity = { ...googleIdentity, email: OWNER_EMAIL, sub: 'google-sub-1' };
  });

  test('S-005: Google sem chave não libera a aplicação', async () => {
    const { res, cookie: c } = await googleLogin();
    assert.match(res.headers.location as string, /\/entrar\/chave\?returnTo=%2Fapp$/);
    assert.ok(c);
    cookie = c!;
    const profiles = await call('GET', '/api/v1/profiles', { cookie });
    assert.equal(profiles.statusCode, 403);
    assert.equal(profiles.json().code, 'MFA_REQUIRED');
    const session = (await call('GET', '/api/auth/session', { cookie })).json();
    assert.equal(session.stage, 'MFA_PENDING');
    assert.deepEqual(session.enrollment, { required: true, codeRequired: true });
    assert.equal(session.owner.email, OWNER_EMAIL);
  });

  test('primeira chave exige código de cadastro gerado no servidor', async () => {
    const res = await call('POST', '/api/auth/webauthn/register/options', { cookie, body: { enrollmentCode: 'AAAA-BBBB-CCCC' } });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().code, 'ENROLLMENT_CODE_INVALID');
  });

  test('S-006: passkey sincronizada é recusada; chave física ativa a sessão e gira o cookie', async () => {
    await prisma.enrollmentCode.create({ data: { codeHash: sha256('ABCDEFGH2345'), expiresAt: new Date(clock + 15 * 60_000) } });

    const o1 = await call('POST', '/api/auth/webauthn/register/options', { cookie, body: { enrollmentCode: 'abcd-efgh-2345' } });
    assert.equal(o1.statusCode, 200, o1.body);
    assert.equal(o1.json().authenticatorSelection.authenticatorAttachment, 'cross-platform');
    const rejected = await call('POST', '/api/auth/webauthn/register/verify', { cookie, body: { response: synced.register(o1.json().challenge) } });
    assert.equal(rejected.json().code, 'HARDWARE_KEY_REQUIRED');

    const o2 = await call('POST', '/api/auth/webauthn/register/options', { cookie, body: { enrollmentCode: 'ABCD-EFGH-2345' } });
    const response = hardware.register(o2.json().challenge);
    const ok = await call('POST', '/api/auth/webauthn/register/verify', { cookie, body: { response, label: 'YubiKey' } });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(ok.json().session.stage, 'ACTIVE');
    const rotated = sessionCookie(ok);
    assert.ok(rotated && rotated !== cookie);

    // S-041: o cookie anterior não vale mais.
    assert.equal((await call('GET', '/api/auth/session', { cookie })).statusCode, 401);
    // S-042: desafio é de uso único.
    const replay = await call('POST', '/api/auth/webauthn/register/verify', { cookie: rotated, body: { response } });
    assert.equal(replay.json().code, 'WEBAUTHN_FAILED');
    // Código de cadastro foi consumido.
    assert.equal((await prisma.enrollmentCode.findFirst())?.usedAt instanceof Date, true);
    cookie = rotated!;
  });

  test('S-017/S-019/S-020: validação de perfil', async () => {
    const priv = await call('POST', '/api/v1/profiles', { cookie, body: { title: 'Roteador', startUrl: 'https://192.168.0.1' } });
    assert.equal(priv.json().code, 'URL_REJECTED');
    const rebind = await call('POST', '/api/v1/profiles', { cookie, body: { title: 'Rebind', startUrl: 'https://a.rebind.example.net' } });
    assert.equal(rebind.json().code, 'URL_REJECTED');
    const xss = await call('POST', '/api/v1/profiles', { cookie, body: { title: '<img src=x onerror=alert(1)>', startUrl: 'https://web.whatsapp.com' } });
    assert.equal(xss.json().code, 'VALIDATION');
    const extra = await call('POST', '/api/v1/profiles', { cookie, body: { title: 'X', startUrl: 'https://web.whatsapp.com', ownerId: crypto.randomUUID() } });
    assert.equal(extra.statusCode, 400);

    const ok = await call('POST', '/api/v1/profiles', { cookie, body: { title: 'WhatsApp Pessoal', provider: 'whatsapp', startUrl: 'https://web.whatsapp.com/', group: 'MENSAGENS', colorToken: 'emerald' } });
    assert.equal(ok.statusCode, 201, ok.body);
    assert.equal(ok.json().host, 'web.whatsapp.com');
    assert.equal(ok.json().status, 'STOPPED');
    profileId = ok.json().id;

    const start = await call('POST', `/api/v1/profiles/${profileId}/start`, { cookie });
    assert.equal(start.statusCode, 503);
    assert.equal(start.json().code, 'RUNTIME_NOT_AVAILABLE');
  });

  test('S-010: perfil de outro titular devolve 404 neutro', async () => {
    const other = await prisma.owner.create({ data: { externalSubjectHash: sha256('google|outro'), emailEncrypted: 'x', name: 'Outro' } });
    const foreign = await prisma.browserProfile.create({ data: { ownerId: other.id, title: 'Alheio', provider: 'custom', normalizedStartUrl: 'https://example.org/', host: 'example.org', group: 'PESSOAL', colorToken: 'slate' } });
    assert.equal((await call('GET', `/api/v1/profiles/${foreign.id}`, { cookie })).statusCode, 404);
    assert.equal((await call('PATCH', `/api/v1/profiles/${foreign.id}`, { cookie, body: { title: 'Meu' } })).statusCode, 404);
    assert.equal((await call('POST', '/api/v1/profiles/reorder', { cookie, body: { ids: [profileId, foreign.id] } })).statusCode, 404);
    assert.equal((await call('GET', '/api/v1/profiles', { cookie })).json().length, 1);
  });

  test('step-up: exclusão exige prova recente com a chave', async () => {
    advance(3);
    assert.equal((await call('POST', '/api/auth/activity', { cookie })).statusCode, 204);
    advance(3); // 6 min após a ativação: step-up de 5 min venceu; idle (5 min) não.
    const denied = await call('DELETE', `/api/v1/profiles/${profileId}`, { cookie });
    assert.equal(denied.json().code, 'STEP_UP_REQUIRED');
    const proof = await prove(cookie, 'step-up');
    assert.equal(proof.statusCode, 200, proof.body);
    assert.equal((await call('DELETE', `/api/v1/profiles/${profileId}`, { cookie })).statusCode, 204);
    assert.equal((await call('GET', `/api/v1/profiles/${profileId}`, { cookie })).statusCode, 404);
  });

  test('LAST_KEY: não remove a única chave', async () => {
    const keys = (await call('GET', '/api/v1/security-keys', { cookie })).json();
    assert.equal(keys.length, 1);
    assert.equal(keys[0].deviceType, 'singleDevice');
    const res = await call('DELETE', `/api/v1/security-keys/${keys[0].id}`, { cookie });
    assert.equal(res.json().code, 'LAST_KEY');
  });

  test('S-013: inatividade bloqueia no servidor; desbloqueio exige a chave', async () => {
    assert.equal((await call('POST', '/api/auth/activity', { cookie })).statusCode, 204);
    advance(5);
    const locked = await call('GET', '/api/v1/profiles', { cookie });
    assert.equal(locked.statusCode, 423);
    const session = (await call('GET', '/api/auth/session', { cookie })).json();
    assert.equal(session.stage, 'LOCKED');
    assert.equal(session.lockReason, 'idle');
    // Atividade não desbloqueia.
    assert.equal((await call('POST', '/api/auth/activity', { cookie })).statusCode, 423);
    // Chave desconhecida não desbloqueia.
    const stranger = new SoftAuthenticator('localhost', ORIGIN);
    assert.equal((await prove(cookie, 'unlock', stranger)).json().code, 'WEBAUTHN_FAILED');
    const unlocked = await prove(cookie, 'unlock');
    assert.equal(unlocked.statusCode, 200, unlocked.body);
    cookie = sessionCookie(unlocked)!;
    assert.equal((await call('GET', '/api/v1/profiles', { cookie })).statusCode, 200);
  });

  test('política: teto do ambiente e step-up', async () => {
    const res = await call('PATCH', '/api/v1/security-policy', { cookie, body: { idleMinutes: 15, absoluteMinutes: 15 } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().absoluteMinutes, 15);
    const invalid = await call('PATCH', '/api/v1/security-policy', { cookie, body: { idleMinutes: 7 } });
    assert.equal(invalid.statusCode, 400);
  });

  test('S-014: duração absoluta bloqueia mesmo com atividade contínua', async () => {
    // Nova janela de controle (15 min) começa no desbloqueio.
    const unlockCookie = cookie;
    await call('POST', '/api/auth/lock', { cookie: unlockCookie });
    const again = await prove(unlockCookie, 'unlock');
    cookie = sessionCookie(again)!;
    for (let i = 0; i < 3; i++) {
      advance(4);
      assert.equal((await call('POST', '/api/auth/activity', { cookie })).statusCode, 204);
    }
    advance(4); // 16 min
    const res = await call('GET', '/api/v1/profiles', { cookie });
    assert.equal(res.statusCode, 423);
    assert.equal((await call('GET', '/api/auth/session', { cookie })).json().lockReason, 'absolute');
    cookie = sessionCookie(await prove(cookie, 'unlock'))!;
  });

  test('revogar outros dispositivos derruba a outra sessão', async () => {
    const other = await googleLogin();
    assert.ok(other.cookie);
    const res = await call('POST', '/api/v1/viewer-sessions/revoke-others', { cookie });
    assert.equal(res.statusCode, 200, res.body);
    assert.ok(res.json().revoked >= 1);
    assert.equal((await call('GET', '/api/auth/session', { cookie: other.cookie })).statusCode, 401);
    const list = (await call('GET', '/api/v1/viewer-sessions', { cookie })).json();
    assert.equal(list.length, 1);
    assert.equal(list[0].current, true);
  });

  test('S-029: auditoria sem e-mail, cookie ou URL completa', async () => {
    const audit = (await call('GET', '/api/v1/audit?limit=100', { cookie })).json();
    const codes = audit.items.map((i: { eventCode: string }) => i.eventCode);
    for (const code of ['AUTH_GOOGLE_LOGIN', 'KEY_REJECTED', 'KEY_REGISTERED', 'AUTH_MFA_SUCCESS', 'PROFILE_CREATED', 'PROFILE_URL_REJECTED', 'PROFILE_DELETED', 'AUTH_STEP_UP', 'AUTH_UNLOCK', 'SESSION_REVOKED']) {
      assert.ok(codes.includes(code), code);
    }
    const raw = JSON.stringify(await prisma.auditEvent.findMany());
    assert.ok(!raw.includes(OWNER_EMAIL));
    assert.ok(!raw.includes(cookie));
    assert.ok(!raw.includes('https://'));
  });

  test('bloqueio manual e logout', async () => {
    assert.equal((await call('POST', '/api/auth/lock', { cookie })).statusCode, 204);
    assert.equal((await call('GET', '/api/v1/profiles', { cookie })).statusCode, 423);
    assert.equal((await call('POST', '/api/auth/logout', { cookie })).statusCode, 204);
    assert.equal((await call('GET', '/api/auth/session', { cookie })).statusCode, 401);
  });
});
