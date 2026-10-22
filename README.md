# Barbeiro Inteligente

Aplicativo de gestão para barbearias do Rio de Janeiro. **Uso exclusivo do proprietário**: agenda, caixa, clientes, serviços e estoque em um só lugar, no computador ou no celular (instalável como app, sem loja).

## O que já faz

| Módulo | Funções |
| --- | --- |
| Início | Saudação com trocadilho e nome do usuário; saldo do mês (previsto e realizado); agenda de hoje; contas vencidas e a vencer; produtos para repor |
| Agenda | Visão por dia e por profissional; novo/editar atendimento (serviço preenche valor e duração); bloqueio de choque de horário; status (confirmar, iniciar, concluir, cancelar, faltou, reabrir); **concluir gera a receita sozinho** |
| Receitas | Lançamento manual e automático (atendimentos), por mês, totais por forma de pagamento |
| Despesas | Por mês de vencimento, categorias, marcar como paga, repetir no mês seguinte |
| Clientes | Cadastro com telefone, aniversário, serviço preferido e registro de consentimento (LGPD) |
| Serviços | Preço, duração, ativar/desativar |
| Profissionais | Barbeiros como cadastro (sem login), com % de comissão |
| Produtos | Custo, preço de venda, estoque mínimo, entrada/saída/ajuste, **venda de produto** (gera receita e baixa estoque) |
| Relatórios | Resumo do mês, últimos 6 meses, receitas por forma de pagamento, despesas por categoria, comissões, serviços mais realizados, ticket médio, taxa de faltas, aniversariantes |

Várias barbearias: um mesmo proprietário pode ter mais de uma; cada tela mostra só os dados da barbearia selecionada.

## Como rodar no seu computador

Pré-requisito: Node.js LTS (20.19+ ou 22.12+).

1. Copie `.env.example` para `.env` e preencha a URL e a chave **pública** do Supabase. O `.env` não vai para o GitHub.
2. Terminal na pasta do projeto: `npm install` (só na primeira vez).
3. `npm run dev` e abra o endereço mostrado (normalmente http://localhost:5173).
4. Entre com o usuário criado em Authentication > Users no Supabase.

Outros comandos: `npm test` (testes automáticos), `npm run build` (gera a versão para publicar).

## Publicar e instalar no celular

Veja [`docs/PUBLICAR.md`](docs/PUBLICAR.md).

## Arquitetura

```
src/
  main.jsx, App.jsx, styles.css
  components/   Layout (menu lateral, barra superior, menu do celular), ui (peças visuais), Formulario, Modal, Icone, ErroGeral
  hooks/        useRota (rotas pelo # da URL), useCadastro (carregar/gravar), useTema, useBadges, useToast
  lib/          supabase, campos (formulários), agenda, operacoes, relatorios, clientes, mes, formato, frases
  pages/        Login, NovaBarbearia, Inicio, Agenda, Receitas, Despesas, Clientes, Servicos, Profissionais, Produtos, Relatorios
supabase/schema.sql      modelo do banco (tabelas, segurança por linha, views)
public/                  manifest, ícones e service worker (PWA)
test/                    testes automáticos (banco simulado em memória)
.github/workflows/       testes automáticos e rotina que mantém o Supabase ativo
prototipo/index.html     protótipo visual aprovado (referência do design; o app usa o mesmo CSS e as mesmas fontes)
```

Decisões:

1. **PWA em vez de app nativo.** Um código atende web e celular, sem taxas de loja.
2. **Multi-barbearia desde o banco.** Toda tabela tem `barbearia_id` e a segurança por linha (RLS) só libera as barbearias do dono logado. O app também filtra por `barbearia_id`, mas a barreira real é o banco.
3. **Chaves estrangeiras compostas** `(barbearia_id, id)`: um registro nunca aponta para dados de outra barbearia.
4. **Sem totais gravados.** Estoque e saldos são calculados (views e consultas) a partir de movimentos e lançamentos.
5. **Sem choque de horário**, garantido pelo próprio banco (exclusion constraint) e avisado antes pelo app.
6. **Uma receita por atendimento** (`agendamento_id` único). Concluir cria a receita; reabrir remove.
7. **Operações em 2 passos com desfazer** (venda de produto, concluir atendimento): se o segundo passo falha, o primeiro é revertido.
8. **Service worker sem dados.** Só arquivos do próprio site entram no cache; chamadas ao Supabase nunca são guardadas.

## Regras de negócio para revisar (contador)

- **Saldo previsto** = receitas do mês - todas as despesas com vencimento no mês. **Saldo realizado** = receitas - despesas pagas. Despesas entram pelo mês de **vencimento** (não pela data de pagamento).
- **Receitas** entram pela data do lançamento (atendimento: dia do serviço). Não há conciliação de cartão nem taxas de maquininha ainda.
- **Comissão** = % do profissional sobre o valor dos atendimentos **concluídos** do mês. O app mostra o valor, mas o lançamento em Despesas (categoria Comissões) é manual.
- **Produtos**: valor em estoque a custo; a venda gera receita pelo preço informado, sem apuração de custo da mercadoria vendida.

## Cuidados

- **Planos gratuitos:** o Supabase gratuito pausa o projeto após ~1 semana sem uso e limita o banco a 500 MB; a Vercel gratuita é só para uso não comercial (por isso o Cloudflare Pages). Confirme os termos de uso comercial antes de atender clientes pagantes.
- **Cadastros abertos:** depois de criar seu usuário, desative novos cadastros em Authentication (veja `docs/PUBLICAR.md`).
- **LGPD:** nome e telefone de clientes são dados pessoais. O sistema registra o consentimento; será preciso política de privacidade.
- **Segredos:** nunca versionar chaves secretas. No front-end só a chave pública (`publishable`/`anon`). A `service_role`/`secret` nunca vai para o código.

## Próximas ideias

Lembrete de agendamento por WhatsApp, taxas de maquininha, fechamento mensal com exportação (CSV/PDF), metas, "esqueci minha senha", agendamento online pelo cliente (exigiria rever a segurança do modelo).
