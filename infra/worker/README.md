# Perfil seccomp do worker

- `moby-default.json`: perfil seccomp padrão do Docker, copiado de
  https://github.com/moby/profiles (`seccomp/default.json`), licença Apache-2.0.
- `seccomp-chromium.json`: gerado por `node infra/worker/build-seccomp.mjs`.
  Diferença única: libera `clone`, `unshare`, `setns` e `chroot` sem capability,
  para o sandbox de namespaces do Chromium funcionar com `cap_drop: ALL`
  (a alternativa `--no-sandbox` é proibida pelo projeto).

Ao atualizar o Docker/Chromium, baixe o perfil padrão de novo e regenere.
