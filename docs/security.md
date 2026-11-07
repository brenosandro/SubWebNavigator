# Segurança

O SubWebNavigator hospeda sessões autenticadas de mensageria e redes sociais. Por isso o controle de acesso, o isolamento e a auditoria fazem parte da arquitetura, e não são extras. Este documento traz o modelo de ameaças, os controles e o estado de cada teste de segurança. Os IDs `TH-xx` e `S-xxx` citados no código apontam para cá.

> **Importante:** este projeto **não passou** por pentest nem por auditoria externa. As fases de hardening (P5) e de QA (P6) do [roadmap](roadmap.md) estão em aberto. Para relatar uma vulnerabilidade, veja [SECURITY.md](../SECURITY.md).

## Princípios
- **Chave física obrigatória.** Google sozinho não libera nada, e passkeys sincronizadas na nuvem são recusadas.
- **O servidor manda.** Inatividade, tempo máximo, bloqueio e revogação são decididos e aplicados no servidor. A UI só reflete.
- **Nada do site no visitante.** O navegador do titular recebe pixels num `<canvas>`, sem iframe, cookies ou armazenamento do site.
- **Negar por padrão.** Worker sem rota para fora, egress só para IP público na porta 443, clipboard, upload e download desligados.
- **Sem `--no-sandbox`.** O Chromium roda com o sandbox ligado. Se o sandbox não sobe, o worker falha fechado.
- **Auditoria sem conteúdo.** Nenhuma mensagem, página visitada, cookie, QR ou URL completa vai para log ou auditoria.

## Ativos
Cookies e sessões dos sites, armazenamento do Chromium (volumes `swn-profile-*`), chaves de cifra (`DATA_ENCRYPTION_KEY`), segredos de sessão e HMAC, token do túnel, credenciais WebAuthn, trilha de auditoria.

## Modelo de ameaças (STRIDE resumido)
| ID | Ameaça | Vetor | Controle |
|---|---|---|---|
| TH-01 | Login falsificado | URL pública, conta Google invadida | allowlist + chave física obrigatória + Access + JWT validado no origin |
| TH-02 | Replay de token | cookie ou ticket de stream roubado | TTL curto, uso único, rotação, vínculo com perfil e lease, revogação no servidor |
| TH-03 | Bypass do perímetro | acesso por IP, porta ou Host | só túnel, nenhuma porta publicada, JWT verificado também na API |
| TH-04 | Mistura entre perfis | IDOR, reuso de volume | um container e um volume por perfil, autorização por `ownerId` em todas as rotas |
| TH-05 | SSRF | `127.0.0.1`, DNS rebinding, redirect, IPv6 mapeado | egress proxy resolve o DNS e só conecta em IP público :443; política de URL na API |
| TH-06 | Fuga do navegador | site malicioso explora o Chromium | sandbox ligado, seccomp, rootfs read-only, `cap_drop: ALL`, UID 1000 |
| TH-07 | Exaustão de recursos | muitos perfis, flood de WebSocket | cota de workers, limites de CPU, memória e PIDs, rate limit, descarte de quadros |
| TH-08 | Vazamento de conteúdo | screenshots, logs de entrada | sem gravação, sem log de entrada, auditoria sem conteúdo |
| TH-09 | Captura no computador visitante | malware, gravador de tela | aviso explícito + bloqueio rápido. **Risco residual: não dá para eliminar remotamente** |
| TH-10 | Exfiltração por transferência | clipboard, arquivos | desligados por padrão |
| TH-11 | Cadeia de suprimentos | dependência ou imagem maliciosa | lockfile, imagens base oficiais, alertas de segurança do Dependabot, revisão dos Dockerfiles |
| TH-12 | Host comprometido | root lê a memória | hardening do host, volume cifrado. **Não há E2EE: o servidor vê o conteúdo** |
| TH-13 | Bypass do bloqueio | WSS aberto continua após expirar | o gateway fecha o stream na hora + revalidação periódica |
| TH-15 | XSS na UI | título, URL ou nome de perfil | React escapa, CSP estrita no nginx, nada do site entra no DOM |
| TH-16 | CSRF | mudança via cookie | `SameSite=Strict` + cabeçalho obrigatório + checagem de `Origin`/`Sec-Fetch-Site` |
| TH-17 | Sequestro de controle | dois clientes no mesmo worker | control lease com fencing token; assumir exige step-up |
| TH-18 | Rebaixamento de MFA | TOTP ou recuperação como alternativa | só chave física; não existe caminho alternativo |
| TH-20 | Acesso lateral | worker alcança serviços do host | rede `internal` + regra `nft` no host (`infra/firewall/workers-egress.nft`) |

## Isolamento do worker
Flags fixas, aplicadas pelo controller ([`apps/controller/src/docker.ts`](../apps/controller/src/docker.ts)) e verificadas em teste:

- `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`, seccomp próprio ([`infra/worker/`](../infra/worker/README.md));
- `--user 1000:1000`, `--pids-limit 512`, memória e CPU limitadas, `/tmp` em tmpfs;
- só a rede `subweb_workers` (internal), nenhuma porta publicada, sem `docker.sock`;
- um volume `swn-profile-<uuid>` por perfil; nenhum volume é compartilhado entre perfis;
- CDP só por `--remote-debugging-pipe`, sem porta de DevTools;
- protocolo de entrada limitado ([`packages/protocol`](../packages/protocol/src/index.ts)): mouse, roda, teclado, texto e navegação. Nada de JavaScript, CDP arbitrário ou arquivos.

## Matriz de testes de segurança
**Legenda:** ✅ teste automatizado · 🔎 verificado manualmente · 🧱 garantido pelo desenho, sem teste dedicado · ⚠️ parcial · ⏳ pendente · ➖ recurso desligado

| ID | Ataque | Esperado | Estado |
|---|---|---|---|
| S-001 | requisição sem sessão nem JWT do Access | 401/403 sem conteúdo | ✅ `integration.test.ts` |
| S-002 | acesso direto ao origin por IP ou porta | indisponível | 🧱 nenhuma porta publicada |
| S-003 | JWT do Access com assinatura, audience ou validade errada | negado | 🔎 JWT forjado negado no servidor real |
| S-004 | JWT válido de outra aplicação do Access | negado | 🧱 a API valida a `aud` |
| S-005 | Google autorizado sem chave física | sessão não ativa | ✅ `integration.test.ts` |
| S-006 | passkey sincronizada como "chave" | recusada | ✅ `integration.test.ts` |
| S-007 | revogação com WSS já aberto | stream cortado | ⚠️ revogação no app ✅ (S-034); revogação no Access não testada |
| S-008 | ticket de stream reutilizado | segunda vez negada | ✅ `stream.integration.test.ts` |
| S-009 | ticket do perfil B usado no A | negado | ✅ `stream.integration.test.ts` |
| S-010 | perfil de outro titular (IDOR) | 404 neutro | ✅ `integration.test.ts` |
| S-011 | troca rápida A/B com stream antigo | nenhum pixel de A em B | 🧱 o canvas é limpo na troca |
| S-012 | lease antigo após novo controlador | entrada recusada | ✅ `stream.integration.test.ts` |
| S-013 | inatividade com heartbeat contínuo | bloqueia mesmo assim | ✅ `session.test.ts`, `integration.test.ts`, `stream.integration.test.ts` |
| S-014 | tempo máximo com atividade contínua | bloqueia no servidor | ✅ `session.test.ts`, `integration.test.ts` |
| S-015 | cookie roubado tenta assumir o controle | exige step-up | ✅ `stream.integration.test.ts` |
| S-016 | CSRF (POST/PATCH/DELETE) | bloqueado | ✅ `integration.test.ts` |
| S-017 | XSS em nome, título ou URL | nenhum script | ✅ `integration.test.ts` |
| S-018 | `localhost`, `127.0.0.1`, `::1` | egress negado | ✅ `egress-proxy.test.ts`, `url-policy.test.ts` · 🔎 |
| S-019 | redes privadas, link-local, metadata | egress negado | ✅ `egress-proxy.test.ts`, `url-policy.test.ts` · 🔎 |
| S-020 | DNS rebinding ou redirect para rede privada | egress negado | ✅ `egress-proxy.test.ts`, `url-policy.test.ts` · 🔎 |
| S-021 | IPv6 mapeado ou IP codificado | egress negado | ✅ `egress-proxy.test.ts`, `url-policy.test.ts` · 🔎 |
| S-022 | `file://`, `chrome://`, `data:`, `javascript:` | negado | ✅ `url-policy.test.ts` |
| S-023 | CDP, DevTools ou comando arbitrário | inacessível | ✅ `packages/protocol` · 🔎 CDP só por pipe |
| S-024 | worker lê `docker.sock` ou volume de outro perfil | inacessível | 🔎 `docker inspect` |
| S-025 | worker busca arquivos do host | inacessível | 🧱 rootfs read-only, sem bind mounts |
| S-026 | Chromium sem sandbox | bloqueado | ✅ `controller.test.ts` · 🔎 renderers com seccomp-bpf e user namespace |
| S-027 | extrair perfil do volume sem a chave | ilegível | ⏳ depende de volume cifrado (LUKS) no host |
| S-028 | snapshot manipulado | rejeitado | ⏳ sem AEAD por perfil |
| S-029 | token, QR, cookie ou mensagem em logs | nada exposto | ✅ `integration.test.ts`, `egress-proxy.test.ts` |
| S-030 | transferir arquivo sem permissão | 403 | ➖ upload desligado |
| S-031 | download com MIME falso | bloqueado | ➖ download desligado |
| S-032 | flood de payload, WS ou perfis | limitado | ⚠️ rate limit e cota de workers; sem teste de carga |
| S-033 | spoofing de `Origin` ou `Host` | sessão negada | ✅ `integration.test.ts` |
| S-034 | reconectar WS com sessão revogada | negado | ✅ `stream.integration.test.ts` |
| S-035 | dois clientes na mesma aba | controle exclusivo | ✅ `stream.integration.test.ts` |
| S-036 | cache ou voltar após bloqueio | nada sensível | ⏳ |
| S-037 | troca da chave de cifra | recifragem íntegra | ⏳ |
| S-038 | restore sem a chave | falha segura | ⏳ |
| S-039 | dependências com CVE crítica | gate falha | ⚠️ alertas de segurança do Dependabot ativos; sem gate no CI |
| S-040 | `/api` e WSS sem Access | 401/403 | ✅ `integration.test.ts`, `stream.integration.test.ts` · 🔎 302 no servidor real |
| S-041 | session fixation | cookie girado após autenticar | ✅ `integration.test.ts` |
| S-042 | replay de challenge no desbloqueio | expira, sem replay | ✅ `integration.test.ts` |
| S-043 | request smuggling, `..` no caminho | rotas consistentes | ⏳ |
| S-044 | recuperação remove a exigência da chave | não existe | 🧱 sem fluxo de recuperação; use a chave reserva |
| S-045 | reinício com volume montado | falha fechado | ⏳ |

## Riscos residuais
- **Computador visitante comprometido** (keylogger, gravador de tela): fora do alcance do servidor. Use só computadores de confiança.
- **Root no servidor** enxerga a memória do Chromium. Não há criptografia ponta a ponta.
- **Cookies do Chromium no Linux sem keyring** usam a chave "basic". O sigilo em repouso depende de **volume cifrado no host**.
- **Sites de terceiros** podem expirar sessões, pedir QR ou CAPTCHA, ou bloquear o acesso. O projeto nunca tenta contornar isso.
- **Atestação:** as flags `backedUp`/`multiDevice` são declaradas pelo autenticador. Exigir um modelo específico de chave pede atestação `direct` + FIDO MDS, o que ainda não foi implementado.

## Resposta a incidentes
| Situação | O que fazer |
|---|---|
| Chave física perdida | entre com a chave reserva, revogue a perdida em **Configurações → Chaves de segurança** e revogue as outras sessões |
| Suspeita de acesso indevido | **Configurações → Sessões → Revogar outros dispositivos**, pare todos os perfis, gire `OAUTH_STATE_SECRET` e `CONTROLLER_SECRET` |
| Servidor comprometido | isole o host, desconecte as sessões nos próprios serviços (ex.: WhatsApp → Aparelhos conectados), gire o token do túnel e todos os segredos, reinstale |
| Encerrar a instalação | veja [deploy.md → Remover uma instalação](deploy.md#remover-uma-instalação) |
