import { describe, it, expect } from 'vitest'
import { criarHandler } from '../supabase/functions/agendar/handler.ts'

const SERVICO = '11111111-1111-4111-8111-111111111111'
const BARBEIRO = '22222222-2222-4222-8222-222222222222'
const AGENDAMENTO = '33333333-3333-4333-8333-333333333333'
const SITE = 'https://barbeiro-inteligente.demonfoxninja123.workers.dev'

const envBase = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico',
  TURNSTILE_SECRET_KEY: 'segredo-turnstile',
}

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

// fetch de mentira: registra as chamadas e responde conforme o destino
function montar({ turnstile = { success: true }, banco = { ok: true, corpo: { id: AGENDAMENTO } }, env = envBase } = {}) {
  const chamadas = []
  const fetchFalso = async (url, init) => {
    chamadas.push({ url: String(url), init })
    if (String(url).includes('challenges.cloudflare.com')) {
      if (turnstile instanceof Error) throw turnstile
      return json(turnstile)
    }
    if (banco instanceof Error) throw banco
    return banco.ok ? json(banco.corpo) : json(banco.corpo, banco.status ?? 400)
  }
  const atender = criarHandler({ env, fetch: fetchFalso })
  const pedido = (corpo, { metodo = 'POST', origem = SITE, cru } = {}) =>
    atender(new Request('https://projeto.supabase.co/functions/v1/agendar', {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(origem ? { Origin: origem } : {}) },
      body: metodo === 'POST' ? (cru ?? JSON.stringify(corpo)) : undefined,
    }))
  const doBanco = () => chamadas.filter((c) => c.url.includes('/rest/v1/rpc/'))
  const doTurnstile = () => chamadas.filter((c) => c.url.includes('challenges.cloudflare.com'))
  return { pedido, chamadas, doBanco, doTurnstile }
}

const agendar = (extra = {}) => ({
  acao: 'agendar', slug: 'poste-vermelho', servico_id: SERVICO, profissional_id: null,
  inicio: '2026-11-20T13:00:00.000Z', nome: 'Ana Souza', telefone: '(21) 99999-0000', consentimento: true,
  turnstile_token: 'token-valido', ...extra,
})

describe('Edge Function agendar', () => {
  it('responde ao preflight do CORS so para os sites permitidos', async () => {
    const { pedido } = montar()
    const ok = await pedido(null, { metodo: 'OPTIONS' })
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-origin')).toBe(SITE)
    const estranho = await pedido(null, { metodo: 'OPTIONS', origem: 'https://site-malicioso.com' })
    expect(estranho.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('aceita so POST e corpo JSON pequeno e valido', async () => {
    const { pedido, doBanco } = montar()
    expect((await pedido(null, { metodo: 'GET' })).status).toBe(405)
    expect((await pedido(null, { cru: 'isto nao e json' })).status).toBe(400)
    expect((await pedido(null, { cru: '[1,2]' })).status).toBe(400)
    expect((await pedido(null, { cru: JSON.stringify({ x: 'a'.repeat(9000) }) })).status).toBe(413)
    expect((await pedido({ acao: 'agendar', slug: 'Slug Invalido' })).status).toBe(400)
    expect(doBanco()).toHaveLength(0)
  })

  it('recusa campos fora do formato sem chamar o banco', async () => {
    const { pedido, doBanco, doTurnstile } = montar()
    for (const ruim of [
      { servico_id: 'nao-e-uuid' }, { profissional_id: 'abc' }, { inicio: 'ontem' },
      { consentimento: 'sim' }, { nome: 123 }, { telefone: null }, { acao: 'apagar' },
    ]) {
      const r = await pedido(agendar(ruim))
      expect(r.status, JSON.stringify(ruim)).toBe(400)
    }
    expect(doBanco()).toHaveLength(0)
    expect(doTurnstile()).toHaveLength(0)
  })

  it('sem token do Turnstile, nao grava nem consulta o banco', async () => {
    const { pedido, doBanco } = montar()
    const r = await pedido(agendar({ turnstile_token: undefined }))
    expect(r.status).toBe(403)
    expect((await r.json()).erro).toBe('turnstile_invalido')
    expect(doBanco()).toHaveLength(0)
  })

  it('Turnstile reprovado: 403 e nada e gravado', async () => {
    const { pedido, doBanco } = montar({ turnstile: { success: false, 'error-codes': ['invalid-input-response'] } })
    const r = await pedido(agendar())
    expect(r.status).toBe(403)
    expect((await r.json()).erro).toBe('turnstile_invalido')
    expect(doBanco()).toHaveLength(0)
  })

  it('sem a chave secreta configurada, falha fechada (503) e nao grava', async () => {
    const { TURNSTILE_SECRET_KEY, ...semSegredo } = envBase
    const { pedido, doBanco } = montar({ env: semSegredo })
    const r = await pedido(agendar())
    expect(r.status).toBe(503)
    expect(doBanco()).toHaveLength(0)
  })

  it('Turnstile fora do ar: 503 e nada e gravado', async () => {
    const { pedido, doBanco } = montar({ turnstile: new Error('rede') })
    expect((await pedido(agendar())).status).toBe(503)
    expect(doBanco()).toHaveLength(0)
  })

  it('caminho feliz: valida o token, chama publico_agendar com a chave de servico e devolve o resultado', async () => {
    const resultado = { id: AGENDAMENTO, profissional: 'Rafa', servico: 'Corte', preco: 45 }
    const { pedido, doBanco, doTurnstile } = montar({ banco: { ok: true, corpo: resultado } })
    const r = await pedido(agendar({ inicio: '2026-11-20T10:00:00-03:00' }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual(resultado)
    expect(r.headers.get('access-control-allow-origin')).toBe(SITE)

    const t = doTurnstile()[0]
    const form = new URLSearchParams(String(t.init.body))
    expect(form.get('secret')).toBe('segredo-turnstile')
    expect(form.get('response')).toBe('token-valido')

    const b = doBanco()[0]
    expect(b.url).toBe('https://projeto.supabase.co/rest/v1/rpc/publico_agendar')
    expect(b.init.headers.Authorization).toBe('Bearer chave-de-servico')
    expect(b.init.headers.apikey).toBe('chave-de-servico')
    expect(JSON.parse(b.init.body)).toEqual({
      p_slug: 'poste-vermelho', p_servico_id: SERVICO, p_profissional_id: null,
      p_inicio: '2026-11-20T13:00:00.000Z', // normalizado para UTC
      p_nome: 'Ana Souza', p_telefone: '(21) 99999-0000', p_consentimento: true,
    })
  })

  it('repassa o barbeiro escolhido e traduz os erros do banco em status e mensagem', async () => {
    const casos = [
      ['horario_ocupado', 409], ['limite_telefone', 429], ['telefone_invalido', 422],
      ['fora_do_expediente', 422], ['barbearia_indisponivel', 404], ['consentimento_obrigatorio', 422],
    ]
    for (const [codigo, status] of casos) {
      const { pedido, doBanco } = montar({ banco: { ok: false, corpo: { code: 'P0001', message: codigo } } })
      const r = await pedido(agendar({ profissional_id: BARBEIRO }))
      const corpo = await r.json()
      expect(r.status, codigo).toBe(status)
      expect(corpo.erro).toBe(codigo)
      expect(corpo.mensagem.length).toBeGreaterThan(10)
      expect(JSON.parse(doBanco()[0].init.body).p_profissional_id).toBe(BARBEIRO)
    }
  })

  it('erro inesperado do banco vira 500 generico, sem vazar detalhes', async () => {
    const { pedido } = montar({ banco: { ok: false, status: 401, corpo: { code: '42501', message: 'permission denied for table clientes' } } })
    const r = await pedido(agendar())
    const texto = await r.text()
    expect(r.status).toBe(500)
    expect(texto).not.toMatch(/permission|clientes|42501/)
  })

  it('banco inacessivel: 503', async () => {
    const { pedido } = montar({ banco: new Error('sem rede') })
    expect((await pedido(agendar())).status).toBe(503)
  })

  it('cancelar nao usa Turnstile e chama publico_cancelar com o codigo e o telefone', async () => {
    const { pedido, doBanco, doTurnstile } = montar({ banco: { ok: true, corpo: { id: AGENDAMENTO, status: 'cancelado' } } })
    const r = await pedido({ acao: 'cancelar', slug: 'poste-vermelho', agendamento_id: AGENDAMENTO, telefone: '(21) 99999-0000' })
    expect(r.status).toBe(200)
    expect(doTurnstile()).toHaveLength(0)
    expect(doBanco()[0].url).toMatch(/publico_cancelar$/)
    expect(JSON.parse(doBanco()[0].init.body)).toEqual({ p_slug: 'poste-vermelho', p_agendamento_id: AGENDAMENTO, p_telefone: '(21) 99999-0000' })
  })

  it('cancelar valida o codigo e traduz os erros', async () => {
    const m1 = montar()
    expect((await m1.pedido({ acao: 'cancelar', slug: 'poste-vermelho', agendamento_id: '123', telefone: '21999990000' })).status).toBe(400)
    expect(m1.doBanco()).toHaveLength(0)

    const m2 = montar({ banco: { ok: false, corpo: { code: 'P0001', message: 'agendamento_nao_encontrado' } } })
    const r = await m2.pedido({ acao: 'cancelar', slug: 'poste-vermelho', agendamento_id: AGENDAMENTO, telefone: '21988880000' })
    expect(r.status).toBe(404)
    expect((await r.json()).erro).toBe('agendamento_nao_encontrado')
  })

  it('sem as variaveis do Supabase, responde 503', async () => {
    const { pedido } = montar({ env: { TURNSTILE_SECRET_KEY: 'x' } })
    expect((await pedido(agendar())).status).toBe(503)
  })
})
