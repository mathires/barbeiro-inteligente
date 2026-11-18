-- =====================================================================
-- Barbeiro Inteligente - agenda ao vivo (Supabase Realtime)
--
-- Como usar: no Supabase, "SQL Editor", cole e execute UMA vez. Pode repetir sem problema.
-- Nao altera dados nem permissoes: so avisa o Realtime de que a tabela agendamentos deve
-- publicar mudancas. Quem recebe os avisos e o app logado, e o RLS continua valendo: cada dono
-- so recebe eventos das proprias barbearias.
-- =====================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agendamentos'
  ) then
    alter publication supabase_realtime add table public.agendamentos;
  end if;
end $$;
