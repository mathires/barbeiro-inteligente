import { describe, it, expect } from 'vitest'
import { criarBanco } from './fakeSupabase.js'
import { paraISO, partesLocais, limitesDoDia, somarDias, rotuloDia, acoesDoStatus, salvarAtendimento, buscarConflito } from '../src/lib/agenda.js'

const B = 'B1'
const form = (extra = {}) => ({
  cliente_id: 'c1', profissional_id: 'p1', servico_id: 's1', data: '2026-10-21', hora: '14:00',
  duracao_min: '30', valor: '45,00', observacoes: '', ...extra,
})

describe('datas locais (Brasil, UTC-3)', () => {
  it('ida e volta', () => {
    expect(paraISO('2026-10-21', '14:30')).toBe('2026-10-21T17:30:00.000Z')
    expect(partesLocais('2026-10-21T17:30:00.000Z')).toEqual({ data: '2026-10-21', hora: '14:30' })
  })
  it('limites do dia', () => {
    expect(limitesDoDia('2026-10-21')).toEqual(['2026-10-21T03:00:00.000Z', '2026-10-22T03:00:00.000Z'])
  })
  it('somarDias e rotulo', () => {
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01')
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(rotuloDia('2026-10-21')).toMatch(/^Quarta-feira, 21 de outubro/)
  })
})

describe('acoes por status', () => {
  it('cada status oferece o caminho certo', () => {
    expect(acoesDoStatus('confirmado').map((a) => a.rotulo)).toEqual(['Iniciar', 'Concluir', 'Cancelar', 'Faltou'])
    expect(acoesDoStatus('em_atendimento').map((a) => a.rotulo)).toEqual(['Concluir'])
    expect(acoesDoStatus('concluido')[0].especial).toBe('reabrir')
    expect(acoesDoStatus('cancelado')[0].novo).toBe('confirmado')
  })
})

describe('salvarAtendimento', () => {
  const existente = { id: 'a1', barbearia_id: B, profissional_id: 'p1', inicio: paraISO('2026-10-21', '14:00'), fim: paraISO('2026-10-21', '14:30'), status: 'confirmado' }

  it('cria atendimento confirmado com fim = inicio + duracao', async () => {
    const { sb, tabelas } = criarBanco({ agendamentos: [] })
    expect(await salvarAtendimento(sb, { barbeariaId: B, form: form({ hora: '10:00', duracao_min: '45' }) })).toBeNull()
    const a = tabelas.agendamentos[0]
    expect(a).toMatchObject({ barbearia_id: B, status: 'confirmado', valor: 45, profissional_id: 'p1', cliente_id: 'c1' })
    expect(a.inicio).toBe('2026-10-21T13:00:00.000Z')
    expect(a.fim).toBe('2026-10-21T13:45:00.000Z')
  })
  it('recusa choque de horario do mesmo profissional, mas aceita outro profissional', async () => {
    const { sb } = criarBanco({ agendamentos: [existente] })
    expect(await salvarAtendimento(sb, { barbeariaId: B, form: form({ hora: '14:15' }) })).toMatch(/14:00 às 14:30/)
    expect(await salvarAtendimento(sb, { barbeariaId: B, form: form({ hora: '13:45', duracao_min: '30' }) })).toMatch(/já tem atendimento/)
    expect(await salvarAtendimento(sb, { barbeariaId: B, form: form({ hora: '14:15', profissional_id: 'p2' }) })).toBeNull()
  })
  it('horarios encostados nao conflitam', async () => {
    const { sb } = criarBanco({ agendamentos: [existente] })
    expect(await salvarAtendimento(sb, { barbeariaId: B, form: form({ hora: '14:30' }) })).toBeNull()
    expect(await salvarAtendimento(sb, { barbeariaId: B, form: form({ hora: '13:30' }) })).toBeNull()
  })
  it('cancelado e faltou liberam o horario', async () => {
    const { sb } = criarBanco({ agendamentos: [{ ...existente, status: 'cancelado' }] })
    expect(await salvarAtendimento(sb, { barbeariaId: B, form: form() })).toBeNull()
  })
  it('editar o proprio atendimento nao conflita consigo mesmo', async () => {
    const { sb, tabelas } = criarBanco({ agendamentos: [existente] })
    expect(await salvarAtendimento(sb, { barbeariaId: B, form: form({ valor: '50' }), original: existente })).toBeNull()
    expect(tabelas.agendamentos[0].valor).toBe(50)
  })
  it('valida campos', async () => {
    const { sb } = criarBanco({ agendamentos: [] })
    expect(await salvarAtendimento(sb, { barbeariaId: B, form: form({ profissional_id: '' }) })).toMatch(/profissional/)
    expect(await salvarAtendimento(sb, { barbeariaId: B, form: form({ servico_id: '' }) })).toMatch(/serviço/)
    expect(await salvarAtendimento(sb, { barbeariaId: B, form: form({ duracao_min: '3' }) })).toMatch(/duração/)
    expect(await salvarAtendimento(sb, { barbeariaId: B, form: form({ valor: 'x' }) })).toMatch(/valor/)
    expect(await salvarAtendimento(sb, { barbeariaId: B, form: form({ valor: '0' }) })).toBeNull() // cortesia
  })
  it('conflito de outra barbearia nao interfere', async () => {
    const { sb } = criarBanco({ agendamentos: [{ ...existente, barbearia_id: 'OUTRA' }] })
    expect(await buscarConflito(sb, { barbeariaId: B, profissionalId: 'p1', inicio: existente.inicio, fim: existente.fim })).toBeNull()
  })
})
