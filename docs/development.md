# Desenvolvimento

## Requisitos
- Node **22.12+** e npm 10+
- Docker 24+. No Windows/macOS, Docker Desktop. No Linux, kernel com user namespaces sem privilégio (veja [deploy.md](deploy.md#requisitos)).
- Uma chave FIDO2 **ou** o autenticador virtual do Chrome (DevTools → ⋮ → More tools → WebAuthn → *Enable virtual authenticator environment*, protocolo ctap2, transporte usb).

## Primeira execução
```bash
npm install            # instala tudo e compila @subweb/protocol (postinstall)
npm run setup          # cria o .env de DESENVOLVIMENTO com segredos aleatórios
npm run docker:up      # Postgres (127.0.0.1:5446), egress proxy, relay e rede subweb_workers
npm run migrate:dev    # aplica as migrations no banco local
npm run worker:image   # constrói subweb-worker:dev (Chromium do Debian)
npm run dev            # API :3460 · controller :3470 · web :5180
```

O `.env` gerado liga dois atalhos que **só funcionam fora de produção** (a API se recusa a subir com eles em `NODE_ENV=production`):

| Variável | Efeito |
|---|---|
| `DEV_LOGIN_EMAIL` | botão "Entrar em modo desenvolvimento", sem Google |
| `WEBAUTHN_DEV_OPEN_ENROLLMENT` | a primeira chave é cadastrada sem o código gerado no servidor |

Para testar o fluxo real, deixe os dois vazios, configure o Google (abaixo) e gere o código da primeira chave com `npm run owner:enrollment-code`.

### Google OAuth local
1. Google Cloud → Credenciais → ID do cliente OAuth → **Aplicativo da Web**.
2. Redirecionamento autorizado: `http://localhost:5180/api/auth/google/callback`.
3. No `.env`, preencha `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `OWNER_GOOGLE_EMAILS` (o seu e-mail).

## Scripts
| Comando | O que faz |
|---|---|
| `npm run dev` | API, controller e web com recarga automática |
| `npm run build` | compila todos os pacotes |
| `npm run typecheck` | TypeScript em todo o monorepo |
| `npm test` | testes unitários de todos os pacotes |
| `npm run test:integration` | API ponta a ponta contra `TEST_DATABASE_URL` (banco descartável) |
| `npm run worker:image` | imagem do worker para desenvolvimento |
| `npm run owner:enrollment-code` | código de uso único para cadastrar a primeira chave |
| `npm run docker:up` / `docker:down` | dependências locais |

O banco `subweb_test` é criado automaticamente na primeira subida do Postgres local (`infra/postgres/init`). A suíte de integração apaga os dados dele e se recusa a rodar se `TEST_DATABASE_URL` for igual a `DATABASE_URL`.

## Testes
- **Unitários** (`node:test` + `tsx`) ficam ao lado do código: `*.test.ts`.
- **Integração** (`apps/api/src/*.integration.test.ts`, `integration.test.ts`) sobe a API real com Postgres de teste. Usa um autenticador WebAuthn **de software** (`apps/api/src/test/soft-authenticator.ts`) para provar cadastro, login, desbloqueio, step-up e a recusa de passkey sincronizada.
- Os nomes dos testes de segurança trazem o ID da [matriz](security.md#matriz-de-testes-de-segurança) (ex.: `S-013`).

## Convenções
- **TypeScript estrito** em todos os pacotes, ESM (`"type": "module"`).
- **Mensagens entre navegador, gateway e worker** só em [`packages/protocol`](../packages/protocol/src/index.ts). Uma mensagem nova precisa entrar no esquema zod, e gateway e worker validam as duas pontas.
- **Nada de segredo no código, em log ou na URL.** Tokens e tickets vão em cookie `HttpOnly` ou na primeira mensagem do WebSocket.
- **O controller é o único com Docker.** API e web nunca recebem `docker.sock`.
- **Nunca `--no-sandbox`.** Se o sandbox do Chromium não sobe, o worker falha fechado.
- Textos da interface e da documentação em português do Brasil.
- Commits pequenos e descritivos. Uma decisão de arquitetura nova vira um ADR em `docs/adr/`.

## Solução de problemas
| Sintoma | Causa provável |
|---|---|
| controller não sobe: rede não é `internal` | rode `npm run docker:up` antes de `npm run dev` |
| perfil fica em "Acordando perfil…" | imagem `subweb-worker:dev` ausente: `npm run worker:image` |
| `sandbox_unavailable` | o kernel bloqueia user namespaces sem privilégio (Ubuntu 23.10+: AppArmor) |
| `TEST_DATABASE_URL não definido` | rode `npm run setup` ou adicione a variável ao `.env` |
