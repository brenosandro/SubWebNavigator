import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStage } from './session.js';
import { safeReturnTo } from './google.js';
import { decryptField, encryptField, maskIp } from '../lib/crypto.js';
import crypto from 'node:crypto';

const at = (iso: string) => new Date(iso);

test('S-013: idle bloqueia pelo relógio do servidor', () => {
  const base = { stage: 'ACTIVE', lockReason: null, lastHumanInputAt: at('2026-11-06T10:00:00Z'), controlExpiresAt: at('2026-11-06T11:00:00Z') };
  assert.deepEqual(evaluateStage(base, 5, at('2026-11-06T10:04:59Z')), { stage: 'ACTIVE', lockReason: null });
  assert.deepEqual(evaluateStage(base, 5, at('2026-11-06T10:05:00Z')), { stage: 'LOCKED', lockReason: 'idle' });
});

test('S-014: duração absoluta bloqueia mesmo com atividade contínua', () => {
  const s = { stage: 'ACTIVE', lockReason: null, lastHumanInputAt: at('2026-11-06T10:29:59Z'), controlExpiresAt: at('2026-11-06T10:30:00Z') };
  assert.deepEqual(evaluateStage(s, 30, at('2026-11-06T10:30:00Z')), { stage: 'LOCKED', lockReason: 'absolute' });
});

test('estágios não ativos não mudam', () => {
  const s = { stage: 'LOCKED', lockReason: 'manual', lastHumanInputAt: at('2026-11-06T10:00:00Z'), controlExpiresAt: null };
  assert.deepEqual(evaluateStage(s, 1, at('2026-11-07T10:00:00Z')), { stage: 'LOCKED', lockReason: 'manual' });
  const p = { stage: 'MFA_PENDING', lockReason: null, lastHumanInputAt: at('2026-11-06T10:00:00Z'), controlExpiresAt: null };
  assert.equal(evaluateStage(p, 1, at('2026-11-07T10:00:00Z')).stage, 'MFA_PENDING');
});

test('returnTo só aceita caminho interno (open redirect)', () => {
  assert.equal(safeReturnTo('/app/perfis'), '/app/perfis');
  for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', '/api/auth/logout', 'app', undefined, 42, '/x\r\nSet-Cookie:a']) {
    assert.equal(safeReturnTo(bad), '/app', String(bad));
  }
});

test('cifra de campo AES-GCM: ida e volta, e adulteração falha', () => {
  const key = crypto.randomBytes(32);
  const enc = encryptField(key, 'titular@example.com', 'owner:1:email');
  assert.equal(decryptField(key, enc, 'owner:1:email'), 'titular@example.com');
  assert.throws(() => decryptField(key, enc, 'owner:2:email'));
  const parts = enc.split('.');
  parts[3] = Buffer.from('xxxx').toString('base64url');
  assert.throws(() => decryptField(key, parts.join('.'), 'owner:1:email'));
  assert.notEqual(encryptField(key, 'a', 'x'), encryptField(key, 'a', 'x'));
});

test('IP mascarado', () => {
  assert.equal(maskIp('203.0.113.45'), '203.0.x.x');
  assert.equal(maskIp('::ffff:198.51.100.7'), '198.51.x.x');
  assert.equal(maskIp('2001:db8:1:2::5'), '2001:db8:…');
  assert.equal(maskIp(undefined), null);
});
