import path from 'node:path';
import { existsSync } from 'node:fs';
import { createController } from './controller.js';
import { dockerCli } from './docker.js';

const secret = process.env.CONTROLLER_SECRET ?? '';
if (secret.length < 32) {
  console.error('CONTROLLER_SECRET ausente ou curto (>= 32).');
  process.exit(1);
}
const seccompProfile = path.resolve(process.env.WORKER_SECCOMP_PROFILE ?? path.join(import.meta.dirname, '..', '..', '..', 'infra', 'worker', 'seccomp-chromium.json'));
if (!existsSync(seccompProfile)) {
  console.error(`Perfil seccomp não encontrado: ${seccompProfile}`);
  process.exit(1);
}
const network = process.env.WORKER_NETWORK ?? 'subweb_workers';
const check = await dockerCli(['network', 'inspect', '--format', '{{.Internal}}', network]);
// Fail-closed: a rede dos workers PRECISA ser internal (sem rota para fora).
if (check.code !== 0 || check.stdout !== 'true') {
  console.error(`A rede ${network} não existe ou não é internal. Rode: docker compose up -d`);
  process.exit(1);
}

/**
 * Imagem do worker: WORKER_IMAGE se existir; senão a mais recente com o label
 * `swn.image=worker` (o Coolify pode renomear imagens construídas pelo compose).
 */
async function resolveWorkerImage(): Promise<string> {
  const wanted = process.env.WORKER_IMAGE;
  if (wanted && (await dockerCli(['image', 'inspect', '--format', '{{.Id}}', wanted])).code === 0) return wanted;
  const r = await dockerCli(['images', '--filter', 'label=swn.image=worker', '--format', '{{.Repository}}:{{.Tag}}']);
  const found = r.stdout.split(/\r?\n/).find((l) => l && !l.includes('<none>'));
  if (!found) {
    console.error('Imagem do worker não encontrada (WORKER_IMAGE ou label swn.image=worker). Rode: npm run worker:image');
    process.exit(1);
  }
  return found;
}
const image = await resolveWorkerImage();

const { server } = createController(
  {
    secret,
    image,
    network,
    seccompProfile,
    egressProxy: process.env.WORKER_EGRESS_PROXY ?? 'http://swn-egress:3128',
    maxWorkers: Number(process.env.MAX_SIMULTANEOUS_WORKERS ?? 3),
    defaultMemoryMb: Number(process.env.WORKER_MEMORY_LIMIT_MB ?? 1536),
    maxMemoryMb: 4096,
    defaultCpus: Number(process.env.WORKER_CPU_LIMIT ?? 1.5),
    timezone: process.env.TZ ?? 'America/Sao_Paulo',
    healthTimeoutMs: 60_000,
  },
  dockerCli,
);
const host = process.env.CONTROLLER_HOST ?? '127.0.0.1';
const port = Number(process.env.CONTROLLER_PORT ?? 3470);
server.listen(port, host, () => console.log(JSON.stringify({ msg: 'controller ouvindo', host, port, network, image })));
