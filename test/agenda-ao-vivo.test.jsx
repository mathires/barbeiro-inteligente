// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { criarBanco } from './fakeSupabase.js'
import { hojeISO } from '../src/lib/formato.js'
import { paraISO } from '../src/lib/agenda.js'

const h = vi.hoisted(() => ({ sb: null }))
vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: (t) => h.sb.from(t), channel: (n) => h.sb.channel(n), removeChannel: (c) => h.sb.removeChannel(c) },
  configurado: true,
}))

import Agenda from '../src/pages/Agenda.jsx'
import AgendamentoOnline from '../src/pages/AgendamentoOnline.jsx'

const B = 'B1'
const hoje = hojeISO()
let banco

beforeEach(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') } })
afterEach(cleanup)

const agendamento = (extra) => ({
  id: 'a1', barbearia_id: B, cliente_id: null, profissional_id: 'p1', servico_id: 's1',
  inicio: paraISO(hoje, '15:00'), fim: paraISO(hoje, '15:30'), status: 'confirmado', valor: 45, origem: 'app', ...extra,
})

describe('Agenda ao vivo', () => {
  beforeEach(() => {
    banco = criarBanco({
      profissionais: [{ id: 'p1', barbearia_id: B, nome: 'Rafa', ativo: true }],
      servicos: [{ id: 's1', barbearia_id: B, nome: 'Corte', duracao_min: 30, preco: 45, ativo: true }],
      clientes: [], agendamentos: [],
    })
    h.sb = banco.sb
  })

  it('assina so os agendamentos da barbearia e solta o canal ao sair', async () => {
    const { unmount } = render(<Agenda barbeariaId={B} />)
    await screen.findByText('Nenhum atendimento neste dia.')
    expect(banco.canais).toHaveLength(1)
    expect(banco.canais[0].ouvintes[0].filtro).toMatchObject({ table: 'agendamentos', filter: `barbearia_id=eq.${B}` })
    unmount()
    expect(banco.canais).toHaveLength(0)
  })

  it('agendamento feito pelo site aparece sozinho, com aviso, nome do cliente novo e selo Online', async () => {
    render(<Agenda barbeariaId={B} />)
    await screen.findByText('Nenhum atendimento neste dia.')

    // o site cria o cliente e o agendamento; o app so recebe o aviso do Realtime
    banco.tabelas.clientes.push({ id: 'c9', barbearia_id: B, nome: 'Joao do Site', telefone: '21999990000' })
    const novo = agendamento({ id: 'a9', cliente_id: 'c9', origem: 'online' })
    banco.tabelas.agendamentos.push(novo)
    banco.emitir('agendamentos', { eventType: 'INSERT', new: novo, old: {} })

    expect((await screen.findByRole('status', { name: '' })).textContent).toMatch(/Novo agendamento online/)
    expect(await screen.findByText('Joao do Site')).toBeTruthy()
    expect(screen.getByText('Online')).toBeTruthy()
  })

  it('mudanca feita por outro aparelho atualiza a lista sem aviso de "online"', async () => {
    render(<Agenda barbeariaId={B} />)
    await screen.findByText('Nenhum atendimento neste dia.')
    const novo = agendamento({ id: 'a2' })
    banco.tabelas.agendamentos.push(novo)
    banco.emitir('agendamentos', { eventType: 'INSERT', new: novo, old: {} })
    await waitFor(() => expect(screen.queryByText('Nenhum atendimento neste dia.')).toBeNull())
    expect(screen.queryByText(/Novo agendamento online/)).toBeNull()
    expect(screen.queryByText('Online')).toBeNull()
  })
})

describe('Tela Agendamento online', () => {
  const barbearia = {
    id: B, nome: 'Barbearia Poste Vermelho', slug: null, agendamento_online: false, abertura: '09:00:00', fechamento: '20:00:00',
    passo_min: 30, dias_atendimento: [1, 2, 3, 4, 5, 6], antecedencia_min: 60, cancelamento_ate_min: 120, janela_dias: 30,
  }
  const preparar = (extra = {}, opcoes = {}) => {
    banco = criarBanco({
      barbearias: [{ ...barbearia, ...extra }],
      profissionais: [{ id: 'p1', barbearia_id: B, ativo: true }, { id: 'p2', barbearia_id: B, ativo: false }],
      servicos: [{ id: 's1', barbearia_id: B, ativo: true }],
    }, opcoes)
    h.sb = banco.sb
  }
  it('desligada e sem endereco: avisa o que falta e sugere o endereco', async () => {
    preparar()
    render(<AgendamentoOnline barbeariaId={B} />)
    expect(await screen.findByText('Desligado')).toBeTruthy()
    expect(screen.getByText(/Defina o endereço do link\./)).toBeTruthy()
    expect(screen.getByText(/Ligue o agendamento online\./)).toBeTruthy()
    expect(screen.getByText(/modo de teste/)).toBeTruthy()
    expect(screen.queryByText(/Cadastre pelo menos um profissional/)).toBeNull() // 1 ativo ja basta
    expect(screen.queryByLabelText('Texto da mensagem')).toBeNull()
    expect(screen.getByRole('button', { name: /Usar "poste-vermelho"/ })).toBeTruthy()
  })

  it('liga, grava no banco e mostra o link e o texto do WhatsApp', async () => {
    preparar()
    const u = userEvent.setup()
    render(<AgendamentoOnline barbeariaId={B} />)
    await screen.findByText('Desligado')
    await u.click(screen.getByRole('button', { name: /Usar "poste-vermelho"/ }))
    await u.click(screen.getByLabelText('Receber agendamentos online'))
    await u.click(screen.getByLabelText('Seg: atende')) // desmarca segunda
    await u.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('No ar')).toBeTruthy()
    const gravado = banco.tabelas.barbearias[0]
    expect(gravado).toMatchObject({ slug: 'poste-vermelho', agendamento_online: true, passo_min: 30, antecedencia_min: 60, janela_dias: 30 })
    expect(gravado.dias_atendimento).toEqual([2, 3, 4, 5, 6])
    const link = `${window.location.origin}/#/agendar/poste-vermelho`
    expect(screen.getByLabelText('Endereço para o cliente').value).toBe(link)
    expect(screen.getByLabelText('Texto da mensagem').value).toContain(link)

    await u.click(screen.getByRole('button', { name: 'Copiar link' }))
    expect(await navigator.clipboard.readText()).toBe(link) // userEvent simula a area de transferencia
  })

  it('nao deixa ligar sem endereco nem gravar valores que o banco recusaria', async () => {
    preparar()
    const u = userEvent.setup()
    render(<AgendamentoOnline barbeariaId={B} />)
    await screen.findByText('Desligado')
    await u.click(screen.getByLabelText('Receber agendamentos online'))
    await u.click(screen.getByRole('button', { name: 'Salvar' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Defina o endereço/)
    expect(banco.log.some((l) => l.op === 'update')).toBe(false)
  })

  it('endereco ja usado por outra barbearia: mostra a mensagem do banco', async () => {
    preparar({}, { validarUpdate: () => ({ code: '23505' }) })
    const u = userEvent.setup()
    render(<AgendamentoOnline barbeariaId={B} />)
    await screen.findByText('Desligado')
    await u.type(screen.getByLabelText('Endereço do link'), 'poste')
    await u.click(screen.getByRole('button', { name: 'Salvar' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/já está em uso/)
    expect(banco.tabelas.barbearias[0].slug).toBeNull()
  })

  it('ja configurada: mostra "No ar" e o link sem precisar salvar de novo', async () => {
    preparar({ slug: 'poste-vermelho', agendamento_online: true })
    render(<AgendamentoOnline barbeariaId={B} />)
    expect(await screen.findByText('No ar')).toBeTruthy()
    const caixa = screen.getByRole('region', { name: 'Seu link' })
    expect(within(caixa).getByLabelText('Endereço para o cliente').value).toMatch(/#\/agendar\/poste-vermelho$/)
    expect(screen.queryByText(/Ligue o agendamento online\./)).toBeNull()
  })
})
