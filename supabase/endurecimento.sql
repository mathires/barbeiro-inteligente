-- Endurecimento de seguranca (rodar uma vez no SQL Editor do Supabase).
-- Motivo: o verificador do Supabase avisou que estas duas funcoes de GATILHO ficaram
-- chamaveis pela API publica (/rest/v1/rpc/...). Gatilhos nao precisam desse privilegio:
-- o banco confere a permissao so na criacao do gatilho, nao a cada disparo.
-- (minhas_barbearias() continua liberada para usuarios logados: as regras de seguranca
--  por linha dependem dela.)
revoke execute on function public.novo_usuario()      from public, anon, authenticated;
revoke execute on function public.categorias_padrao() from public, anon, authenticated;
