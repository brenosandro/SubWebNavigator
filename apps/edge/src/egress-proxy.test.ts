import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { createEgressProxy } from './egress-proxy.js';
import { parseConnectTarget } from './egress-policy.js';

const logs: Record<string, unknown>[] = [];
// "Internet" falsa: um servidor local; o connector redireciona o IP público validado para ele.
const fakeSite = net.createServer((s) => s.end('OLA'));
await new Promise<void>((r) => fakeSite.listen(0, '127.0.0.1', r));
const sitePort = (fakeSite.address() as AddressInfo).port;
const connected: string[] = [];

const dnsTable: Record<string, string[]> = {
  'web.whatsapp.com': ['157.240.1.1'],
  'rebind.attacker.net': ['10.0.0.8'],
  'misto.attacker.net': ['93.184.216.34', '192.168.1.1'],
};
const { server } = createEgressProxy({
  resolver: async (h) => {
    const r = dnsTable[h];
    if (!r) throw new Error('nx');
    return r;
  },
  connect: (ip) => {
    connected.push(ip);
    return net.connect({ host: '127.0.0.1', port: sitePort });
  },
  log: (e) => logs.push(e),
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const proxyPort = (server.address() as AddressInfo).port;
after(() => {
  server.close();
  fakeSite.close();
});

function connectVia(target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = net.connect(proxyPort, '127.0.0.1', () => s.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
    let buf = '';
    s.on('data', (d) => (buf += d.toString()));
    s.on('end', () => resolve(buf));
    s.on('error', reject);
  });
}

test('permite HTTPS público e conecta no IP que o proxy validou', async () => {
  const res = await connectVia('web.whatsapp.com:443');
  assert.match(res, /^HTTP\/1.1 200/);
  assert.match(res, /OLA$/);
  assert.equal(connected.at(-1), '157.240.1.1');
});

test('S-018/S-019/S-021: loopback, privados, metadata e IPv4 mapeado', async () => {
  for (const t of ['127.0.0.1:443', '[::1]:443', '10.1.1.1:443', '169.254.169.254:443', '192.168.0.10:443', '[::ffff:127.0.0.1]:443', 'localhost:443', 'nas.local:443', 'intranet:443']) {
    assert.match(await connectVia(t), /^HTTP\/1.1 403/, t);
  }
});

test('S-020: DNS que aponta para rede privada (rebinding) é negado', async () => {
  assert.match(await connectVia('rebind.attacker.net:443'), /^HTTP\/1.1 403/);
  assert.match(await connectVia('misto.attacker.net:443'), /^HTTP\/1.1 403/);
  assert.match(await connectVia('nao-existe.example.org:443'), /^HTTP\/1.1 403/);
});

test('portas e HTTP puro negados', async () => {
  assert.match(await connectVia('web.whatsapp.com:22'), /^HTTP\/1.1 403/);
  assert.match(await connectVia('web.whatsapp.com:80'), /^HTTP\/1.1 403/);
  const res = await fetch(`http://127.0.0.1:${proxyPort}/http://example.org/`);
  assert.equal(res.status, 403);
});

test('log nunca carrega caminho ou query', () => {
  assert.ok(logs.length > 0);
  assert.ok(logs.every((l) => !JSON.stringify(l).includes('/http')));
  assert.deepEqual(parseConnectTarget('exemplo.com.br:443'), { allow: true, host: 'exemplo.com.br', port: 443 });
});
