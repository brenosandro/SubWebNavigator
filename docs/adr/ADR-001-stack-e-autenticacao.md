# ADR-001 — Stack, design system e autenticação

**Data:** 2026-11-06 · **Estado:** aceito (fundação P1/P2)

## Contexto
Os requisitos iniciais pediam monorepo TypeScript com React, Fastify, Postgres/Prisma e autenticação Google + chave física WebAuthn obrigatória, com o **design system Datatoms** (landing, termos, privacidade e "entrar com Google").

## Decisões
1. **Front em React + Vite** (não Next.js): é a stack de origem do design system Datatoms. O shell é SPA estático servido por nginx; nada de SSR com segredos.
2. **API em Fastify 5 + zod + Prisma**. Workspaces npm em vez de pnpm.
3. **Google OIDC próprio** (Authorization Code + PKCE + nonce + state em cookie HMAC), sem `googleapis`. O `id_token` é verificado com JWKS do Google (`jose`). Nenhum token vai na URL do front.
4. **WebAuthn com `@simplewebauthn/server`**, atestação `none`, `authenticatorAttachment: cross-platform`, `preferredAuthenticatorType: securityKey`. **Credencial `multiDevice` ou `backedUp` é recusada** (passkey sincronizada). A primeira chave exige **código de uso único gerado por CLI no servidor**: só quem tem acesso ao host cadastra a chave inicial.
5. **Sessão em Postgres** (cookie opaco, hash SHA-256 no banco), estágios `MFA_PENDING → ACTIVE ⇄ LOCKED`. Idle e duração absoluta avaliados no servidor a cada requisição; só `/auth/activity` (entrada humana) renova o idle.
6. **Cloudflare Access** como perímetro em produção, com validação independente do JWT no origin (`ENFORCE_ACCESS_JWT`).
7. **Redis adiado**: leases, fencing e revogação ficam no Postgres + hub em memória (instância única).

## Consequências / riscos
- As flags BE/BS são declaradas pelo autenticador. Garantia forte de "chave física de modelo X" exige atestação `direct` + FIDO MDS (pendente, risco residual documentado em [security.md](../security.md#riscos-residuais)).
- Rate limit em memória (instância única). Com mais réplicas, mover para Redis.
