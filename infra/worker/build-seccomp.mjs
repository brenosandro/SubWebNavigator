// Gera seccomp-chromium.json a partir do perfil padrão do Docker (moby/profiles).
//
// Por quê: o sandbox de namespaces do Chromium precisa de user namespaces
// (clone/unshare com CLONE_NEWUSER, setns) e de chroot DENTRO do namespace.
// O perfil padrão só libera essas syscalls com CAP_SYS_ADMIN — e nós rodamos
// com `cap_drop: ALL`. A alternativa comum (`--no-sandbox`) é proibida pelo projeto.
//
// O que muda em relação ao padrão: SÓ clone, unshare, setns e chroot passam a
// ser permitidas sem capability. mount, pivot_root, bpf, ptrace etc. continuam
// bloqueadas; clone3 continua devolvendo ENOSYS (a glibc recua para clone).
//
//   node infra/worker/build-seccomp.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dir = import.meta.dirname;
const base = JSON.parse(readFileSync(path.join(dir, 'moby-default.json'), 'utf8'));
const EXTRA = ['clone', 'unshare', 'setns', 'chroot'];

const profile = {
  ...base,
  syscalls: [
    ...base.syscalls,
    {
      names: EXTRA,
      action: 'SCMP_ACT_ALLOW',
      comment: 'SubWebNavigator: sandbox de namespaces do Chromium (user namespaces), sem CAP_SYS_ADMIN',
    },
  ],
};
writeFileSync(path.join(dir, 'seccomp-chromium.json'), JSON.stringify(profile, null, 2) + '\n');
console.log(`seccomp-chromium.json gerado (+${EXTRA.join(', ')})`);
