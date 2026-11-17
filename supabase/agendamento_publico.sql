-- =====================================================================
-- Barbeiro Inteligente - base do banco para o AGENDAMENTO ONLINE
--
-- Como usar: no Supabase, "SQL Editor", cole este arquivo e execute UMA vez
-- (depois do schema.sql e do endurecimento.sql). Nao apaga nem altera dados.
--
-- Decisoes (17/11/2026)
--  1. Confirmacao automatica: o agendamento online ja entra como 'confirmado'.
--     O barbeiro pode cancelar a qualquer momento pelo app.
--  2. Regras por barbearia (colunas novas): antecedencia minima de 60 min,
--     cancelamento pelo cliente ate 120 min antes, janela de 30 dias.
--  3. O link publico so funciona quando o dono liga agendamento_online e define o slug.
--     Enquanto estiver desligado, nada da barbearia e exposto.
--
-- Seguranca (o ponto principal)
--  - LEITURA publica (anon): publico_barbearia() e publico_ocupacao(). Devolvem so o que a
--    pagina precisa (servicos, nomes dos barbeiros, intervalos ocupados). Nunca dados de clientes.
--  - GRAVACAO (publico_agendar, publico_cancelar): so o service_role pode executar. Quem chama
--    e a Edge Function, DEPOIS de validar o Cloudflare Turnstile. Se estas funcoes fossem liberadas
--    para anon, qualquer pessoa poderia chama-las direto e pular o Turnstile.
--  - Conflito de horario: a constraint sem_choque_de_horario (schema.sql) e quem decide. A funcao
--    apenas tenta gravar e, se o banco recusar, tenta o proximo barbeiro ou devolve 'horario_ocupado'.
--  - Limites por telefone dentro da funcao: no maximo 2 agendamentos futuros ativos e 5 criados
--    nas ultimas 24 h. Telefone invalido, fora do expediente e antecedencia tambem sao recusados.
--
-- Erros devolvidos (message do erro, para o front traduzir em texto):
--  barbearia_indisponivel, consentimento_obrigatorio, nome_invalido, telefone_invalido,
--  servico_invalido, profissional_invalido, horario_invalido, fora_do_expediente, antecedencia,
--  fora_da_janela, limite_telefone, horario_ocupado, agendamento_nao_encontrado, nao_cancelavel,
--  prazo_cancelamento
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Configuracao do agendamento online (por barbearia)
-- ---------------------------------------------------------------------
alter table public.barbearias
  add column slug                 text,
  add column agendamento_online   boolean  not null default false,
  add column fuso                 text     not null default 'America/Sao_Paulo',
  add column abertura             time     not null default '09:00',
  add column fechamento           time     not null default '20:00',
  add column passo_min            integer  not null default 30 check (passo_min in (10, 15, 20, 30, 60)),
  add column dias_atendimento     smallint[] not null default '{1,2,3,4,5,6}',  -- 0 = domingo ... 6 = sabado
  add column antecedencia_min     integer  not null default 60  check (antecedencia_min between 0 and 1440),
  add column cancelamento_ate_min integer  not null default 120 check (cancelamento_ate_min between 0 and 2880),
  add column janela_dias          integer  not null default 30  check (janela_dias between 1 and 90),
  add constraint barbearias_slug_formato
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  add constraint barbearias_expediente check (fechamento > abertura),
  add constraint barbearias_dias_validos
    check (cardinality(dias_atendimento) > 0 and dias_atendimento <@ array[0,1,2,3,4,5,6]::smallint[]);

create unique index barbearias_slug_uq on public.barbearias (slug);

-- De onde veio o agendamento (app do barbeiro ou pagina publica).
alter table public.agendamentos
  add column origem text not null default 'app' check (origem in ('app', 'online'));

-- ---------------------------------------------------------------------
-- 2. Telefone: so digitos, para achar o cliente certo e aplicar limites
-- ---------------------------------------------------------------------
create function public.telefone_digitos(p text) returns text
language sql immutable set search_path = ''
as $$
  select case when char_length(d) > 11 and d like '55%' then substr(d, 3) else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s
$$;
-- authenticated precisa poder executar: o Postgres confere essa permissao ao gravar em clientes
-- (a funcao esta no indice). E uma funcao pura, sem acesso a tabelas.
revoke all on function public.telefone_digitos(text) from public, anon;
grant execute on function public.telefone_digitos(text) to authenticated, service_role;

create index clientes_telefone_idx
  on public.clientes (barbearia_id, public.telefone_digitos(telefone))
  where telefone is not null;

-- ---------------------------------------------------------------------
-- 3. LEITURA publica (anon)
-- ---------------------------------------------------------------------

-- Dados que a pagina precisa para montar o formulario. null = link inexistente ou desligado.
create function public.publico_barbearia(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  b public.barbearias;
begin
  select * into b from public.barbearias where slug = lower(p_slug) and agendamento_online;
  if not found then return null; end if;

  return jsonb_build_object(
    'nome', b.nome,
    'bairro', b.bairro,
    'fuso', b.fuso,
    'abertura', to_char(b.abertura, 'HH24:MI'),
    'fechamento', to_char(b.fechamento, 'HH24:MI'),
    'passo_min', b.passo_min,
    'dias_atendimento', to_jsonb(b.dias_atendimento),
    'antecedencia_min', b.antecedencia_min,
    'cancelamento_ate_min', b.cancelamento_ate_min,
    'janela_dias', b.janela_dias,
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'nome', s.nome, 'descricao', s.descricao,
               'duracao_min', s.duracao_min, 'preco', s.preco) order by s.nome)
      from public.servicos s where s.barbearia_id = b.id and s.ativo), '[]'::jsonb),
    'profissionais', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) order by p.nome)
      from public.profissionais p where p.barbearia_id = b.id and p.ativo), '[]'::jsonb)
  );
end $$;

-- Intervalos ocupados de um dia (so profissional + inicio + fim; nada do cliente).
-- Fora da janela de agendamento nao devolve nada, para ninguem varrer a agenda inteira.
create function public.publico_ocupacao(p_slug text, p_dia date)
returns table (profissional_id uuid, inicio timestamptz, fim timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.profissional_id, a.inicio, a.fim
  from public.barbearias b
  join public.agendamentos a on a.barbearia_id = b.id
  where b.slug = lower(p_slug)
    and b.agendamento_online
    and a.status not in ('cancelado', 'faltou')
    and p_dia between (now() at time zone b.fuso)::date
                  and (now() at time zone b.fuso)::date + b.janela_dias
    and a.inicio >= (p_dia::timestamp at time zone b.fuso)
    and a.inicio <  ((p_dia + 1)::timestamp at time zone b.fuso)
$$;

-- ---------------------------------------------------------------------
-- 4. GRAVACAO (somente service_role, via Edge Function com Turnstile)
-- ---------------------------------------------------------------------

-- p_profissional_id null = "quem estiver livre" (tenta os barbeiros por ordem de nome).
create function public.publico_agendar(
  p_slug            text,
  p_servico_id      uuid,
  p_profissional_id uuid,
  p_inicio          timestamptz,
  p_nome            text,
  p_telefone        text,
  p_consentimento   boolean
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  b          public.barbearias;
  s          public.servicos;
  r          record;
  v_nome     text;
  v_tel      text;
  v_fim      timestamptz;
  v_local    timestamp;
  v_cliente  uuid;
  v_agid     uuid;
  v_prof     uuid;
  v_prof_nome text;
begin
  select * into b from public.barbearias where slug = lower(p_slug) and agendamento_online;
  if not found then raise exception using errcode = 'P0001', message = 'barbearia_indisponivel'; end if;

  if not coalesce(p_consentimento, false) then
    raise exception using errcode = 'P0001', message = 'consentimento_obrigatorio';  -- LGPD
  end if;

  v_nome := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  if char_length(v_nome) < 2 or char_length(v_nome) > 80 then
    raise exception using errcode = 'P0001', message = 'nome_invalido';
  end if;

  -- DDD de 2 digitos (11 a 99) + celular de 9 digitos comecando por 9
  v_tel := public.telefone_digitos(p_telefone);
  if v_tel !~ '^[1-9][1-9]9[0-9]{8}$' then
    raise exception using errcode = 'P0001', message = 'telefone_invalido';
  end if;

  select * into s from public.servicos where id = p_servico_id and barbearia_id = b.id and ativo;
  if not found then raise exception using errcode = 'P0001', message = 'servico_invalido'; end if;

  if p_profissional_id is not null and not exists (
    select 1 from public.profissionais where id = p_profissional_id and barbearia_id = b.id and ativo
  ) then
    raise exception using errcode = 'P0001', message = 'profissional_invalido';
  end if;

  -- Horario: alinhado ao passo, em dia de atendimento, dentro do expediente (o servico tem de terminar ate o fechamento)
  v_fim   := p_inicio + make_interval(mins => s.duracao_min);
  v_local := p_inicio at time zone b.fuso;
  if extract(second from v_local) <> 0
     or (extract(hour from v_local) * 60 + extract(minute from v_local))::int % b.passo_min <> 0 then
    raise exception using errcode = 'P0001', message = 'horario_invalido';
  end if;
  if not (extract(dow from v_local)::smallint = any (b.dias_atendimento))
     or v_local::time < b.abertura
     or (v_local::date + b.fechamento) < (v_local + make_interval(mins => s.duracao_min)) then
    raise exception using errcode = 'P0001', message = 'fora_do_expediente';
  end if;
  if p_inicio < now() + make_interval(mins => b.antecedencia_min) then
    raise exception using errcode = 'P0001', message = 'antecedencia';
  end if;
  if p_inicio > now() + make_interval(days => b.janela_dias) then
    raise exception using errcode = 'P0001', message = 'fora_da_janela';
  end if;

  -- Uma gravacao por vez para o mesmo telefone (evita furar o limite com cliques simultaneos)
  perform pg_advisory_xact_lock(hashtextextended(b.id::text || v_tel, 0));

  if (select count(*) from public.agendamentos a
        join public.clientes c on c.barbearia_id = a.barbearia_id and c.id = a.cliente_id
       where a.barbearia_id = b.id and public.telefone_digitos(c.telefone) = v_tel
         and a.status in ('aguardando', 'confirmado') and a.inicio > now()) >= 2
     or (select count(*) from public.agendamentos a
           join public.clientes c on c.barbearia_id = a.barbearia_id and c.id = a.cliente_id
          where a.barbearia_id = b.id and public.telefone_digitos(c.telefone) = v_tel
            and a.origem = 'online' and a.criado_em > now() - interval '24 hours') >= 5 then
    raise exception using errcode = 'P0001', message = 'limite_telefone';
  end if;

  -- Cliente: reaproveita o cadastro do mesmo telefone (sem trocar o nome que o dono ja tem)
  select c.id into v_cliente from public.clientes c
   where c.barbearia_id = b.id and public.telefone_digitos(c.telefone) = v_tel
   order by c.criado_em limit 1;
  if v_cliente is null then
    insert into public.clientes (barbearia_id, nome, telefone, consentimento_lgpd_em)
    values (b.id, v_nome,
            format('(%s) %s-%s', substr(v_tel, 1, 2), substr(v_tel, 3, 5), substr(v_tel, 8)),
            now())
    returning id into v_cliente;
  else
    update public.clientes set consentimento_lgpd_em = coalesce(consentimento_lgpd_em, now())
     where id = v_cliente;
  end if;

  -- Tenta gravar; a constraint sem_choque_de_horario e quem decide se o horario esta livre
  for r in
    select p.id, p.nome from public.profissionais p
     where p.barbearia_id = b.id and p.ativo and (p_profissional_id is null or p.id = p_profissional_id)
     order by p.nome
  loop
    begin
      insert into public.agendamentos
        (barbearia_id, cliente_id, profissional_id, servico_id, inicio, fim, status, valor, origem)
      values (b.id, v_cliente, r.id, s.id, p_inicio, v_fim, 'confirmado', s.preco, 'online')
      returning id into v_agid;
      v_prof := r.id;
      v_prof_nome := r.nome;
      exit;
    exception when exclusion_violation then
      null;  -- ocupado: tenta o proximo barbeiro
    end;
  end loop;

  if v_agid is null then
    raise exception using errcode = 'P0001', message = 'horario_ocupado';
  end if;

  return jsonb_build_object(
    'id', v_agid,
    'inicio', p_inicio,
    'fim', v_fim,
    'profissional_id', v_prof,
    'profissional', v_prof_nome,
    'servico', s.nome,
    'duracao_min', s.duracao_min,
    'preco', s.preco,
    'cancelar_ate', p_inicio - make_interval(mins => b.cancelamento_ate_min)
  );
end $$;

-- Cancelamento pelo cliente: precisa do codigo do agendamento E do telefone.
-- Telefone errado devolve o mesmo erro de "nao encontrado" (nao revela se o codigo existe).
create function public.publico_cancelar(p_slug text, p_agendamento_id uuid, p_telefone text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  b public.barbearias;
  a public.agendamentos;
begin
  select * into b from public.barbearias where slug = lower(p_slug) and agendamento_online;
  if not found then raise exception using errcode = 'P0001', message = 'barbearia_indisponivel'; end if;

  select ag.* into a
    from public.agendamentos ag
    join public.clientes c on c.barbearia_id = ag.barbearia_id and c.id = ag.cliente_id
   where ag.id = p_agendamento_id and ag.barbearia_id = b.id
     and public.telefone_digitos(c.telefone) = public.telefone_digitos(p_telefone)
     for update of ag;
  if not found then raise exception using errcode = 'P0001', message = 'agendamento_nao_encontrado'; end if;

  if a.status not in ('aguardando', 'confirmado') then
    raise exception using errcode = 'P0001', message = 'nao_cancelavel';
  end if;
  if now() > a.inicio - make_interval(mins => b.cancelamento_ate_min) then
    raise exception using errcode = 'P0001', message = 'prazo_cancelamento';
  end if;

  update public.agendamentos set status = 'cancelado' where id = a.id;
  return jsonb_build_object('id', a.id, 'status', 'cancelado');
end $$;

-- ---------------------------------------------------------------------
-- 5. Permissoes de execucao
-- ---------------------------------------------------------------------
revoke all on function public.publico_barbearia(text)                                                   from public, anon, authenticated;
revoke all on function public.publico_ocupacao(text, date)                                              from public, anon, authenticated;
revoke all on function public.publico_agendar(text, uuid, uuid, timestamptz, text, text, boolean)       from public, anon, authenticated;
revoke all on function public.publico_cancelar(text, uuid, text)                                        from public, anon, authenticated;

-- Leitura: qualquer visitante (o verificador do Supabase vai listar estas 2 como aviso; e intencional)
grant execute on function public.publico_barbearia(text)      to anon, authenticated;
grant execute on function public.publico_ocupacao(text, date) to anon, authenticated;

-- Gravacao: so a Edge Function (service_role), depois do Turnstile
grant execute on function public.publico_agendar(text, uuid, uuid, timestamptz, text, text, boolean) to service_role;
grant execute on function public.publico_cancelar(text, uuid, text)                                  to service_role;

-- ---------------------------------------------------------------------
-- Para ligar uma barbearia (exemplo; troque o id e o slug):
--   update public.barbearias
--      set slug = 'poste-vermelho', agendamento_online = true
--    where id = '<id da barbearia>';
-- Link publico futuro: <site>/agendar/poste-vermelho
-- ---------------------------------------------------------------------
