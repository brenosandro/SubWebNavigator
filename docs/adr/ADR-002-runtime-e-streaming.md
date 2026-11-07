# ADR-002 — Runtime remoto (worker Chromium) e streaming

**Data:** 2026-11-06 · **Estado:** aceito (P3)

## Contexto
Sites de terceiros (WhatsApp Web, Telegram, Instagram) precisam rodar num Chromium real **no servidor**, com sessão persistente por perfil, e chegar ao visitante só como pixels, nunca como iframe. Requisitos: sandbox ligado, CDP fora da rede, egress negado para redes privadas, ticket de uso único, control lease exclusivo e corte imediato no bloqueio.

## Decisões

### Topologia
```
navegador ──WSS──▶ API (gateway /api/v1/stream) ──WS──▶ relay ──▶ worker (Chromium)
                     │ HMAC                                        │ só CONNECT :443
                     ▼                                             ▼
                 controller ──docker CLI──▶ cria/para workers   egress proxy ──▶ internet
```
- **Rede `subweb_workers` é `internal`**: worker sem rota para fora. Saída **só** pelo egress proxy; entrada **só** pelo relay.
- **Controller** é o único com acesso ao Docker (API/web nunca). API → controller assinado com HMAC (corpo+método+caminho+timestamp, janela de 30 s, anti-replay).
- **Relay** só repassa `/runtime/<uuid>` → `swn-worker-<uuid>:7070` e recusa conexões vindas da própria rede dos workers.

### Worker
- **Chromium com interface sob Xvfb**, não headless: navegador comum, sem trocar user-agent (trocar UA para passar por antibot não é aceitável).
- **CDP por `--remote-debugging-pipe`** (fds 3/4). Nenhuma porta de DevTools existe.
- **Sandbox do Chromium ligado** via user namespaces. Perfil seccomp derivado do padrão do Docker (`infra/worker/build-seccomp.mjs`) liberando **apenas** `clone`, `unshare`, `setns` e `chroot`, sem capability nenhuma. `chrome-sandbox` SUID removido.
- Container: UID 1000, `--read-only`, `--cap-drop ALL`, `no-new-privileges`, `pids-limit`, limite de memória/CPU, `/tmp` em tmpfs, um volume `swn-profile-<uuid>` por perfil.
- **Protocolo próprio limitado** ([`packages/protocol`](../../packages/protocol/src/index.ts)): viewport, mouse, roda, tecla, texto (IME), navegação. Sem JavaScript, sem CDP arbitrário. Validado no gateway **e** no worker.
- Pop-ups fechados (uma aba por perfil), downloads negados, seletor de arquivo interceptado, permissões negadas.

### Streaming (MVP)
- **WSS no mesmo hostname** (atrás do Access): quadros JPEG do `Page.startScreencast`, decodificados no cliente com `createImageBitmap` num `<canvas>`.
- **Ticket de uso único**, TTL ≤ 30 s, enviado na **primeira mensagem** (nunca na URL), amarrado a sessão + perfil + lease.
- **Control lease com fencing token**: um controlador por runtime; outro dispositivo só assume com step-up; o worker recusa fencing menor que o maior já visto.
- **Corte**: lock/logout/revogação fecham o stream na hora (hub em memória) + revalidação periódica da sessão no servidor (idle/absoluto).
- Backpressure: quadros são descartados (nunca enfileirados) quando cliente/gateway atrasam.

## Problemas encontrados e resolvidos durante a implementação
| Sintoma | Causa | Correção |
|---|---|---|
| Primeiros quadros perdidos | listeners ligados depois de `await` | socket do worker devolvido **pausado**; `resume()` após ligar listeners (gateway e relay) |
| Perfil não reabre após encerramento não limpo | `SingletonLock` aponta para hostname anterior | agente remove `Singleton*` ao iniciar (1 container por volume) + hostname fixo |
| Cookies perdidos ao parar | `dumb-init` mandava SIGTERM ao grupo; Xvfb morria e o agente saía antes do `Browser.close` | `dumb-init --single-child`; ordem: Browser.close → Chromium sai → Xvfb |
| Quadros param ao trocar de site | navegação entre sites troca o processo de renderização | reinicia o screencast no `frameNavigated`/`loadEventFired` |
| Produção "em câmera lenta" (1º uso real, via túnel) | worker mandava todos os quadros; o freio (`bufferedAmount`) só via o 1º salto e os quadros se acumulavam em gateway/nginx/cloudflared/uplink | **controle de fluxo fim a fim**: o cliente confirma (`ack`) cada quadro desenhado; ≤ 2 quadros em trânsito; o excedente é substituído pelo mais recente; qualidade JPEG adaptativa pela ida e volta do quadro (70/55/42/40@75%). Link simulado 8 Mbit/s·60 ms: atraso p50 7,4 s → 0,21 s; 4 Mbit/s·80 ms: 12,5 s → 0,20 s |
| Rolagem sem quadros | Chromium estrangula janela "oculta" sob Xvfb sem WM | `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`, foco emulado; `--disable-threaded-scrolling` reduziu latência medida (43 ms vs 247 ms, 1 amostra cada) |

## Consequências / riscos residuais
- **Gateway da rede interna**: o IP 10.213.240.1 (bridge) responde. No Docker Desktop nenhuma porta estava aberta nele (ECONNREFUSED em 5446/7460/55499/2375/22); **em host Linux de produção é obrigatório** o bloqueio do `infra/firewall/workers-egress.nft`.
- Cookies do Chromium no Linux sem keyring usam a chave "basic" (fixa): o sigilo em repouso depende do **volume cifrado (LUKS)** do host, pendente (P5). Não há AEAD por perfil ainda.
- JPEG por WebSocket é suficiente para texto/rolagem; vídeo/áudio e codec H.264/WebRTC ficam para fase posterior.
- `kernel.apparmor_restrict_unprivileged_userns=1` (Ubuntu 24.04) bloqueia o sandbox: em produção, criar perfil AppArmor para o runtime em vez de desligar o sandbox.
