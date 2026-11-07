# Deploy em produção

Stack completa em [`docker-compose.prod.yml`](../docker-compose.prod.yml), atrás de **Cloudflare Tunnel + Access**. Nenhuma porta é publicada no host: a única entrada é o túnel. Funciona com `docker compose` puro ou com um orquestrador que aceite Compose (Coolify, Portainer…).

## Requisitos
- Hardware: veja [Configuração mínima](../README.md#configuração-mínima). Cada perfil ativo usa até `WORKER_MEMORY_LIMIT_MB` (1,5 GB por padrão).
- Host Linux x86-64 com Docker 24+ e kernel que permita user namespaces sem privilégio (o sandbox do Chromium depende disso). Em Ubuntu 23.10+, se `kernel.apparmor_restrict_unprivileged_userns=1` impedir o worker de subir (erro `sandbox_unavailable`), crie um perfil AppArmor para o runtime. **Não** desligue o sandbox.
- Domínio na Cloudflare, com Zero Trust (o plano gratuito basta).
- Projeto no Google Cloud com um cliente OAuth "Aplicativo da Web" para o app.
- Uma chave de segurança física FIDO2, de preferência duas (a segunda é reserva).

## 1. Google OAuth
1. Google Cloud → APIs e serviços → Credenciais → Criar ID do cliente OAuth → **Aplicativo da Web**.
2. URI de redirecionamento autorizado: `https://SEU_DOMINIO/api/auth/google/callback`.
3. Guarde o Client ID e o Client Secret (vão nas variáveis do passo 4).

Para o login Google do **Cloudflare Access** (passo 2), use um cliente OAuth **separado**, com o redirecionamento `https://SEU_TIME.cloudflareaccess.com/cdn-cgi/access/callback`.

## 2. Cloudflare
1. **Zero Trust → Settings → Authentication:** adicione o Google como método de login e habilite a chave de segurança como MFA.
2. **Networks → Tunnels:** crie um túnel dedicado (tipo cloudflared) e guarde o token.
3. No túnel, crie o *public hostname* `SEU_DOMINIO` → serviço `http://web:8080`.
4. **Access → Applications:** crie uma aplicação self-hosted para `SEU_DOMINIO`, com política *Allow* só para o e-mail do titular, login apenas pelo Google e MFA por chave de segurança. Anote o **Application Audience (AUD) tag**.
5. Opcional, recomendado: no *public hostname*, ative a exigência de token do Access na origem.

## 3. Segredos
Gere cada segredo com:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Guarde `DATA_ENCRYPTION_KEY` num cofre: perdê-la torna ilegível o e-mail cifrado do titular.

## 4. Variáveis
| Variável | Valor |
|---|---|
| `APP_ORIGIN` | `https://SEU_DOMINIO` |
| `WEBAUTHN_RP_ID` | `SEU_DOMINIO` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | cliente OAuth do app (passo 1) |
| `GOOGLE_CALLBACK_URL` | `https://SEU_DOMINIO/api/auth/google/callback` |
| `OWNER_GOOGLE_EMAILS` | e-mail Google do titular |
| `OAUTH_STATE_SECRET`, `DATA_ENCRYPTION_KEY`, `CONTROLLER_SECRET`, `POSTGRES_PASSWORD` | segredos gerados (passo 3) |
| `CF_ACCESS_TEAM_DOMAIN` | `https://SEU_TIME.cloudflareaccess.com` |
| `CF_ACCESS_AUDIENCE` | AUD tag da aplicação do Access |
| `CLOUDFLARE_TUNNEL_TOKEN` | token do túnel |

No Coolify, marque **todas** as variáveis como *runtime only* (desmarque "Available at Buildtime"). Senão elas viram `--build-arg` e os segredos ficam gravados no histórico das imagens.

## 5. Subir
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
O primeiro build leva ~10 min por causa do Chromium. As migrations rodam no start da API.

Depois, no host, aplique a regra de firewall que impede os workers de alcançar o gateway da rede interna (e, por ele, outros serviços do host):
```bash
sudo nft -f infra/firewall/workers-egress.nft
```

## 6. Primeiro acesso
1. Abra `https://SEU_DOMINIO`: o Access pede Google e chave; depois o app pede o Google de novo.
2. Gere o código da primeira chave dentro do container da API:
   ```bash
   docker exec -it $(docker ps -qf name=api) node dist/cli/enrollment-code.js
   ```
3. Informe o código na tela "Cadastre sua chave de segurança" e toque na chave.
4. Cadastre a chave reserva em **Configurações → Chaves de segurança**.

## Verificação
- Sem login no Access: toda rota (inclusive o WebSocket `/api/v1/stream`) redireciona para o Access.
- JWT do Access forjado: negado.
- Ao iniciar um perfil, o worker sobe *healthy*. Se aparecer `sandbox_unavailable`, veja os requisitos.

## Remover uma instalação
Os workers são criados pelo controller, **fora** do Compose. Remover a stack não apaga os containers nem os volumes dos perfis, que guardam cookies e sessões dos sites:
```bash
docker ps -aq --filter label=swn.role=worker | xargs -r docker rm -f
docker volume ls -q --filter name=swn-profile- | xargs -r docker volume rm
docker network rm subweb_workers
docker image rm subweb-worker:prod
```
Depois, nos sites usados (ex.: WhatsApp → Aparelhos conectados), desconecte as sessões, e apague na Cloudflare o túnel, o DNS e a aplicação do Access.
