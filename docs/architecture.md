# Arquitetura

O SubWebNavigator é um monorepo TypeScript (npm workspaces) com cinco aplicações e um pacote compartilhado. Os diagramas abaixo são Mermaid e o GitHub os renderiza direto.

- [Estrutura do monorepo](#estrutura-do-monorepo)
- [Visão geral](#visão-geral)
- [Redes e fronteiras de confiança](#redes-e-fronteiras-de-confiança)
- [Login: Access, Google e chave física](#login-access-google-e-chave-física)
- [Transmissão e controle de fluxo](#transmissão-e-controle-de-fluxo)
- [Ciclo de vida do perfil](#ciclo-de-vida-do-perfil)
- [Estados da sessão](#estados-da-sessão)
- [Modelo de dados](#modelo-de-dados)
- [API HTTP](#api-http)

## Estrutura do monorepo

```
.
├── apps/
│   ├── web/          React 18 · Vite · Tailwind: landing, login, workspace (<canvas>), configurações
│   ├── api/          Fastify 5 · Prisma: autenticação, sessões, perfis, auditoria e gateway WSS
│   ├── controller/   único componente com acesso ao Docker: cria, suspende e para workers
│   ├── worker/       agente dentro do container de cada perfil: Xvfb + Chromium (CDP por pipe)
│   └── edge/         egress proxy (única saída dos workers) e relay (única entrada)
├── packages/
│   └── protocol/     @subweb/protocol: mensagens navegador ⇄ gateway ⇄ worker, validadas com zod
├── infra/
│   ├── docker/       Dockerfiles de cada serviço, nginx com CSP estrita
│   ├── worker/       perfil seccomp do Chromium (derivado do padrão do Docker)
│   └── firewall/     regra nftables que isola a rede dos workers do host
├── docs/             arquitetura, segurança, deploy, desenvolvimento, roadmap e ADRs
├── docker-compose.yml        dependências do ambiente local
└── docker-compose.prod.yml   stack completa de produção
```

| Pacote | Depende de | Quem fala com ele |
|---|---|---|
| `@subweb/web` | `@subweb/protocol` (só tipos) | navegador do titular |
| `@subweb/api` | `@subweb/protocol`, Postgres | web (HTTP + WSS), controller (HMAC), relay (WS) |
| `@subweb/controller` | Docker CLI | só a API |
| `@subweb/worker` | `@subweb/protocol` | só o relay |
| `@subweb/edge` | — | relay: API → workers · proxy: workers → internet |
| `@subweb/protocol` | zod | importado pela API, pelo worker e pela web |

O protocolo fica num pacote só para que gateway e worker validem **exatamente o mesmo esquema**: a API valida antes de repassar e o worker valida de novo (defesa em profundidade).

## Visão geral

```mermaid
flowchart LR
    U(["Navegador do titular"])
    subgraph CF["Cloudflare"]
        A["Access<br/>Google + chave física"]
        T["Tunnel"]
    end
    subgraph H["Servidor (Docker)"]
        W["web<br/>nginx + SPA"]
        API["api<br/>Fastify + gateway WSS"]
        DB[("Postgres")]
        C["controller<br/>único com docker.sock"]
        R["relay"]
        subgraph WN["rede subweb_workers (internal)"]
            K1["worker perfil A<br/>Chromium + Xvfb"]
            K2["worker perfil B<br/>Chromium + Xvfb"]
        end
        P["egress proxy<br/>só :443 público"]
    end
    NET(("Internet"))

    U -- HTTPS/WSS --> A --> T --> W
    W -- "/api" --> API
    API --> DB
    API -- "HMAC" --> C
    C -- "docker run (flags fixas)" --> K1 & K2
    API -- WS --> R --> K1 & K2
    K1 & K2 -- CONNECT --> P --> NET
```

- Nenhuma porta é publicada no host: a única entrada é o túnel.
- A rede dos workers é `internal`. Sem rota para fora, eles só falam com o relay (entrada) e o egress proxy (saída).
- O navegador do titular recebe **apenas pixels** num `<canvas>`. Cookies, armazenamento e sessões dos sites ficam no volume do perfil, no servidor.

## Redes e fronteiras de confiança

```mermaid
flowchart TB
    subgraph F1["F1: Internet (hostil)"]
        V["Navegador visitante"]
    end
    subgraph F2["F2: borda Cloudflare"]
        ACC["Access: identidade + MFA"]
    end
    subgraph F3["F3: rede padrão do Compose"]
        WEB["web"] --> APIN["api"]
        APIN --> PG[("postgres")]
        APIN --> CTL["controller"]
    end
    subgraph F4["F4: subweb_workers (internal)"]
        REL["relay"] --> WK["workers"]
        WK --> EGR["egress proxy"]
    end
    V --> ACC --> WEB
    APIN --> REL
    EGR -- "só IP público :443<br/>sem redes privadas, metadata, DNS rebinding" --> OUT(("sites"))
    CTL -. "docker.sock" .-> WK
```

| Fronteira | Controle |
|---|---|
| Visitante → borda | Cloudflare Access (Google + chave de segurança) |
| Borda → origin | Tunnel; a API valida o JWT do Access (`ENFORCE_ACCESS_JWT`) |
| API → controller | HMAC sobre método, caminho, corpo e timestamp; janela de 30 s com anti-replay |
| API → worker | ticket de uso único + control lease com fencing token |
| Worker → internet | egress proxy: resolve o DNS e só conecta em IP público na porta 443 |
| Worker → host | sandbox do Chromium, seccomp, `cap_drop: ALL`, rootfs read-only, regra `nft` no host |

Detalhes, ameaças e testes: [security.md](security.md).

## Login: Access, Google e chave física

```mermaid
sequenceDiagram
    autonumber
    actor U as Titular
    participant CF as Cloudflare Access
    participant WEB as web
    participant API as api
    participant G as Google
    participant K as Chave FIDO2

    U->>CF: abre https://SEU_DOMINIO
    CF->>U: login Google + chave (perímetro)
    CF->>WEB: requisição com JWT do Access
    U->>API: GET /api/auth/google/start
    API->>U: redireciona (PKCE + nonce + state em cookie assinado)
    U->>G: consentimento
    G->>API: callback com code
    API->>G: troca code por id_token (JWKS verificado)
    API->>API: sub na allowlist? cria sessão MFA_PENDING
    API->>U: cookie opaco HttpOnly / SameSite=Strict
    U->>API: pede challenge WebAuthn
    API->>U: challenge (securityKey, UV)
    U->>K: toque na chave
    K->>U: assinatura
    U->>API: resposta WebAuthn
    API->>API: recusa passkey sincronizada (backedUp/multiDevice)
    API->>U: sessão ACTIVE, cookie girado
```

A primeira chave só é cadastrada com um **código de uso único gerado no servidor** (`enrollment-code`). Quem não tem acesso ao host não consegue cadastrar a chave inicial, mesmo com a conta Google do titular.

## Transmissão e controle de fluxo

```mermaid
sequenceDiagram
    autonumber
    participant B as Navegador (canvas)
    participant API as api (gateway)
    participant R as relay
    participant WK as worker
    participant CH as Chromium

    B->>API: POST /profiles/:id/stream-ticket
    API->>B: ticket (uso único, TTL ≤ 30 s)
    B->>API: WSS /api/v1/stream
    B->>API: 1ª mensagem: {t:"auth", ticket}
    API->>API: valida sessão, perfil, lease e fencing
    API->>R: WS /runtime/<uuid>
    R->>WK: repassa
    WK->>CH: Page.startScreencast (CDP por pipe)
    loop cada quadro
        CH-->>WK: JPEG
        WK-->>B: binário (máx. 2 em trânsito)
        B->>B: createImageBitmap → canvas
        B->>WK: {t:"ack"}
    end
    B->>WK: mouse / wheel / key / text / nav
    Note over API,WK: o gateway e o worker validam cada mensagem com @subweb/protocol
    Note over B,WK: bloqueio, logout ou revogação → o gateway fecha o WSS na hora
```

**Por que `ack`?** Sem ele, o worker produz quadros mais rápido do que o caminho (gateway → nginx → túnel → upload) consegue entregar. Os quadros se acumulam nos buffers e a tela mostra o passado com segundos de atraso. Com no máximo 2 quadros em trânsito, o excedente é descartado e substituído pelo mais recente. A qualidade JPEG se ajusta à ida e volta medida (`stats` a cada 2 s).

## Ciclo de vida do perfil

```mermaid
stateDiagram-v2
    [*] --> STOPPED: criar perfil
    STOPPED --> STARTING: iniciar
    STARTING --> RUNNING: worker healthy
    STARTING --> ERROR: falha ou sandbox indisponível
    RUNNING --> SUSPENDED: inatividade / suspender
    SUSPENDED --> STARTING: retomar
    RUNNING --> STOPPED: parar (Browser.close → cookies gravados)
    ERROR --> STARTING: reiniciar
    STOPPED --> [*]: excluir (step-up + volume apagado)
```

Cada perfil tem um volume `swn-profile-<uuid>` e, quando ativo, um container `swn-worker-<uuid>`. Os dois são criados pelo controller **fora** do Compose.

## Estados da sessão

```mermaid
stateDiagram-v2
    [*] --> MFA_PENDING: Google OK
    MFA_PENDING --> ACTIVE: chave física
    ACTIVE --> LOCKED: manual · inatividade · tempo máximo
    LOCKED --> ACTIVE: chave física de novo
    ACTIVE --> [*]: logout / revogação
    LOCKED --> [*]: logout / revogação
```

O relógio que conta inatividade e tempo máximo é o do **servidor**. Só entrada humana (`/auth/activity`) renova a inatividade; heartbeat não conta. Ações sensíveis exigem a chave de novo (step-up ≤ 5 min).

## Modelo de dados

```mermaid
erDiagram
    Owner ||--o{ WebAuthnCredential : "chaves"
    Owner ||--o{ AuthSession : "sessões"
    Owner ||--o{ BrowserProfile : "perfis"
    Owner ||--o| SecurityPolicy : "política"
    Owner ||--o{ EnrollmentCode : "códigos"
    Owner ||--o{ AuditEvent : "auditoria"
    BrowserProfile ||--o| Runtime : "runtime"

    Owner {
        uuid id
        string externalSubjectHash "hash do sub do Google"
        string emailEncrypted "AES-GCM"
    }
    WebAuthnCredential {
        string credentialId
        bytes publicKey
        bool backedUp "true = recusada"
        datetime revokedAt
    }
    AuthSession {
        string tokenHash "SHA-256 do cookie"
        string stage "MFA_PENDING | ACTIVE | LOCKED"
        datetime lastHumanInputAt
        datetime sessionExpiresAt
        datetime stepUpAt
    }
    BrowserProfile {
        string title
        string provider "whatsapp | telegram | instagram | custom"
        string normalizedStartUrl
        string status
    }
    Runtime {
        string state
        int fencingToken
        string leaseSessionId
    }
    SecurityPolicy {
        int idleMinutes
        int absoluteMinutes
        bool allowClipboard "false"
    }
    AuditEvent {
        string eventCode
        string result
        json metadata "sem conteúdo nem URL completa"
    }
```

O banco guarda só o hash do cookie, o hash do `sub` do Google e o e-mail cifrado. Nunca guarda conteúdo de páginas nem mensagens.

## API HTTP

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/auth/config` · `/api/auth/session` | configuração pública e estado da sessão |
| GET | `/api/auth/google/start` · `/callback` | login Google (OIDC + PKCE) |
| POST | `/api/auth/webauthn/*` | cadastro, login, desbloqueio e step-up com a chave |
| POST | `/api/auth/activity` · `/lock` · `/logout` | atividade humana, bloqueio manual, saída |
| GET/POST/PATCH/DELETE | `/api/v1/profiles[/:id]` | CRUD de perfis (excluir exige step-up) |
| POST | `/api/v1/profiles/:id/{start,suspend,stop,touch}` | ciclo de vida do runtime |
| GET | `/api/v1/profiles/:id/stats` | CPU e memória do worker (só números) |
| POST | `/api/v1/profiles/:id/stream-ticket` | ticket de uso único para o WSS |
| GET | `/api/v1/stream` (WebSocket) | transmissão e entrada |
| GET/PATCH | `/api/v1/security-policy` | inatividade, tempo máximo, suspensão |
| GET/POST | `/api/v1/viewer-sessions[...]` | dispositivos conectados e revogação |
| GET/PATCH/DELETE | `/api/v1/security-keys[/:id]` | chaves de segurança |
| GET | `/api/v1/audit` | eventos de auditoria |

Toda rota que muda estado exige o cabeçalho anti-CSRF e `Origin` igual a `APP_ORIGIN`.

Decisões registradas: [ADR-001: stack e autenticação](adr/ADR-001-stack-e-autenticacao.md) · [ADR-002: runtime e streaming](adr/ADR-002-runtime-e-streaming.md).
