-- Primeiro acesso: endereco da barbearia
alter table public.barbearias add column if not exists endereco text;

-- Horario proprio para sabado e domingo (nulo = mesmo horario dos dias de semana)
alter table public.barbearias drop constraint if exists barbearias_expediente_fds;
alter table public.barbearias
  add column if not exists abertura_fds  time,
  add column if not exists fechamento_fds time;
alter table public.barbearias add constraint barbearias_expediente_fds check (
  (abertura_fds is null and fechamento_fds is null)
  or (abertura_fds is not null and fechamento_fds is not null and fechamento_fds > abertura_fds)
);

create or replace function public.publico_barbearia(p_slug text) returns jsonb
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
    'abertura_fds', to_char(b.abertura_fds, 'HH24:MI'),
    'fechamento_fds', to_char(b.fechamento_fds, 'HH24:MI'),
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

create or replace function public.publico_agendar(
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
  v_abre     time;
  v_fecha    time;
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
  -- sabado e domingo podem ter horario proprio (nulo = mesmo horario dos dias de semana)
  v_abre  := b.abertura;
  v_fecha := b.fechamento;
  if extract(dow from v_local) in (0, 6) and b.abertura_fds is not null then
    v_abre  := b.abertura_fds;
    v_fecha := b.fechamento_fds;
  end if;
  if not (extract(dow from v_local)::smallint = any (b.dias_atendimento))
     or v_local::time < v_abre
     or (v_local::date + v_fecha) < (v_local + make_interval(mins => s.duracao_min)) then
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
