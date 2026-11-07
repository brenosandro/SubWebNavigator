import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, normalizeStartUrl, UrlRejected, validateStartUrl } from './url-policy.js';

const rejects = (raw: string) => assert.throws(() => normalizeStartUrl(raw), UrlRejected, raw);

test('aceita HTTPS público e normaliza', () => {
  assert.deepEqual(normalizeStartUrl('  https://WEB.WhatsApp.com/#x '), { url: 'https://web.whatsapp.com/', host: 'web.whatsapp.com' });
  assert.equal(normalizeStartUrl('https://web.telegram.org:443/k/').url, 'https://web.telegram.org/k/');
});

test('S-022: esquemas proibidos', () => {
  for (const raw of ['http://example.org', 'file:///etc/passwd', 'chrome://settings', 'data:text/html,<b>x</b>', 'javascript:alert(1)', 'ftp://x.org']) rejects(raw);
});

test('S-018: loopback e localhost', () => {
  for (const raw of ['https://localhost', 'https://127.0.0.1', 'https://[::1]/', 'https://foo.localhost', 'https://0x7f.1', 'https://2130706433', 'https://127.1']) rejects(raw);
});

test('S-019: redes privadas, link-local e metadata', () => {
  for (const raw of ['https://10.0.0.1', 'https://172.16.5.4', 'https://192.168.1.1', 'https://169.254.169.254/latest/meta-data', 'https://metadata.google.internal', 'https://[fd00::1]', 'https://[fe80::1]', 'https://intranet', 'https://nas.local', 'https://router.lan']) rejects(raw);
});

test('S-021: IPv4 mapeado em IPv6 e IP literal público', () => {
  rejects('https://[::ffff:127.0.0.1]');
  rejects('https://[::ffff:7f00:1]');
  rejects('https://8.8.8.8'); // IP literal nunca, mesmo público
});

test('credenciais e portas não padrão', () => {
  rejects('https://user:pass@example.com');
  rejects('https://example.com:8443');
});

test('isPublicAddress', () => {
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700::1111'), true);
  for (const ip of ['127.0.0.1', '10.1.2.3', '100.64.0.1', '169.254.169.254', '0.0.0.0', '224.0.0.1', '::1', 'fc00::1', '::ffff:10.0.0.1', 'lixo']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test('S-020: host público que resolve para IP privado é recusado', async () => {
  await assert.rejects(validateStartUrl('https://rebind.attacker.com', { resolveDns: true, resolver: async () => ['93.184.216.34', '10.0.0.5'] }), UrlRejected);
  await assert.rejects(validateStartUrl('https://nx.attacker.com', { resolveDns: true, resolver: async () => [] }), UrlRejected);
  const ok = await validateStartUrl('https://web.whatsapp.com', { resolveDns: true, resolver: async () => ['157.240.1.1'] });
  assert.equal(ok.host, 'web.whatsapp.com');
});
