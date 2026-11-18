// Logica da Edge Function "agendar" (sem depender do Deno, para poder ser testada com o vitest).
//
// Papel: ser a UNICA porta de gravacao do agendamento online.
//  1. agendar:  valida o Cloudflare Turnstile e so entao chama publico_agendar (service_role).
//  2. cancelar: chama publico_cancelar. Nao usa Turnstile: exige o codigo do agendamento (uuid
//     impossivel de adivinhar) E o telefone de quem agendou.
// As funcoes do banco NAO sao liberadas para anon: se fossem, qualquer um as chamaria direto e
// pularia o Turnstile (ver supabase/agendamento_publico.sql).
//
// Variaveis de ambiente
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (o Supabase injeta sozinho)
//   TURNSTILE_SECRET_KEY                      (secreta do Cloudflare Turnstile; NUNCA vai para o front)
//   ALLOWED_ORIGINS                           (opcional, separadas por virgula; sites que podem chamar)

type Env = Record<string, string | undefined>
type Deps = { env: Env; fetch: typeof fetch }

const ORIGENS_PADRAO = [
  'https://barbeiro-inteligente.demonfoxninja123.workers.dev',
  'http://localhost:5173',
  'http://localhost:4173',
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const LIMITE_CORPO = 8 * 1024

// Erros que o banco devolve de proposito (message do RAISE) -> status HTTP e texto para o cliente
const ERROS: Record<string, [number, string]> = {
  barbearia_indisponivel: [404, 'Esta barbearia não está recebendo agendamentos online agora.'],
  consentimento_obrigatorio: [422, 'Para agendar, é preciso concordar com o uso do seu nome e telefone.'],
  nome_invalido: [422, 'Informe seu nome.'],
  telefone_invalido: [422, 'Informe o WhatsApp com DDD e 9 dígitos, por exemplo (21) 99999-0000.'],
  servico_invalido: [422, 'Esse serviço não está mais disponível. Escolha outro.'],
  profissional_invalido: [422, 'Esse barbeiro não está mais disponível. Escolha outro.'],
  horario_invalido: [422, 'Horário inválido. Escolha um dos horários da lista.'],
  fora_do_expediente: [422, 'Esse horário está fora do expediente. Escolha outro.'],
  antecedencia: [422, 'Esse horário já está muito próximo. Escolha um mais adiante.'],
  fora_da_janela: [422, 'Ainda não abrimos a agenda para essa data.'],
  limite_telefone: [429, 'Esse telefone já tem agendamentos em aberto. Cancele um deles ou aguarde para marcar outro.'],
  horario_ocupado: [409, 'Esse horário acabou de ser reservado. Escolha outro.'],
  agendamento_nao_encontrado: [404, 'Não encontramos esse agendamento com esse telefone.'],
  nao_cancelavel: [409, 'Esse agendamento não pode mais ser cancelado.'],
  prazo_cancelamento: [409, 'O prazo para cancelar pelo site acabou. Fale com a barbearia pelo WhatsApp.'],
}

export function criarHandler({ env, fetch: buscar }: Deps) {
  const permitidas = (env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean)) ?? ORIGENS_PADRAO

  const cabecalhos = (req: Request) => {
    const origem = req.headers.get('origin')
    const h: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' }
    if (origem && permitidas.includes(origem)) {
      h['Access-Control-Allow-Origin'] = origem
      h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
      h['Access-Control-Allow-Headers'] = 'content-type, apikey, authorization'
      h['Access-Control-Max-Age'] = '600'
    }
    return h
  }

  return async function atender(req: Request): Promise<Response> {
    const h = cabecalhos(req)
    const responder = (status: number, corpo: unknown) => new Response(status === 204 ? null : JSON.stringify(corpo), { status, headers: h })
    const falha = (status: number, erro: string, mensagem: string) => responder(status, { erro, mensagem })

    if (req.method === 'OPTIONS') return responder(204, null)
    if (req.method !== 'POST') return falha(405, 'metodo_nao_permitido', 'Use POST.')

    // Corpo pequeno e JSON valido
    let dados: Record<string, unknown>
    try {
      const texto = await req.text()
      if (texto.length > LIMITE_CORPO) return falha(413, 'corpo_grande', 'Pedido grande demais.')
      dados = JSON.parse(texto)
      if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) throw new Error('formato')
    } catch {
      return falha(400, 'pedido_invalido', 'Pedido inválido.')
    }

    const texto = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null)
    const slug = texto(dados.slug, 40)
    if (!slug || !SLUG.test(slug) || slug.length < 3) return falha(400, 'pedido_invalido', 'Endereço da barbearia inválido.')

    const url = env.SUPABASE_URL
    const chave = env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !chave) {
      console.error('agendar: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente')
      return falha(503, 'servico_indisponivel', 'Serviço indisponível no momento. Tente de novo em instantes.')
    }

    const chamarBanco = async (funcao: string, corpo: Record<string, unknown>) => {
      let r: Response
      try {
        r = await buscar(`${url}/rest/v1/rpc/${funcao}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: chave, Authorization: `Bearer ${chave}` },
          body: JSON.stringify(corpo),
        })
      } catch (e) {
        console.error(`agendar: banco inacessivel (${funcao})`, e instanceof Error ? e.message : e)
        return falha(503, 'servico_indisponivel', 'Serviço indisponível no momento. Tente de novo em instantes.')
      }
      if (r.ok) return responder(200, await r.json())
      let erro: { code?: string; message?: string } = {}
      try { erro = await r.json() } catch { /* corpo vazio */ }
      const conhecido = erro.code === 'P0001' && erro.message ? ERROS[erro.message] : undefined
      if (conhecido) return falha(conhecido[0], erro.message as string, conhecido[1])
      // Nunca devolve ao cliente o texto de um erro inesperado do banco
      console.error(`agendar: erro inesperado em ${funcao}`, r.status, erro.code, erro.message)
      return falha(500, 'erro_interno', 'Não foi possível concluir agora. Tente de novo.')
    }

    // ---- cancelar
    if (dados.acao === 'cancelar') {
      const id = texto(dados.agendamento_id, 36)
      const telefone = texto(dados.telefone, 30)
      if (!id || !UUID.test(id) || !telefone) return falha(400, 'pedido_invalido', 'Pedido inválido.')
      return chamarBanco('publico_cancelar', { p_slug: slug, p_agendamento_id: id, p_telefone: telefone })
    }

    // ---- agendar
    if (dados.acao !== 'agendar') return falha(400, 'pedido_invalido', 'Pedido inválido.')

    const servico = texto(dados.servico_id, 36)
    const profissional = dados.profissional_id === null || dados.profissional_id === undefined ? null : texto(dados.profissional_id, 36)
    const inicio = texto(dados.inicio, 40)
    const nome = texto(dados.nome, 120)
    const telefone = texto(dados.telefone, 30)
    const token = texto(dados.turnstile_token, 2048)
    if (
      !servico || !UUID.test(servico) ||
      (profissional !== null && !UUID.test(profissional)) ||
      !inicio || Number.isNaN(Date.parse(inicio)) ||
      nome === null || telefone === null || typeof dados.consentimento !== 'boolean'
    ) return falha(400, 'pedido_invalido', 'Pedido inválido.')
    if (!token) return falha(403, 'turnstile_invalido', 'Confirme que você não é um robô e tente de novo.')

    // Turnstile: sem a chave secreta configurada, NAO grava (falha fechada)
    const segredo = env.TURNSTILE_SECRET_KEY
    if (!segredo) {
      console.error('agendar: TURNSTILE_SECRET_KEY nao configurada')
      return falha(503, 'servico_indisponivel', 'Serviço indisponível no momento. Tente de novo em instantes.')
    }
    try {
      const form = new URLSearchParams({ secret: segredo, response: token })
      const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      if (ip) form.set('remoteip', ip)
      const v = await buscar('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
      const resultado = await v.json()
      if (!resultado?.success) return falha(403, 'turnstile_invalido', 'Não conseguimos confirmar que você não é um robô. Tente de novo.')
    } catch (e) {
      console.error('agendar: falha ao validar o Turnstile', e instanceof Error ? e.message : e)
      return falha(503, 'servico_indisponivel', 'Serviço indisponível no momento. Tente de novo em instantes.')
    }

    return chamarBanco('publico_agendar', {
      p_slug: slug,
      p_servico_id: servico,
      p_profissional_id: profissional,
      p_inicio: new Date(inicio).toISOString(),
      p_nome: nome,
      p_telefone: telefone,
      p_consentimento: dados.consentimento,
    })
  }
}
