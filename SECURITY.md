# Política de segurança

## Relatar uma vulnerabilidade
**Não abra issue pública.** Use o relato privado do GitHub: aba **Security → Report a vulnerability** deste repositório.

Inclua:
- versão (commit);
- componente (`api`, `worker`, `controller`, `edge` ou `web`);
- passos para reproduzir e impacto esperado.

Respondemos o recebimento em até 7 dias. Quando houver correção, publicamos um advisory com crédito a quem relatou, se você quiser.

## Escopo
Bem-vindos: bypass de autenticação ou da chave física, escape do worker, SSRF pelo egress proxy, mistura entre perfis, vazamento de conteúdo em logs e corte de stream que não acontece.

Fora de escopo:
- ataques que exigem root no servidor ou malware no computador do visitante (riscos residuais documentados);
- engenharia social;
- negação de serviço por volume;
- falhas de sites de terceiros abertos dentro do navegador remoto.

## Estado
Este é um **protótipo**. Não houve pentest nem auditoria externa. O modelo de ameaças e a matriz de testes estão em [docs/security.md](docs/security.md).

Teste apenas na **sua própria instalação**, com contas suas ou de teste.
