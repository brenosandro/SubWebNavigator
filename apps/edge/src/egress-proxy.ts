/**
 * Proxy de egress dos workers: ÚNICA saída da rede `subweb_workers` (internal).
 *
 * - Só CONNECT para a porta 443 (HTTPS/WSS). HTTP puro, UDP e outras portas: negados.
 * - O PRÓPRIO proxy resolve o DNS e conecta no IP validado — o worker nunca
 *   escolhe o IP, então DNS rebinding e redirects para rede privada não passam.
 * - Log só com host e decisão (nunca caminho, que nem trafega em CONNECT).
 */
import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
import { isPublicAddress, parseConnectTarget } from './egress-policy.js';

export type Resolver = (host: string) => Promise<string[]>;
export type Connector = (ip: string, port: number) => net.Socket;

export function createEgressProxy(opts: { resolver?: Resolver; connect?: Connector; maxConnections?: number; log?: (e: Record<string, unknown>) => void } = {}) {
  const resolver: Resolver = opts.resolver ?? (async (h) => (await dns.lookup(h, { all: true, verbatim: true })).map((r) => r.address));
  const connect: Connector = opts.connect ?? ((ip, port) => net.connect({ host: ip, port }));
  const log = opts.log ?? ((e) => process.stdout.write(JSON.stringify({ t: new Date().toISOString(), ...e }) + '\n'));
  const max = opts.maxConnections ?? 512;
  let active = 0;
  const stats = { allowed: 0, denied: 0 };

  const server = http.createServer((req, res) => {
    // Requisições não-CONNECT (HTTP puro, absolute-form): negadas.
    stats.denied++;
    log({ decision: 'deny', reason: 'http puro', method: req.method });
    res.writeHead(403, { 'content-type': 'text/plain' }).end('egress negado');
  });

  server.on('connect', async (req, socket: net.Socket, head) => {
    const deny = (reason: string, host?: string) => {
      stats.denied++;
      log({ decision: 'deny', reason, host });
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    };
    socket.on('error', () => socket.destroy());
    if (active >= max) return deny('limite de conexões');
    const decision = parseConnectTarget(req.url ?? '');
    if (!decision.allow) return deny(decision.reason);

    let addresses: string[];
    try {
      addresses = ipAddressesOrLiteral(decision.host) ?? (await resolver(decision.host));
    } catch {
      return deny('dns', decision.host);
    }
    // Todos os IPs precisam ser públicos: um único privado reprova o host.
    if (addresses.length === 0 || !addresses.every(isPublicAddress)) return deny('ip privado', decision.host);

    const upstream = connect(addresses[0]!, decision.port);
    active++;
    let counted = true;
    const release = () => {
      if (counted) {
        counted = false;
        active--;
      }
    };
    upstream.setTimeout(10_000, () => upstream.destroy());
    upstream.once('connect', () => {
      upstream.setTimeout(5 * 60_000, () => upstream.destroy());
      stats.allowed++;
      log({ decision: 'allow', host: decision.host });
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => {
      if (!socket.destroyed) socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      release();
    });
    upstream.on('close', () => {
      socket.destroy();
      release();
    });
    socket.on('close', () => upstream.destroy());
  });

  return { server, stats };
}

function ipAddressesOrLiteral(host: string): string[] | null {
  return net.isIP(host) ? [host] : null;
}

