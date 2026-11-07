/**
 * Relay de entrada: ÚNICO caminho do gateway (API) até um worker.
 *
 * Fica nas duas redes: `subweb_workers` (internal) e a rede de controle.
 * Só repassa WebSocket para `swn-worker-<uuid>:7070`; o worker valida o token
 * do runtime e o fencing. Conexões vindas da própria rede dos workers são
 * recusadas (um worker não alcança outro por aqui — TH-04/TH-20).
 */
import http from 'node:http';
import ipaddr from 'ipaddr.js';
import WebSocket, { WebSocketServer } from 'ws';

const PATH = /^\/runtime\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function createRelay(opts: { workersSubnet?: string; upstream?: (profileId: string) => string; log?: (e: Record<string, unknown>) => void } = {}) {
  const upstream = opts.upstream ?? ((id: string) => `ws://swn-worker-${id}:7070/`);
  const log = opts.log ?? ((e) => process.stdout.write(JSON.stringify({ t: new Date().toISOString(), ...e }) + '\n'));
  const subnet = opts.workersSubnet ? ipaddr.parseCIDR(opts.workersSubnet) : null;

  const fromWorkers = (addr: string | undefined) => {
    if (!subnet || !addr || !ipaddr.isValid(addr)) return false;
    let ip = ipaddr.parse(addr);
    if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress()) ip = (ip as ipaddr.IPv6).toIPv4Address();
    return ip.kind() === subnet[0].kind() && ip.match(subnet);
  };

  const server = http.createServer((req, res) => {
    if (req.url === '/health') return res.writeHead(200).end('ok');
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const reject = (status: number, reason: string) => {
      log({ decision: 'deny', reason });
      socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\n\r\n`);
    };
    socket.on('error', () => socket.destroy());
    if (fromWorkers(req.socket.remoteAddress)) return reject(403, 'origem na rede dos workers');
    const match = PATH.exec(req.url ?? '');
    if (!match) return reject(404, 'caminho');
    const auth = req.headers.authorization;
    const fencing = req.headers['x-swn-fencing'];
    if (typeof auth !== 'string' || typeof fencing !== 'string') return reject(401, 'credenciais ausentes');

    const up = new WebSocket(upstream(match[1]!), { headers: { authorization: auth, 'x-swn-fencing': fencing }, maxPayload: 8 * 1024 * 1024, handshakeTimeout: 5_000 });
    up.once('unexpected-response', (_r, res) => reject(res.statusCode === 409 ? 409 : res.statusCode === 401 ? 401 : 502, `worker ${res.statusCode}`));
    up.once('error', () => reject(502, 'worker indisponível'));
    up.once('open', () => {
      // Pausado até os listeners existirem: o worker manda `ready` logo no handshake.
      up.pause();
      wss.handleUpgrade(req, socket, head, (client) => {
        log({ decision: 'allow' });
        up.on('message', (data, isBinary) => client.readyState === client.OPEN && client.send(data, { binary: isBinary }));
        client.on('message', (data, isBinary) => up.readyState === up.OPEN && up.send(data, { binary: isBinary }));
        up.on('close', (code, reason) => client.close(code >= 4000 ? code : 4502, reason.toString().slice(0, 60)));
        client.on('close', () => up.close());
        up.resume();
      });
    });
  });

  return { server };
}

