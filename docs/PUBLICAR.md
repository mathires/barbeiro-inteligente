# Publicar o Barbeiro Inteligente

Tudo gratuito. Tempo estimado: 30 a 40 minutos.

## 1. Enviar o código ao GitHub

No VS Code (com o Git instalado), na pasta do projeto: **Controle do Código-Fonte** > escreva uma mensagem (ex.: "versão completa") > **Commit** > **Sincronizar/Push**.
O `.gitignore` já impede o envio do `.env` e da pasta `node_modules`.

Depois do primeiro envio, a aba **Actions** do repositório mostra os testes rodando sozinhos.

## 2. Publicar no Cloudflare Pages

1. Crie uma conta gratuita em cloudflare.com (você mesmo, com seu e-mail).
2. **Workers & Pages** > **Create** > **Pages** > **Connect to Git** > escolha o repositório `barbeiro-inteligente`.
3. Configurações de build:
   - Framework preset: **Vite** (ou "None")
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Em **Environment variables** (Production), adicione:
   - `VITE_SUPABASE_URL` = a URL do projeto (https://....supabase.co)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = a chave pública (`sb_publishable_...`)
   - `NODE_VERSION` = `22`
5. **Save and Deploy.** Ao terminar, o endereço será algo como `barbeiro-inteligente.pages.dev`.

A partir daí, cada envio ao GitHub publica a versão nova automaticamente.

## 3. Ajustar o Supabase

- **Authentication > URL Configuration:** em *Site URL*, coloque o endereço do Cloudflare.
- **Authentication > Sign In / Providers (Email):** desative **"Allow new users to sign up"** assim que seu usuário estiver criado. O app é só do proprietário; deixar o cadastro aberto permitiria que qualquer pessoa crie contas usando a chave pública. Novos usuários passam a ser criados só por você, em Authentication > Users.

## 4. Instalar no celular

- **Android (Chrome):** abrir o endereço > menu (três pontos) > **Instalar app**.
- **iPhone (Safari):** abrir o endereço > botão Compartilhar > **Adicionar à Tela de Início**.

## 5. Evitar que o Supabase pause por inatividade

No GitHub: **Settings > Secrets and variables > Actions**.
- Aba **Variables** > New: `SUPABASE_URL` = URL do projeto.
- Aba **Secrets** > New: `SUPABASE_PUBLISHABLE_KEY` = chave pública.

A rotina em `.github/workflows/manter-supabase-ativo.yml` faz uma consulta simples a cada 3 dias. O uso normal do app também mantém o projeto ativo.

## 6. Antes de usar com dados reais de clientes

- Senha forte e exclusiva no usuário do Supabase.
- Confirmar os termos de uso comercial dos planos gratuitos (Supabase, Cloudflare, GitHub).
- Verificar no painel do Supabase (Database > Backups) o que o plano oferece e exportar os dados periodicamente. Não conte com backup automático no plano gratuito sem conferir.
- Ter política de privacidade (LGPD) para os dados de clientes.
- Conferir os números do app contra a sua contabilidade durante o primeiro mês.
