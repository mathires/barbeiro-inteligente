// Conversa da pagina publica com o servidor.
//  - Leitura: funcoes publicas do banco (publico_barbearia e publico_ocupacao), com a chave publica.
//  - Gravacao: SOMENTE pela Edge Function "agendar", que confere o Turnstile. O banco nao deixa
//    visitantes gravarem por outro caminho.
import { supabase } from './supabase.js'

// Chave de TESTE da Cloudflare (sempre aprova): serve para testar o fluxo, mas nao barra robos.
// Em producao defina VITE_TURNSTILE_SITE_KEY (Cloudflare Workers > Settings > Build) com a chave real.
export const CHAVE_TESTE_TURNSTILE = '1x00000000000000000000AA'
export const CHAVE_TURNSTILE = import.meta.env.VITE_TURNSTILE_SITE_KEY || CHAVE_TESTE_TURNSTILE
export const TURNSTILE_EM_TESTE = CHAVE_TURNSTILE === CHAVE_TESTE_TURNSTILE

const SEM_CONEXAO = { ok: false, erro: 'rede', mensagem: 'Sem conexão com o servidor. Confira sua internet e tente de novo.' }

// Dados para montar o formulario. { ok:true, dados } | { ok:true, dados:null } (link inexistente ou desligado) | { ok:false }
export async function lerBarbearia(slug) {
  if (!supabase) return { ok: false, erro: 'config', mensagem: 'Site sem configuração.' }
  try {
    const { data, error } = await supabase.rpc('publico_barbearia', { p_slug: slug })
    if (error) return SEM_CONEXAO
    return { ok: true, dados: data }
  } catch { return SEM_CONEXAO }
}

// Intervalos ocupados de um dia (so profissional, inicio e fim)
export async function lerOcupacao(slug, dia) {
  if (!supabase) return { ok: false }
  try {
    const { data, error } = await supabase.rpc('publico_ocupacao', { p_slug: slug, p_dia: dia })
    return error ? { ok: false } : { ok: true, dados: data ?? [] }
  } catch { return { ok: false } }
}

// Agendar e cancelar. Devolve { ok:true, dados } ou { ok:false, erro, mensagem, status }.
export async function chamarFuncao(corpo) {
  const base = import.meta.env.VITE_SUPABASE_URL
  if (!base) return { ok: false, erro: 'config', mensagem: 'Site sem configuração.' }
  let r
  try {
    r = await fetch(`${base}/functions/v1/agendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
  } catch { return SEM_CONEXAO }
  let json = null
  try { json = await r.json() } catch { /* corpo vazio */ }
  if (r.ok) return { ok: true, dados: json }
  return {
    ok: false, status: r.status, erro: json?.erro ?? 'erro_interno',
    mensagem: json?.mensagem ?? 'Não foi possível concluir agora. Tente de novo.',
  }
}
