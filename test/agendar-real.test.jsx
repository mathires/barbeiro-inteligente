// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/lib/supabase.js', () => ({ supabase: { rpc: vi.fn() }, configurado: true }))
import { supabase } from '../src/lib/supabase.js'
import AgendarPublico from '../src/pages/AgendarPublico.jsx'
import CancelarPublico from '../src/pages/CancelarPublico.jsx'

const RAFA = 'a0000000-0000-4000-8000-000000000001'
const DAVI = 'a0000000-0000-4000-8000-000000000002'
const CONFIG = {
  nome: 'Barbearia Teste', bairro: 'Recreio', fuso: 'America/Sao_Paulo', abertura: '09:00', fechamento: '20:00', passo_min: 30,
  dias_atendimento: [1, 2, 3, 4, 5, 6], antecedencia_min: 60, cancelamento_ate_min: 120, janela_dias: 30,
  servicos: [
    { id: 'c0000000-0000-4000-8000-000000000001', nome: 'Corte', descricao: 'Tesoura ou maquina', duracao_min: 30, preco: 45 },
    { id: 'c0000000-0000-4000-8000-000000000002', nome: 'Corte + barba', descricao: 'Completo', duracao_min: 70, preco: 75 },
  ],
  profissionais: [{ id: RAFA, nome: 'Rafa' }, { id: DAVI, nome: 'Davi' }],
}
const RESPOSTA_OK = {
  id: 'b0000000-0000-4000-8000-0000000000aa', inicio: '2026-11-17T15:00:00Z', fim: '2026-11-17T16:10:00Z', profissional_id: RAFA,
  profissional: 'Rafa', servico: 'Corte + barba', duracao_min: 70, preco: 75, cancelar_ate: '2026-11-17T13:00:00Z',
}
const json = (status, corpo) => ({ ok: status < 300, status, json: async () => corpo })

let rpcConfig
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 17, 13, 10))) // terca 10:10 em Sao Paulo
  vi.stubEnv('VITE_SUPABASE_URL', 'https://exemplo.supabase.co')
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  window.turnstile = { render: (_el, o) => { o.callback('token-1'); return 'w1' }, remove: vi.fn(), reset: vi.fn() }
  rpcConfig = CONFIG
  supabase.rpc.mockReset()
  supabase.rpc.mockImplementation(async (nome) => (nome === 'publico_barbearia' ? { data: rpcConfig, error: null } : { data: [], error: null }))
  globalThis.fetch = vi.fn()
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); delete window.turnstile })

const titulo = (nome) => screen.findByRole('heading', { name: nome })

// ate a tela de confirmacao: Corte + barba, Rafa, primeiro dia, primeiro horario livre
async function ateConfirmar(u) {
  await screen.findByRole('heading', { level: 1, name: 'Corte marcado em 3 toques.' })
  await u.click(screen.getByRole('button', { name: /Corte \+ barba/ }))
  await titulo('Com quem você prefere?')
  await u.click(screen.getByRole('button', { name: /Rafa/ }))
  await titulo('Escolha dia e horário')
  await u.click(within(screen.getByRole('group', { name: 'Dias' })).getAllByRole('button')[0])
  const horas = await screen.findByRole('group', { name: /Horários de/ })
  await u.click(within(horas).getAllByRole('button').find((b) => !b.disabled))
  await u.click(screen.getByRole('button', { name: 'Continuar' }))
  await titulo('Confira e confirme')
}

describe('pagina publica de agendamento (modo real)', () => {
  it('mostra os dados do banco, sem aviso de previa nem promessas de WhatsApp', async () => {
    render(<AgendarPublico slug="teste" />)
    await screen.findByRole('heading', { level: 1, name: 'Corte marcado em 3 toques.' })
    expect(supabase.rpc).toHaveBeenCalledWith('publico_barbearia', { p_slug: 'teste' })
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.queryByText(/Lembrete no WhatsApp/)).toBeNull()
    expect(screen.getByText(/Segunda a sábado, das 9h às 20h/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Corte \+ barba/ })).toBeTruthy()
    await screen.findByText(/Próximo horário livre:/)
  })

  it('avisa quando o endereco nao existe ou o agendamento online esta desligado', async () => {
    rpcConfig = null
    render(<AgendarPublico slug="nada" />)
    expect(await screen.findByRole('heading', { name: 'Agendamento indisponível' })).toBeTruthy()
  })

  it('so oferece horarios livres: o ocupado vem desabilitado', async () => {
    // Rafa ocupado hoje das 14:00 as 15:00 (17:00-18:00 UTC)
    supabase.rpc.mockImplementation(async (nome, args) => {
      if (nome === 'publico_barbearia') return { data: CONFIG, error: null }
      if (args.p_dia === '2026-11-17') return { data: [{ profissional_id: RAFA, inicio: '2026-11-17T17:00:00Z', fim: '2026-11-17T18:00:00Z' }], error: null }
      return { data: [], error: null }
    })
    const u = userEvent.setup()
    render(<AgendarPublico slug="teste" />)
    await screen.findByRole('heading', { level: 1, name: 'Corte marcado em 3 toques.' })
    await u.click(screen.getByRole('button', { name: /Tesoura ou maquina/ }))
    await titulo('Com quem você prefere?')
    await u.click(screen.getByRole('button', { name: /Rafa/ }))
    await titulo('Escolha dia e horário')
    await u.click(within(screen.getByRole('group', { name: 'Dias' })).getAllByRole('button')[0])
    const horas = await screen.findByRole('group', { name: /Horários de/ })
    expect(within(horas).getByRole('button', { name: '14:00' }).disabled).toBe(true)
    expect(within(horas).getByRole('button', { name: '14:30' }).disabled).toBe(true)
    expect(within(horas).getByRole('button', { name: '15:00' }).disabled).toBe(false)
    expect(within(horas).getByRole('button', { name: '10:30' }).disabled).toBe(true) // antecedencia de 60 min
  })

  it('exige o aceite (LGPD) antes de enviar', async () => {
    const u = userEvent.setup()
    render(<AgendarPublico slug="teste" />)
    await ateConfirmar(u)
    await u.type(screen.getByLabelText('Seu nome'), 'Joao Silva')
    await u.type(screen.getByLabelText('WhatsApp com DDD'), '21999990000')
    await u.click(screen.getByRole('button', { name: 'Confirmar horário' }))
    expect((await screen.findByRole('alert', { name: '' })).textContent).toMatch(/concordar com o uso do seu nome/)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('agenda pela Edge Function com token, consentimento e telefone so com digitos, e mostra o bilhete', async () => {
    globalThis.fetch.mockResolvedValueOnce(json(200, RESPOSTA_OK))
    const u = userEvent.setup()
    render(<AgendarPublico slug="teste" />)
    await ateConfirmar(u)
    await u.type(screen.getByLabelText('Seu nome'), 'Joao Silva')
    await u.type(screen.getByLabelText('WhatsApp com DDD'), '21999990000')
    await u.click(screen.getByRole('checkbox'))
    await u.click(screen.getByRole('button', { name: 'Confirmar horário' }))

    expect(await titulo('Joao, está marcado!')).toBeTruthy()
    const [url, opcoes] = globalThis.fetch.mock.calls[0]
    expect(url).toBe('https://exemplo.supabase.co/functions/v1/agendar')
    const corpo = JSON.parse(opcoes.body)
    expect(corpo).toMatchObject({
      acao: 'agendar', slug: 'teste', servico_id: CONFIG.servicos[1].id, profissional_id: RAFA, nome: 'Joao Silva',
      telefone: '21999990000', consentimento: true, turnstile_token: 'token-1',
    })
    expect(new Date(corpo.inicio).toISOString()).toBe(corpo.inicio) // ISO valido (instante absoluto)
    expect(screen.getByText('Corte + barba com Rafa')).toBeTruthy()
    expect(screen.getByText(/Você pode cancelar por aqui até/)).toBeTruthy()
  })

  it('"quem estiver livre" envia profissional_id nulo e deixa o banco escolher', async () => {
    globalThis.fetch.mockResolvedValueOnce(json(200, RESPOSTA_OK))
    const u = userEvent.setup()
    render(<AgendarPublico slug="teste" />)
    await screen.findByRole('heading', { level: 1, name: 'Corte marcado em 3 toques.' })
    await u.click(screen.getByRole('button', { name: /Corte \+ barba/ }))
    await titulo('Com quem você prefere?')
    await u.click(screen.getByRole('button', { name: /Quem estiver livre/ }))
    await titulo('Escolha dia e horário')
    await u.click(within(screen.getByRole('group', { name: 'Dias' })).getAllByRole('button')[0])
    const horas = await screen.findByRole('group', { name: /Horários de/ })
    await u.click(within(horas).getAllByRole('button').find((b) => !b.disabled))
    await u.click(screen.getByRole('button', { name: 'Continuar' }))
    await titulo('Confira e confirme')
    await u.type(screen.getByLabelText('Seu nome'), 'Maria')
    await u.type(screen.getByLabelText('WhatsApp com DDD'), '21988887777')
    await u.click(screen.getByRole('checkbox'))
    await u.click(screen.getByRole('button', { name: 'Confirmar horário' }))
    await titulo('Maria, está marcado!')
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).profissional_id).toBeNull()
  })

  it('se o horario foi reservado por outra pessoa, volta a escolher e atualiza o dia', async () => {
    globalThis.fetch.mockResolvedValueOnce(json(409, { erro: 'horario_ocupado', mensagem: 'Esse horário acabou de ser reservado. Escolha outro.' }))
    const u = userEvent.setup()
    render(<AgendarPublico slug="teste" />)
    await ateConfirmar(u)
    await u.type(screen.getByLabelText('Seu nome'), 'Joao Silva')
    await u.type(screen.getByLabelText('WhatsApp com DDD'), '21999990000')
    await u.click(screen.getByRole('checkbox'))
    const antes = supabase.rpc.mock.calls.filter(([n]) => n === 'publico_ocupacao').length
    await u.click(screen.getByRole('button', { name: 'Confirmar horário' }))
    await titulo('Escolha dia e horário')
    expect((await screen.findByRole('alert')).textContent).toMatch(/acabou de ser reservado/)
    expect(supabase.rpc.mock.calls.filter(([n]) => n === 'publico_ocupacao').length).toBeGreaterThan(antes)
    expect(screen.getByRole('button', { name: 'Continuar' }).disabled).toBe(true) // precisa escolher outro horario
  })

  it('mostra o erro do servidor na propria tela de confirmacao (ex.: limite por telefone)', async () => {
    globalThis.fetch.mockResolvedValueOnce(json(429, { erro: 'limite_telefone', mensagem: 'Esse telefone já tem agendamentos em aberto.' }))
    const u = userEvent.setup()
    render(<AgendarPublico slug="teste" />)
    await ateConfirmar(u)
    await u.type(screen.getByLabelText('Seu nome'), 'Joao Silva')
    await u.type(screen.getByLabelText('WhatsApp com DDD'), '21999990000')
    await u.click(screen.getByRole('checkbox'))
    await u.click(screen.getByRole('button', { name: 'Confirmar horário' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/já tem agendamentos em aberto/))
    expect(screen.getByRole('heading', { name: 'Confira e confirme' })).toBeTruthy()
    expect(window.turnstile.reset).toHaveBeenCalled() // o token foi gasto: pede outro para a proxima tentativa
  })

  it('cancela pelo bilhete usando o telefone informado', async () => {
    globalThis.fetch.mockResolvedValueOnce(json(200, RESPOSTA_OK)).mockResolvedValueOnce(json(200, { id: RESPOSTA_OK.id, status: 'cancelado' }))
    const u = userEvent.setup()
    render(<AgendarPublico slug="teste" />)
    await ateConfirmar(u)
    await u.type(screen.getByLabelText('Seu nome'), 'Joao Silva')
    await u.type(screen.getByLabelText('WhatsApp com DDD'), '21999990000')
    await u.click(screen.getByRole('checkbox'))
    await u.click(screen.getByRole('button', { name: 'Confirmar horário' }))
    await titulo('Joao, está marcado!')
    await u.click(screen.getByRole('button', { name: 'Cancelar este horário' }))
    await u.click(screen.getByRole('button', { name: 'Sim, cancelar' }))
    await titulo('Joao, horário cancelado.')
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body)).toEqual({
      acao: 'cancelar', slug: 'teste', agendamento_id: RESPOSTA_OK.id, telefone: '21999990000',
    })
  })
})

describe('pagina de cancelamento pelo link', () => {
  const ID = 'b0000000-0000-4000-8000-0000000000aa'
  it('pede o telefone, valida e cancela', async () => {
    globalThis.fetch.mockResolvedValueOnce(json(200, { id: ID, status: 'cancelado' }))
    const u = userEvent.setup()
    render(<CancelarPublico slug="teste" id={ID} />)
    await u.click(screen.getByRole('button', { name: 'Cancelar horário' }))
    expect(screen.getByRole('alert').textContent).toMatch(/WhatsApp com DDD/)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    await u.type(screen.getByLabelText('WhatsApp com DDD'), '21999990000')
    await u.click(screen.getByRole('button', { name: 'Cancelar horário' }))
    expect(await screen.findByRole('heading', { name: 'Horário cancelado.' })).toBeTruthy()
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toEqual({ acao: 'cancelar', slug: 'teste', agendamento_id: ID, telefone: '21999990000' })
  })

  it('mostra o motivo quando o servidor recusa (ex.: prazo vencido)', async () => {
    globalThis.fetch.mockResolvedValueOnce(json(409, { erro: 'prazo_cancelamento', mensagem: 'O prazo para cancelar pelo site acabou.' }))
    const u = userEvent.setup()
    render(<CancelarPublico slug="teste" id={ID} />)
    await u.type(screen.getByLabelText('WhatsApp com DDD'), '21999990000')
    await u.click(screen.getByRole('button', { name: 'Cancelar horário' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/prazo para cancelar/))
  })
})
