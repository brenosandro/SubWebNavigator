# Contribuindo

Obrigado pelo interesse! Algumas combinações para manter o projeto seguro e fácil de revisar.

## Antes de começar
- Leia [docs/architecture.md](docs/architecture.md) e [docs/security.md](docs/security.md).
- Para mudanças grandes, abra uma issue antes e descreva o problema e a abordagem.
- Vulnerabilidades **não** vão em issue pública: veja [SECURITY.md](SECURITY.md).

## Ambiente
Siga [docs/development.md](docs/development.md). Em resumo: `npm install`, `npm run setup`, `npm run docker:up`, `npm run migrate:dev`, `npm run worker:image`, `npm run dev`.

## Pull requests
1. Crie uma branch a partir de `main`.
2. Antes de enviar, rode:
   ```bash
   npm run typecheck
   npm test
   npm run test:integration   # se mexeu na API
   ```
3. Descreva **o que** muda e **por quê**. Se a mudança afeta autenticação, isolamento do worker, egress ou o protocolo, diga como testou.
4. Mantenha o PR focado: uma mudança por PR.

## Regras que não mudam
- Sem `--no-sandbox`, sem `docker.sock` fora do controller, sem porta publicada para workers.
- Nenhum segredo, token, cookie, QR ou URL completa em log, auditoria ou query string.
- Nada do site remoto entra no DOM da aplicação: só pixels no `<canvas>`.
- Mensagens novas entre navegador, gateway e worker passam pelo esquema de `packages/protocol`.
- Nenhum dado real (e-mails, domínios, tokens, capturas com conteúdo pessoal) em commits, testes ou issues.

## Estilo
TypeScript estrito, ESM, textos de interface em português do Brasil. Siga o padrão do arquivo que você está editando.
