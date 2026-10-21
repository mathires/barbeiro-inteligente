# Barbeiro Inteligente

Aplicativo de gestão para barbearias do Rio de Janeiro. Uso exclusivo do proprietário: agenda, caixa, clientes, serviços e estoque em um só lugar, no computador ou no celular.

## Status

Protótipo visual navegável (`index.html`). O banco de dados está modelado em `supabase/schema.sql`, mas o aplicativo real ainda não foi construído.

## Escopo

- **Acesso:** somente o proprietário, com login e senha. Os barbeiros são cadastrados como profissionais (para a agenda e o cálculo de comissão), mas não têm acesso ao app.
- **Módulos:** Início (saudação e saldo do mês), Agenda, Receitas, Despesas, Clientes, Serviços, Produtos e Relatórios.
- **Várias barbearias:** os dados de cada barbearia ficam isolados desde o banco de dados. Um mesmo proprietário pode ter mais de uma.

## Como abrir o protótipo

1. Baixe o arquivo `index.html`.
2. Dê duplo clique nele para abrir no navegador.
3. Entre com qualquer usuário e senha. Os dados são fictícios e nada é salvo.

## Stack planejada (gratuita)

| Necessidade | Ferramenta |
| --- | --- |
| Editor de código | VS Code |
| Código e histórico | GitHub |
| Banco, login e segurança | Supabase |
| Publicação do site | Cloudflare Pages |
| Telas | React com Vite |
| App no celular | PWA (instalável pela tela inicial, sem loja de apps) |

## Decisões de arquitetura

1. **PWA em vez de app nativo.** Um único código atende web e celular, sem as taxas das lojas (Google Play: pagamento único; Apple: anuidade).
2. **Multi-barbearia desde o começo.** Toda tabela tem `barbearia_id`. A segurança por linha (Row Level Security) do Supabase só deixa cada dono ver os dados das próprias barbearias.
3. **Integridade entre barbearias.** Chaves estrangeiras compostas `(barbearia_id, id)` impedem que um registro de uma barbearia aponte para dados de outra.
4. **Sem totais gravados.** Estoque e saldos são calculados a partir de movimentos e lançamentos, para sempre bater com a origem.
5. **Agenda sem choque de horário.** O próprio banco recusa dois atendimentos sobrepostos para o mesmo profissional.
6. **Uma receita por atendimento.** Concluir um atendimento gera uma única receita.

## Estrutura do repositório

```
barbeiro-inteligente/
  README.md
  index.html
  supabase/
    schema.sql
```

## Roteiro

1. Criar o projeto no Supabase e executar `supabase/schema.sql`.
2. Login real do proprietário.
3. Cadastros: serviços, profissionais e clientes.
4. Agenda com bloqueio de choque de horário.
5. Receitas, despesas e a tela Início com o saldo do mês.
6. Produtos e estoque.
7. Relatórios.
8. Publicar e instalar como PWA.

## Cuidados

- **Planos gratuitos:** o plano gratuito da Vercel é restrito a uso não comercial, então a publicação prevista é no Cloudflare Pages. O Supabase gratuito pausa o projeto após 1 semana sem uso e limita o banco a 500 MB. Confirme os termos de uso comercial antes de atender clientes pagantes.
- **LGPD:** nome e telefone de clientes são dados pessoais. O modelo já prevê o registro de consentimento, e será preciso incluir política de privacidade.
- **Segredos:** nunca versionar chaves no repositório. No front-end usa-se apenas a chave pública (`anon`). A chave `service_role` nunca vai para o código do app.
