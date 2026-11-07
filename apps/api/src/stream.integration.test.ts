/**
 * Integração do gateway de streaming (P3) com Postgres de TESTE e um worker
 * FALSO em processo (mesmo contrato do worker real: token + fencing).
 *   npm run test:integration -w @subweb/api
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import WebSocket, { WebSocketServer } from 'ws';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import type { AppContext } from './context.js';
import { randomToken, sha256 } from './lib/crypto.js';
import { RuntimeError, type RuntimeBackend } from './runtime/backend.js';
import { StreamHub } from './runtime/stream-hub.js';

const DB = process.env.TEST_DATABASE_URL;
const ORIGIN = 'http://localhost:5180';
const WORKER_TOKEN = 'tok-' + 'x'.repeat(40);

describe('Gateway de streaming (integração)', { skip: !DB && 'TEST_DATABASE_URL ausente' }, () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let base = '';
  let offsetMs = 0;
  let ownerId = '';
  let profileId = '';
  const workerInputs: unknown[] = [];
  let highestFencing = -1;
  let worker: WebSocketServer;
  const runtimeCalls: string[] = [];

  before(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB! } } });
    await prisma.$executeRawUnsafe('TRUNCATE "AuditEvent","EnrollmentCode","WebAuthnCredential","AuthSession","Runtime","BrowserProfile","SecurityPolicy","Owner" CASCADE');

    // Worker falso: exige token e fencing crescente, como apps/worker/src/agent.ts.
    worker = new WebSocketServer({
      port: 0,
      verifyClient: ({ req }, done) => {
        const fencing = Number(req.headers['x-swn-fencing']);
        if (req.headers.authorization !== `Bearer ${WORKER_TOKEN}`) return done(false, 401);
        if (fencing < highestFencing) return done(false, 409);
        done(true);
      },
    });
    await new Promise((r) => worker.once('listening', r));
    worker.on('connection', (ws, req) => {
      highestFencing = Math.max(highestFencing, Number(req.headers['x-swn-fencing']));
      ws.send(JSON.stringify({ t: 'ready', w: 1280, h: 800 }));
      ws.send(Buffer.from('JPEG-QUADRO'), { binary: true });
      ws.on('message', (d) => workerInputs.push(JSON.parse(String(d))));
    });
    const workerPort = (worker.address() as AddressInfo).port;

    const runtime: RuntimeBackend = {
      start: async (id) => void runtimeCalls.push(`start:${id}`),
      suspend: async (id) => void runtimeCalls.push(`suspend:${id}`),
      stop: async (id) => void runtimeCalls.push(`stop:${id}`),
      destroy: async (id) => void runtimeCalls.push(`destroy:${id}`),
      stats: async () => ({ cpuPercent: 12.5, memoryUsedMb: 512 }),
      connect: (_id, fencing) =>
        new Promise((resolve, reject) => {
          const ws = new WebSocket(`ws://127.0.0.1:${workerPort}`, { headers: { authorization: `Bearer ${WORKER_TOKEN}`, 'x-swn-fencing': String(fencing) } });
          ws.once('open', () => {
            ws.pause();
            resolve(ws);
          });
          ws.once('unexpected-response', (_r, res) => reject(new RuntimeError(res.statusCode === 409 ? 'LEASE_STALE' : 'WORKER_UNAVAILABLE', 'recusado')));
          ws.once('error', () => reject(new RuntimeError('WORKER_UNAVAILABLE', 'erro')));
        }),
    };

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: DB!,
      APP_ORIGIN: ORIGIN,
      DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
      URL_POLICY_RESOLVE_DNS: 'false',
      STREAM_AUTH_RECHECK_SECONDS: '1',
    });
    const ctx: AppContext = {
      config,
      prisma,
      now: () => new Date(Date.now() + offsetMs),
      dataKey: Buffer.from(config.DATA_ENCRYPTION_KEY, 'base64'),
      runtime,
      streamHub: new StreamHub(),
    };
    app = await buildApp(ctx, { logger: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

    const owner = await prisma.owner.create({ data: { externalSubjectHash: sha256('google|stream'), emailEncrypted: 'x', name: 'Titular' } });
    ownerId = owner.id;
  });

  after(async () => {
    await app?.close();
    worker?.close();
    await prisma?.$disconnect();
  });

  /** Sessão ACTIVE direto no banco (o fluxo Google+chave já é coberto em integration.test.ts). */
  async function activeSession(stepUp = false) {
    const token = randomToken();
    const now = new Date(Date.now() + offsetMs);
    await prisma.authSession.create({
      data: { ownerId, tokenHash: sha256(token), stage: 'ACTIVE', deviceLabel: 'teste', lastHumanInputAt: now, controlExpiresAt: new Date(now.getTime() + 30 * 60_000), sessionExpiresAt: new Date(now.getTime() + 3600_000), stepUpAt: stepUp ? now : null },
    });
    return token;
  }

  async function api(method: string, path: string, cookie: string, body?: unknown) {
    const res = await fetch(base + path, { method, headers: { cookie: `swn_session=${cookie}`, origin: ORIGIN, 'x-swn-csrf': '1', 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  type Opened = { ws: WebSocket; frames: Buffer[]; texts: any[]; closed: Promise<number> };
  function openStream(cookie: string | null, ticket: string | null, origin = ORIGIN): Promise<Opened> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = { origin };
      if (cookie) headers.cookie = `swn_session=${cookie}`;
      const ws = new WebSocket(base.replace('http', 'ws') + '/api/v1/stream', { headers });
      const frames: Buffer[] = [];
      const texts: any[] = [];
      const closed = new Promise<number>((r) => ws.once('close', (code) => r(code)));
      ws.on('message', (d, isBinary) => (isBinary ? frames.push(d as Buffer) : texts.push(JSON.parse(String(d)))));
      ws.once('unexpected-response', (_r, res) => reject(new Error(`http ${res.statusCode}`)));
      ws.once('error', (e) => reject(e));
      ws.once('open', () => {
        if (ticket) ws.send(JSON.stringify({ t: 'auth', ticket }));
        resolve({ ws, frames, texts, closed });
      });
    });
  }
  const until = async (fn: () => boolean, ms = 4000) => {
    const end = Date.now() + ms;
    while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
    assert.ok(fn(), 'condição não atingida a tempo');
  };
  const closeCode = (o: Opened, ms = 4000) => Promise.race([o.closed, new Promise<number>((r) => setTimeout(() => r(-1), ms))]);

  let deviceA = '';
  let deviceB = '';
  let streamA: Opened;

  test('S-040: WebSocket sem sessão ou de outra origem não abre', async () => {
    await assert.rejects(openStream(null, null), /http 401/);
    deviceA = await activeSession(true);
    await assert.rejects(openStream(deviceA, null, 'https://evil.example'), /http 403/);
  });

  test('perfil parado não recebe ticket; start leva a ONLINE', async () => {
    const created = await api('POST', '/api/v1/profiles', deviceA, { title: 'Site de teste', startUrl: 'https://example.org/' });
    profileId = created.json.id;
    assert.equal((await api('POST', `/api/v1/profiles/${profileId}/stream-ticket`, deviceA, {})).status, 400);
    const started = await api('POST', `/api/v1/profiles/${profileId}/start`, deviceA);
    assert.equal(started.status, 200, JSON.stringify(started.json));
    assert.equal(started.json.status, 'ONLINE');
    assert.ok(runtimeCalls.includes(`start:${profileId}`));
    assert.deepEqual((await api('GET', `/api/v1/profiles/${profileId}/stats`, deviceA)).json, { cpuPercent: 12.5, memoryUsedMb: 512 });
  });

  test('ticket na 1ª mensagem abre o stream; entrada validada chega ao worker', async () => {
    const t = await api('POST', `/api/v1/profiles/${profileId}/stream-ticket`, deviceA, {});
    assert.equal(t.status, 200);
    assert.equal(t.json.transport, 'wss');
    assert.ok(t.json.expiresInSeconds <= 30);
    streamA = await openStream(deviceA, t.json.ticket);
    await until(() => streamA.frames.length > 0 && streamA.texts.some((m) => m.t === 'ready'));
    assert.equal(streamA.frames[0]!.toString(), 'JPEG-QUADRO');

    streamA.ws.send(JSON.stringify({ t: 'mouse', a: 'down', x: 10, y: 20, b: 'left' }));
    streamA.ws.send(JSON.stringify({ t: 'eval', code: 'alert(1)' }));
    streamA.ws.send(JSON.stringify({ t: 'cdp', method: 'Runtime.evaluate' }));
    streamA.ws.send(JSON.stringify({ t: 'key', a: 'down', key: 'a', code: 'KeyA', kc: 65 }));
    await until(() => workerInputs.length >= 2);
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(workerInputs.map((m: any) => m.t), ['mouse', 'key']);

    // S-008: o mesmo ticket não abre um segundo canal.
    const replay = await openStream(deviceA, t.json.ticket);
    assert.equal(await closeCode(replay), 4400);
  });

  test('S-009/S-015: ticket de um dispositivo não vale em outra sessão', async () => {
    deviceB = await activeSession(false);
    const tA = await api('POST', `/api/v1/profiles/${profileId}/stream-ticket`, deviceA, {});
    const stolen = await openStream(deviceB, tA.json.ticket);
    assert.equal(await closeCode(stolen), 4400);
    // O ticket de A acima trocou o lease: o stream antigo de A cai por lease substituído.
    assert.equal(await closeCode(streamA), 4409);
  });

  test('S-035: um controlador por vez; assumir exige step-up; fencing antigo é recusado', async () => {
    const tA = await api('POST', `/api/v1/profiles/${profileId}/stream-ticket`, deviceA, {});
    streamA = await openStream(deviceA, tA.json.ticket);
    await until(() => streamA.frames.length > 0);
    const oldFencing = highestFencing;

    const busy = await api('POST', `/api/v1/profiles/${profileId}/stream-ticket`, deviceB, {});
    assert.equal(busy.status, 409);
    assert.equal(busy.json.code, 'CONTROL_BUSY');
    const noStepUp = await api('POST', `/api/v1/profiles/${profileId}/stream-ticket`, deviceB, { takeover: true });
    assert.equal(noStepUp.json.code, 'STEP_UP_REQUIRED');

    await prisma.authSession.update({ where: { tokenHash: sha256(deviceB) }, data: { stepUpAt: new Date(Date.now() + offsetMs) } });
    const tB = await api('POST', `/api/v1/profiles/${profileId}/stream-ticket`, deviceB, { takeover: true });
    assert.equal(tB.status, 200);
    assert.equal(await closeCode(streamA), 4409);
    const streamB = await openStream(deviceB, tB.json.ticket);
    await until(() => streamB.frames.length > 0);
    assert.ok(highestFencing > oldFencing);

    // S-012: quem tem lease antigo não reabre o canal com o worker.
    await assert.rejects(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${(worker.address() as AddressInfo).port}`, { headers: { authorization: `Bearer ${WORKER_TOKEN}`, 'x-swn-fencing': String(oldFencing) } });
        ws.once('open', resolve);
        ws.once('unexpected-response', (_r, res) => reject(new Error(String(res.statusCode))));
      }),
      /409/,
    );

    // S-021: bloqueio manual corta o stream na hora.
    const t0 = Date.now();
    assert.equal((await api('POST', '/api/auth/lock', deviceB)).status, 204);
    assert.equal(await closeCode(streamB), 4423);
    assert.ok(Date.now() - t0 < 1000, 'corte imediato');
  });

  test('S-013: inatividade fecha o stream pelo relógio do servidor', async () => {
    const c = await activeSession();
    const t = await api('POST', `/api/v1/profiles/${profileId}/stream-ticket`, c, {});
    assert.equal(t.status, 200, JSON.stringify(t.json));
    const s = await openStream(c, t.json.ticket);
    await until(() => s.frames.length > 0);
    offsetMs += 6 * 60_000; // idle padrão: 5 min
    assert.equal(await closeCode(s, 3000), 4423);
    offsetMs = 0;
  });

  test('S-034: revogar outros dispositivos derruba o stream deles', async () => {
    const c = await activeSession();
    const t = await api('POST', `/api/v1/profiles/${profileId}/stream-ticket`, c, {});
    const s = await openStream(c, t.json.ticket);
    await until(() => s.frames.length > 0);
    const res = await api('POST', '/api/v1/viewer-sessions/revoke-others', deviceA);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(await closeCode(s), 4403);
    // Sessão revogada não abre de novo.
    await assert.rejects(openStream(c, null), /http 401/);
  });

  test('suspender/parar/excluir cortam o stream e chegam ao runtime', async () => {
    const t = await api('POST', `/api/v1/profiles/${profileId}/stream-ticket`, deviceA, {});
    const s = await openStream(deviceA, t.json.ticket);
    await until(() => s.frames.length > 0);
    assert.equal((await api('POST', `/api/v1/profiles/${profileId}/suspend`, deviceA)).json.status, 'SUSPENDED');
    assert.equal(await closeCode(s), 4410);
    assert.equal((await api('POST', `/api/v1/profiles/${profileId}/stream-ticket`, deviceA, {})).status, 400);
    assert.equal((await api('POST', `/api/v1/profiles/${profileId}/stop`, deviceA)).json.status, 'STOPPED');
    await prisma.authSession.update({ where: { tokenHash: sha256(deviceA) }, data: { stepUpAt: new Date() } });
    assert.equal((await api('DELETE', `/api/v1/profiles/${profileId}`, deviceA)).status, 204);
    assert.deepEqual(runtimeCalls.slice(-3), [`suspend:${profileId}`, `stop:${profileId}`, `destroy:${profileId}`]);
  });
});
