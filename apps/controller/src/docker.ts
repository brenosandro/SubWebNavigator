import { execFile } from 'node:child_process';

/** Execução do Docker CLI sempre com array de argumentos (sem shell). */
export type DockerResult = { code: number; stdout: string; stderr: string };
export type DockerExec = (args: string[], timeoutMs?: number) => Promise<DockerResult>;

export const dockerCli: DockerExec = (args, timeoutMs = 60_000) =>
  new Promise((resolve) => {
    execFile('docker', args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number' ? ((err as unknown as { code: number }).code) : 1) : 0;
      resolve({ code, stdout: String(stdout).trim(), stderr: String(stderr).trim() });
    });
  });

export type WorkerSpec = {
  profileId: string;
  startUrl: string;
  token: string;
  image: string;
  network: string;
  seccompProfile: string;
  egressProxy: string;
  memoryMb: number;
  cpus: number;
  timezone: string;
};

export const containerName = (profileId: string) => `swn-worker-${profileId}`;
export const volumeName = (profileId: string) => `swn-profile-${profileId}`;

/**
 * Argumentos FIXOS do container de worker (docs/security.md, "Isolamento do worker").
 * Nada aqui vem do usuário além do UUID (validado) e da URL (validada, vai como env).
 */
export function workerRunArgs(s: WorkerSpec): string[] {
  return [
    'run',
    '-d',
    '--name', containerName(s.profileId),
    '--label', 'swn.role=worker',
    '--label', `swn.profile=${s.profileId}`,
    '--network', s.network,
    '--network-alias', containerName(s.profileId),
    // Hostname fixo: o lock de perfil do Chromium continua reconhecível entre recriações.
    '--hostname', 'swn-worker',
    '--user', '1000:1000',
    '--read-only',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=512m',
    '--shm-size', '256m',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--security-opt', `seccomp=${s.seccompProfile}`,
    '--pids-limit', '512',
    '--memory', `${s.memoryMb}m`,
    '--memory-swap', `${s.memoryMb}m`,
    '--cpus', String(s.cpus),
    '--restart', 'no',
    '--log-driver', 'json-file',
    '--log-opt', 'max-size=1m',
    '--log-opt', 'max-file=2',
    '-e', `WORKER_TOKEN=${s.token}`,
    '-e', `START_URL=${s.startUrl}`,
    '-e', `EGRESS_PROXY=${s.egressProxy}`,
    '-e', `TZ=${s.timezone}`,
    '-v', `${volumeName(s.profileId)}:/profile`,
    s.image,
  ];
}
