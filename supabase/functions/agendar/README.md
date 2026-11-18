# Edge Function `agendar`

Única porta de gravação do agendamento online. O site público chama esta função; ela confere o
**Cloudflare Turnstile** e só então chama o banco (`publico_agendar` / `publico_cancelar`) com a
chave de serviço. As funções de gravação do banco **não** são liberadas para visitantes, então não
há como pular o Turnstile.

Publicada no projeto `barbeiro-inteligente-sp` sem verificação de JWT (o visitante não tem login).

URL: `https://dmjpxssrhwrfarnfuqzv.supabase.co/functions/v1/agendar` (POST, JSON)

## Pedidos

Agendar (exige `turnstile_token`):

```json
{ "acao": "agendar", "slug": "poste-vermelho", "servico_id": "<uuid>", "profissional_id": null,
  "inicio": "2026-11-20T13:00:00.000Z", "nome": "Ana Souza", "telefone": "(21) 99999-0000",
  "consentimento": true, "turnstile_token": "<token do widget>" }
```

`profissional_id: null` = "quem estiver livre". Resposta 200: dados do agendamento
(`id`, `profissional`, `servico`, `inicio`, `fim`, `preco`, `cancelar_ate`).

Cancelar (sem Turnstile; exige o código e o telefone de quem agendou):

```json
{ "acao": "cancelar", "slug": "poste-vermelho", "agendamento_id": "<uuid>", "telefone": "(21) 99999-0000" }
```

Erros: JSON `{ "erro": "<codigo>", "mensagem": "<texto em português>" }`. Códigos: `horario_ocupado` (409),
`limite_telefone` (429), `turnstile_invalido` (403), `telefone_invalido`, `fora_do_expediente`,
`antecedencia`, `consentimento_obrigatorio` (422), `barbearia_indisponivel`,
`agendamento_nao_encontrado` (404), `prazo_cancelamento`, `nao_cancelavel` (409),
`servico_indisponivel` (503, falha de configuração ou de rede).

## Segredos (Supabase > Edge Functions > Secrets)

| Nome | O que é |
|---|---|
| `TURNSTILE_SECRET_KEY` | Chave **secreta** do Turnstile. Sem ela a função recusa tudo (503). |
| `ALLOWED_ORIGINS` | Opcional. Sites que podem chamar, separados por vírgula. Padrão: o site do app e localhost. |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` o Supabase injeta sozinho.

## Turnstile: chaves de teste x chaves reais

A Cloudflare publica chaves de teste que sempre aprovam:

- chave do site: `1x00000000000000000000AA`
- chave secreta: `1x0000000000000000000000000000000AA`

Servem para testar o fluxo, **mas não bloqueiam robô nenhum**. Antes de divulgar o link de uma
barbearia, troque as duas por chaves reais (Cloudflare > Turnstile > Add site):
a pública vai na variável `VITE_TURNSTILE_SITE_KEY` (Cloudflare Workers > Settings > Build) e a
secreta em `TURNSTILE_SECRET_KEY` (Supabase). Se só uma das duas for trocada, o agendamento falha
fechado (o token de um par não vale no outro), nunca abre.

## Publicar de novo

Os arquivos são `index.ts` (Deno) e `handler.ts` (a lógica, testada em `test/agendar-function.test.js`).
Publicar pelo Supabase CLI (`supabase functions deploy agendar --no-verify-jwt`) ou pelo Claude.
