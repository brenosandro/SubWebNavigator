# Roadmap e estado atual

**Resumo:** protótipo funcional. Login, perfis, runtime remoto e transmissão funcionam e já rodaram atrás de Cloudflare Tunnel + Access num servidor Linux. **Não está pronto para produção:** hardening (P5) e QA/pentest (P6) ainda não foram feitos.

## Fases
| Fase | Entrega | Estado |
|---|---|---|
| P0 · Descoberta | ADRs, modelo de ameaças, estudo de streaming | ✅ |
| P1 · Fundação | monorepo, Fastify, React, Postgres/Prisma, Docker | ✅ |
| P2 · Acesso Zero Trust | Cloudflare Access, Google OIDC, chave WebAuthn obrigatória, JWT no origin, bloqueio e revogação | ✅ |
| P3 · Runtime remoto | Chromium com sandbox em worker isolado, perfil persistente, transmissão + controle | ✅ |
| P4 · Produto | múltiplas abas por perfil, grupos, busca, favoritos | 🟡 parcial (perfis, grupos e cores) |
| P5 · Hardening | volume cifrado, AEAD por perfil, backup/restore, firewall aplicado, clipboard/arquivos controlados | ⏳ |
| P6 · QA e release | carga, resiliência, SAST/SCA/DAST, pentest autorizado | ⏳ |
| P7 · P&D | vídeo (VP8/H.264/WebRTC), áudio, cliente desktop | ⏳ |

## O que foi verificado
**Automatizado** (`npm test` e `npm run test:integration`):
- política de URL e SSRF, sessão (inatividade e tempo máximo), cifra de campo;
- login Google simulado + WebAuthn real via autenticador de software: cadastro, login, desbloqueio, step-up e recusa de passkey sincronizada;
- gateway de transmissão: ticket de uso único, lease com fencing, corte em bloqueio, inatividade e revogação;
- egress proxy: loopback, redes privadas, metadata, IPv4 mapeado, DNS rebinding, portas e HTTP puro;
- controller: flags fixas do container, cota, HMAC com anti-replay;
- protocolo: só entradas conhecidas e limitadas.

**Manual, com Chromium real em container:**
- renderers com seccomp-bpf e user namespace próprios; CDP só por pipe;
- worker sem rota direta para a internet; metadata, loopback, gateway e redes privadas negados pelo proxy;
- cookie persiste após parar e recriar o worker, e não aparece em outro perfil;
- excluir o perfil apaga o volume;
- bloquear com transmissão ativa remove o canvas e corta o worker no mesmo instante.

**Atrás de Cloudflare Tunnel + Access, servidor Linux:**
- rotas e WebSocket sem sessão do Access: 302 para o login;
- JWT forjado: negado;
- Google + chave física real + código de cadastro: funcionou;
- worker sobe *healthy* com sandbox no kernel real;
- transmissão: cerca de 8 quadros/s e cerca de 180 ms de ida e volta num upload de cerca de 8 Mbit/s, depois do controle de fluxo fim a fim. Antes dele, os quadros acumulavam e o atraso chegava a cerca de 13 s.

A matriz completa está em [security.md](security.md#matriz-de-testes-de-segurança).

## Próximos passos
1. **Vídeo em vez de JPEG** (VP8/H.264 via WebCodecs ou WebRTC): a maior melhoria de fluidez em links lentos.
2. Aplicar e testar a regra `nft` dos workers em host Linux.
3. Cifra em repouso dos perfis (LUKS no host e/ou AEAD por perfil) com backup e restore testados.
4. Clipboard e upload/download controlados, com confirmação por operação.
5. Pipeline de segurança: SCA com gate, SAST, varredura de imagens, SBOM.
6. Testes de carga com 1, 3 e 5 perfis simultâneos.
