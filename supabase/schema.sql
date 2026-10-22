-- =====================================================================
-- Barbeiro Inteligente - modelo de dados (Supabase / PostgreSQL)
--
-- Como usar: no Supabase, abra "SQL Editor", cole este arquivo inteiro e
-- execute UMA vez em um projeto novo.
--
-- Ideias principais
--  1. Aplicativo só do proprietário: quem faz login é o dono (auth.users).
--  2. Multi-barbearia: toda tabela tem barbearia_id e o banco só entrega
--     ao dono as linhas das barbearias dele (Row Level Security).
--  3. Chaves compostas (barbearia_id, id) impedem ligar dados de barbearias
--     diferentes, mesmo por engano.
--  4. Nada de totais gravados: estoque e saldos são calculados.
-- =====================================================================

-- Necessária para a regra "sem choque de horário" na agenda.
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- Tipos fixos
-- ---------------------------------------------------------------------
create type public.status_agendamento as enum
  ('aguardando', 'confirmado', 'em_atendimento', 'concluido', 'cancelado', 'faltou');
create type public.forma_pagamento as enum ('pix', 'cartao', 'dinheiro');
create type public.tipo_movimento as enum ('entrada', 'saida', 'ajuste');

-- ---------------------------------------------------------------------
-- Perfil do dono (usado na saudação da tela Início)
-- ---------------------------------------------------------------------
create table public.perfis (
  id        uuid primary key references auth.users (id) on delete cascade,
  nome      text not null,
  criado_em timestamptz not null default now()
);

-- Cria o perfil automaticamente quando o dono se cadastra.
create function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.perfis (id, nome)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1))
  );
  return new;
end $$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.novo_usuario();

-- ---------------------------------------------------------------------
-- Barbearias (cada uma pertence a um dono)
-- ---------------------------------------------------------------------
create table public.barbearias (
  id        uuid primary key default gen_random_uuid(),
  dono_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome      text not null,
  bairro    text,
  cidade    text not null default 'Rio de Janeiro',
  uf        char(2) not null default 'RJ',
  cnpj      text,
  criado_em timestamptz not null default now()
);
create index on public.barbearias (dono_id);

-- Lista as barbearias do usuário logado. Usada nas regras de segurança.
create function public.minhas_barbearias() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.barbearias where dono_id = (select auth.uid())
$$;
revoke all on function public.minhas_barbearias() from public, anon;
grant execute on function public.minhas_barbearias() to authenticated;

-- ---------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------
create table public.categorias_despesa (
  id           uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references public.barbearias (id) on delete cascade,
  nome         text not null,
  unique (barbearia_id, id),
  unique (barbearia_id, nome)
);

-- Toda barbearia nova já nasce com as categorias mais comuns.
create function public.categorias_padrao() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.categorias_despesa (barbearia_id, nome)
  select new.id, c
  from unnest(array['Aluguel', 'Comissões', 'Produtos', 'Energia', 'Água',
                    'Internet', 'Marketing', 'Manutenção', 'Outros']) as c;
  return new;
end $$;

create trigger ao_criar_barbearia
  after insert on public.barbearias
  for each row execute function public.categorias_padrao();

-- Barbeiros que atendem. Não têm login: servem para agenda e comissão.
create table public.profissionais (
  id           uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references public.barbearias (id) on delete cascade,
  nome         text not null,
  comissao_pct numeric(5,2) not null default 0 check (comissao_pct between 0 and 100),
  ativo        boolean not null default true,
  unique (barbearia_id, id)
);

create table public.servicos (
  id           uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references public.barbearias (id) on delete cascade,
  nome         text not null,
  duracao_min  integer not null check (duracao_min > 0),
  preco        numeric(10,2) not null check (preco >= 0),
  descricao    text,
  ativo        boolean not null default true,
  unique (barbearia_id, id),
  unique (barbearia_id, nome)
);

create table public.clientes (
  id                   uuid primary key default gen_random_uuid(),
  barbearia_id         uuid not null references public.barbearias (id) on delete cascade,
  nome                 text not null,
  telefone             text,
  aniversario          date,
  servico_preferido_id uuid,
  observacoes          text,
  consentimento_lgpd_em timestamptz,          -- quando o cliente autorizou o uso dos dados
  criado_em            timestamptz not null default now(),
  unique (barbearia_id, id),
  foreign key (barbearia_id, servico_preferido_id) references public.servicos (barbearia_id, id)
);
create index on public.clientes (barbearia_id, nome);

-- ---------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------
create table public.agendamentos (
  id              uuid primary key default gen_random_uuid(),
  barbearia_id    uuid not null references public.barbearias (id) on delete cascade,
  cliente_id      uuid,
  profissional_id uuid not null,
  servico_id      uuid not null,
  inicio          timestamptz not null,
  fim             timestamptz not null,
  status          public.status_agendamento not null default 'confirmado',
  valor           numeric(10,2) not null check (valor >= 0),  -- preço cobrado na hora
  observacoes     text,
  criado_em       timestamptz not null default now(),
  check (fim > inicio),
  unique (barbearia_id, id),
  foreign key (barbearia_id, cliente_id)      references public.clientes      (barbearia_id, id),
  foreign key (barbearia_id, profissional_id) references public.profissionais (barbearia_id, id),
  foreign key (barbearia_id, servico_id)      references public.servicos      (barbearia_id, id),
  -- O banco recusa dois atendimentos sobrepostos para o mesmo profissional.
  constraint sem_choque_de_horario exclude using gist (
    profissional_id with =,
    tstzrange(inicio, fim) with &&
  ) where (status not in ('cancelado', 'faltou'))
);
create index on public.agendamentos (barbearia_id, inicio);

-- ---------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------
create table public.receitas (
  id               uuid primary key default gen_random_uuid(),
  barbearia_id     uuid not null references public.barbearias (id) on delete cascade,
  data             date not null default current_date,
  descricao        text not null,
  forma_pagamento  public.forma_pagamento not null,
  valor            numeric(12,2) not null check (valor > 0),
  cliente_id       uuid,
  agendamento_id   uuid unique,               -- no máximo uma receita por atendimento
  criado_em        timestamptz not null default now(),
  foreign key (barbearia_id, cliente_id)     references public.clientes     (barbearia_id, id),
  foreign key (barbearia_id, agendamento_id) references public.agendamentos (barbearia_id, id)
);
create index on public.receitas (barbearia_id, data);

create table public.despesas (
  id           uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references public.barbearias (id) on delete cascade,
  categoria_id uuid not null,
  descricao    text not null,
  vencimento   date not null,
  pago_em      date,                          -- vazio = ainda a pagar
  valor        numeric(12,2) not null check (valor > 0),
  criado_em    timestamptz not null default now(),
  foreign key (barbearia_id, categoria_id) references public.categorias_despesa (barbearia_id, id)
);
create index on public.despesas (barbearia_id, vencimento);

-- ---------------------------------------------------------------------
-- Produtos e estoque
-- ---------------------------------------------------------------------
create table public.produtos (
  id             uuid primary key default gen_random_uuid(),
  barbearia_id   uuid not null references public.barbearias (id) on delete cascade,
  nome           text not null,
  custo          numeric(10,2) not null check (custo >= 0),
  preco_venda    numeric(10,2) check (preco_venda >= 0),   -- vazio = uso interno
  estoque_minimo integer not null default 0 check (estoque_minimo >= 0),
  ativo          boolean not null default true,
  unique (barbearia_id, id)
);

-- Cada compra, venda ou ajuste é um movimento. O saldo é a soma deles.
create table public.movimentos_estoque (
  id           uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references public.barbearias (id) on delete cascade,
  produto_id   uuid not null,
  tipo         public.tipo_movimento not null,
  quantidade   integer not null,              -- entrada positiva, saída negativa
  data         date not null default current_date,
  observacao   text,
  check (
    (tipo = 'entrada' and quantidade > 0) or
    (tipo = 'saida'   and quantidade < 0) or
    (tipo = 'ajuste'  and quantidade <> 0)
  ),
  foreign key (barbearia_id, produto_id) references public.produtos (barbearia_id, id)
);
create index on public.movimentos_estoque (barbearia_id, produto_id);

-- ---------------------------------------------------------------------
-- Visões calculadas (respeitam a segurança de quem consulta)
-- ---------------------------------------------------------------------
create view public.vw_produtos_estoque with (security_invoker = true) as
select
  p.id,
  p.barbearia_id,
  p.nome,
  p.custo,
  p.preco_venda,
  p.estoque_minimo,
  coalesce(sum(m.quantidade), 0)::integer as estoque_atual,
  coalesce(sum(m.quantidade), 0) < p.estoque_minimo as repor
from public.produtos p
left join public.movimentos_estoque m
  on m.produto_id = p.id and m.barbearia_id = p.barbearia_id
where p.ativo
group by p.id;

-- Saldo por mês.
--  saldo_previsto  = receitas - todas as despesas com vencimento no mês
--  saldo_realizado = receitas - apenas as despesas já pagas
-- Simplificação inicial: despesas entram pelo mês de vencimento.
create view public.vw_saldo_mensal with (security_invoker = true) as
with r as (
  select barbearia_id, date_trunc('month', data)::date as mes, sum(valor) as receitas
  from public.receitas
  group by 1, 2
), d as (
  select barbearia_id,
         date_trunc('month', vencimento)::date as mes,
         sum(valor) as despesas_total,
         sum(valor) filter (where pago_em is not null) as despesas_pagas
  from public.despesas
  group by 1, 2
)
select
  coalesce(r.barbearia_id, d.barbearia_id) as barbearia_id,
  coalesce(r.mes, d.mes) as mes,
  coalesce(r.receitas, 0) as receitas,
  coalesce(d.despesas_total, 0) as despesas_total,
  coalesce(d.despesas_pagas, 0) as despesas_pagas,
  coalesce(r.receitas, 0) - coalesce(d.despesas_total, 0) as saldo_previsto,
  coalesce(r.receitas, 0) - coalesce(d.despesas_pagas, 0) as saldo_realizado
from r
full join d on d.barbearia_id = r.barbearia_id and d.mes = r.mes;

-- ---------------------------------------------------------------------
-- Segurança: cada dono só enxerga o que é dele
-- ---------------------------------------------------------------------
alter table public.perfis enable row level security;
create policy "perfil_proprio" on public.perfis
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter table public.barbearias enable row level security;
create policy "dono_da_barbearia" on public.barbearias
  for all to authenticated
  using (dono_id = (select auth.uid()))
  with check (dono_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array[
    'categorias_despesa', 'profissionais', 'servicos', 'clientes',
    'agendamentos', 'receitas', 'despesas', 'produtos', 'movimentos_estoque'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "dono_acessa" on public.%I for all to authenticated
         using (barbearia_id in (select public.minhas_barbearias()))
         with check (barbearia_id in (select public.minhas_barbearias()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Teste rápido (opcional): depois de criar um usuário e logar com ele,
-- rode no SQL Editor com a opção de simular o usuário:
--   insert into public.barbearias (nome, bairro) values ('Barbearia Modelo', 'Tijuca');
--   select * from public.categorias_despesa;   -- deve listar as 9 categorias
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Endurecimento: funcoes de gatilho nao devem ser chamaveis pela API
-- (mesmo conteudo de supabase/endurecimento.sql, para bancos novos)
-- ---------------------------------------------------------------------
revoke execute on function public.novo_usuario()      from public, anon, authenticated;
revoke execute on function public.categorias_padrao() from public, anon, authenticated;
