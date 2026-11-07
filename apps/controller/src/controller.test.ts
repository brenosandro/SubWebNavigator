import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from './controller.js';
import type { DockerExec } from './docker.js';
import { ReplayGuard, sign, verify } from './signing.js';

const ID = '11111111-2222-4333-8444-555555555555';
const cfg = {
  secret: 's'.repeat(40),
  image: 'subweb-worker:dev',
  network: 'subweb_workers',
  seccompProfile: '/x/seccomp-chromium.json',
  egressProxy: 'http://swn-egress:3128',
  maxWorkers: 1,
  defaultMemoryMb: 1536,
  maxMemoryMb: 4096,
  defaultCpus: 1.5,
  timezone: 'America/Sao_Paulo',
  healthTimeoutMs: 2_000,
};

function fakeDocker(opts: { exitOnStart?: string } = {}) {
  const calls: string[][] = [];
  const containers = new Map<string, string>();
  const exec: DockerExec = async (args) => {
    calls.push(args);
    const [cmd] = args;
    const name = args.at(-1)!;
    if (cmd === 'run') {
      const n = args[args.indexOf('--name') + 1]!;
      containers.set(n, opts.exitOnStart ? 'exited' : 'running');
      return { code: 0, stdout: 'cid', stderr: '' };
    }
    if (cmd === 'inspect') {
      const s = containers.get(name);
      if (!s) return { code: 1, stdout: '', stderr: 'no such' };
      return { code: 0, stdout: s === 'running' ? 'running|healthy|0' : s === 'paused' ? 'paused|healthy|0' : 'exited||1', stderr: '' };
    }
    if (cmd === 'logs') return { code: 0, stdout: opts.exitOnStart ?? '', stderr: '' };
    if (cmd === 'ps') return { code: 0, stdout: [...containers].filter(([, s]) => s !== 'exited').map(([n]) => n).join('\n'), stderr: '' };
    if (cmd === 'pause') containers.set(name, 'paused');
    if (cmd === 'unpause') containers.set(name, 'running');
    if (cmd === 'rm') containers.delete(name);
    return { code: 0, stdout: '', stderr: '' };
  };
  return { exec, calls, containers };
}

test('S-026/blueprint: container sempre com as restrições fixas', async () => {
  const d = fakeDocker();
  const c = createController(cfg, d.exec);
  const r = await c.handle('PUT', `/v1/runtimes/${ID}`, JSON.stringify({ startUrl: 'https://web.whatsapp.com/' }));
  assert.equal(r.status, 200);
  const run = d.calls.find((a) => a[0] === 'run')!;
  const joined = run.join(' ');
  for (const flag of ['--read-only', '--cap-drop ALL', '--security-opt no-new-privileges', '--security-opt seccomp=/x/seccomp-chromium.json', '--network subweb_workers', '--user 1000:1000', '--pids-limit 512', '--memory 1536m']) {
    assert.ok(joined.includes(flag), flag);
  }
  for (const forbidden of ['--privileged', 'docker.sock', '--no-sandbox', '--cap-add', 'seccomp=unconfined', '-p ', '--publish']) {
    assert.ok(!joined.includes(forbidden), forbidden);
  }
  assert.ok(run.includes(`swn-profile-${ID}:/profile`));
});

test('cota de workers simultâneos e reaproveitamento do token', async () => {
  const d = fakeDocker();
  const c = createController(cfg, d.exec);
  const a = (await c.handle('PUT', `/v1/runtimes/${ID}`, JSON.stringify({ startUrl: 'https://a.example.org/' }))).json as { token: string };
  const again = (await c.handle('PUT', `/v1/runtimes/${ID}`, JSON.stringify({ startUrl: 'https://a.example.org/' }))).json as { token: string };
  assert.equal(again.token, a.token);
  await assert.rejects(c.handle('PUT', '/v1/runtimes/99999999-2222-4333-8444-555555555555', JSON.stringify({ startUrl: 'https://b.example.org/' })), /Limite/);
  await c.handle('POST', `/v1/runtimes/${ID}/suspend`, '');
  assert.equal(d.containers.get(`swn-worker-${ID}`), 'paused');
  const resumed = (await c.handle('PUT', `/v1/runtimes/${ID}`, JSON.stringify({ startUrl: 'https://a.example.org/' }))).json as { token: string };
  assert.equal(resumed.token, a.token);
  await c.handle('DELETE', `/v1/runtimes/${ID}`, '');
  assert.ok(d.calls.some((x) => x.join(' ') === `volume rm -f swn-profile-${ID}`));
});

test('falha de sandbox é reportada, nunca contornada', async () => {
  const d = fakeDocker({ exitOnStart: '{"msg":"fatal","code":"sandbox_unavailable"}' });
  const c = createController(cfg, d.exec);
  await assert.rejects(c.handle('PUT', `/v1/runtimes/${ID}`, JSON.stringify({ startUrl: 'https://a.example.org/' })), /sandbox/);
  assert.equal(d.calls.filter((a) => a[0] === 'run').length, 1);
});

test('entradas inválidas', async () => {
  const c = createController(cfg, fakeDocker().exec);
  await assert.rejects(c.handle('PUT', '/v1/runtimes/../../etc', '{}'), /Não encontrado/);
  await assert.rejects(c.handle('PUT', `/v1/runtimes/${ID}`, JSON.stringify({ startUrl: 'http://10.0.0.1/' })), /inválida/);
  await assert.rejects(c.handle('PUT', `/v1/runtimes/${ID}`, JSON.stringify({ startUrl: 'https://x.org/', image: 'evil' })), /inválida/);
});

test('assinatura HMAC: janela de tempo e anti-replay', () => {
  const g = new ReplayGuard();
  const now = 1_000_000;
  const sig = sign(cfg.secret, now, 'PUT', '/v1/runtimes/x', '{}');
  assert.equal(verify(cfg.secret, { ts: String(now), sig }, 'PUT', '/v1/runtimes/x', '{}', now, g), true);
  assert.equal(verify(cfg.secret, { ts: String(now), sig }, 'PUT', '/v1/runtimes/x', '{}', now, g), false, 'replay');
  const sig2 = sign(cfg.secret, now, 'PUT', '/v1/runtimes/x', '{"a":1}');
  assert.equal(verify(cfg.secret, { ts: String(now), sig: sig2 }, 'PUT', '/v1/runtimes/x', '{}', now, g), false, 'corpo trocado');
  assert.equal(verify(cfg.secret, { ts: String(now - 60_000), sig: sign(cfg.secret, now - 60_000, 'GET', '/v1/runtimes/x', '') }, 'GET', '/v1/runtimes/x', '', now, g), false, 'expirado');
  assert.equal(verify('outro'.repeat(10), { ts: String(now), sig: sign(cfg.secret, now, 'GET', '/a', '') }, 'GET', '/a', '', now, g), false);
});
