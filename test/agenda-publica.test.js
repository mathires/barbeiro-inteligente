import { describe, it, expect } from 'vitest'
import {
  hojeNoFuso, diaDaSemana, instanteNoFuso, diasAbertos, horariosReais, descricaoExpediente, partesNoFuso, lerRotaPublica, QUALQUER,
} from '../src/lib/agendaPublica.js'

const config = {
  fuso: 'America/Sao_Paulo', abertura: '09:00', fechamento: '20:00', passo_min: 30, dias_atendimento: [1, 2, 3, 4, 5, 6],
  antecedencia_min: 60, cancelamento_ate_min: 120, janela_dias: 30,
}
const RAFA = 'a0000000-0000-4000-8000-000000000001'
const DAVI = 'a0000000-0000-4000-8000-000000000002'
const profissionais = [{ id: RAFA, nome: 'Rafa' }, { id: DAVI, nome: 'Davi' }]
const corte = { duracao_min: 30 }
const combo = { duracao_min: 70 }
// terca 17/11/2026, 10:10 em Sao Paulo (13:10 UTC)
const agora = new Date(Date.UTC(2026, 10, 17, 13, 10))
const ocupa = (profissional_id, ini, fim) => ({ profissional_id, inicio: new Date(Date.UTC(2026, 10, 20, ...ini)).toISOString(), fim: new Date(Date.UTC(2026, 10, 20, ...fim)).toISOString() })

describe('agenda publica real - datas e fuso', () => {
  it('"hoje" e o dia da barbearia, nao o do aparelho', () => {
    expect(hojeNoFuso(new Date(Date.UTC(2026, 10, 18, 1, 0)), 'America/Sao_Paulo')).toBe('2026-11-17') // 22:00 em SP
    expect(hojeNoFuso(new Date(Date.UTC(2026, 10, 18, 4, 0)), 'America/Sao_Paulo')).toBe('2026-11-18') // 01:00 em SP
  })
  it('converte dia + hora da barbearia em instante', () => {
    expect(instanteNoFuso('2026-11-20', '10:00', 'America/Sao_Paulo')).toBe(Date.UTC(2026, 10, 20, 13, 0))
    expect(partesNoFuso('2026-11-20T13:00:00Z', 'America/Sao_Paulo')).toEqual({ dia: '2026-11-20', hora: '10:00' })
  })
  it('dia da semana: 0 domingo ... 6 sabado', () => {
    expect(diaDaSemana('2026-11-17')).toBe(2)
    expect(diaDaSemana('2026-11-22')).toBe(0)
  })
  it('lista so dias abertos, a partir de hoje e dentro da janela', () => {
    const d = diasAbertos(config, agora, 7)
    expect(d[0]).toBe('2026-11-17')
    expect(d).toHaveLength(7)
    expect(d).not.toContain('2026-11-22') // domingo
    const todos = diasAbertos(config, agora, 100)
    expect(todos.at(-1) <= '2026-12-17').toBe(true)
    expect(todos.every((x) => diaDaSemana(x) !== 0)).toBe(true)
  })
})

describe('agenda publica real - horarios', () => {
  const base = { config, profissionais, profissionalId: QUALQUER, dia: '2026-11-20', agora }

  it('vai de abertura ate o ultimo horario em que o servico termina antes do fechamento', () => {
    const a = horariosReais({ ...base, servico: corte })
    expect(a[0].hora).toBe('09:00')
    expect(a.at(-1).hora).toBe('19:30')
    const b = horariosReais({ ...base, servico: combo })
    expect(b.at(-1).hora).toBe('18:30') // 18:30 + 70 min = 19:40; 19:00 passaria das 20h
  })
  it('respeita a antecedencia minima no proprio dia', () => {
    const h = horariosReais({ ...base, servico: corte, dia: '2026-11-17' })
    const livre = (hora) => h.find((x) => x.hora === hora).livre
    expect(livre('11:00')).toBe(false) // 10:10 + 60 min = 11:10
    expect(livre('11:30')).toBe(true)
  })
  it('domingo e dia fora da janela nao tem horario livre', () => {
    expect(horariosReais({ ...base, servico: corte, dia: '2026-11-22' }).some((x) => x.livre)).toBe(false)
    expect(horariosReais({ ...base, servico: corte, dia: '2027-01-15' }).some((x) => x.livre)).toBe(false)
  })
  it('horario ocupado de um barbeiro: "qualquer" ainda acha o outro; barbeiro especifico nao', () => {
    const ocupacao = [ocupa(RAFA, [17, 0], [17, 30])] // 14:00-14:30 em SP
    const qualquer = horariosReais({ ...base, servico: corte, ocupacao }).find((x) => x.hora === '14:00')
    expect(qualquer).toMatchObject({ livre: true, profissionalId: DAVI })
    const rafa = horariosReais({ ...base, servico: corte, ocupacao, profissionalId: RAFA }).find((x) => x.hora === '14:00')
    expect(rafa.livre).toBe(false)
  })
  it('todos ocupados: nao oferece; servico longo que invade horario ocupado tambem nao', () => {
    const ocupacao = [ocupa(RAFA, [17, 0], [17, 30]), ocupa(DAVI, [17, 0], [17, 30])]
    expect(horariosReais({ ...base, servico: corte, ocupacao }).find((x) => x.hora === '14:00').livre).toBe(false)
    // combo as 13:00 (70 min) termina 14:10 e invade o 14:00 dos dois
    expect(horariosReais({ ...base, servico: combo, ocupacao }).find((x) => x.hora === '13:00').livre).toBe(false)
    expect(horariosReais({ ...base, servico: combo, ocupacao }).find((x) => x.hora === '12:30').livre).toBe(true)
  })
  it('horario que termina exatamente quando o outro comeca nao conflita', () => {
    const ocupacao = [ocupa(RAFA, [17, 0], [17, 30])]
    const h = horariosReais({ ...base, servico: corte, ocupacao, profissionalId: RAFA })
    expect(h.find((x) => x.hora === '13:30').livre).toBe(true) // 13:30-14:00
    expect(h.find((x) => x.hora === '14:30').livre).toBe(true) // 14:30-15:00
  })
})

describe('agenda publica real - textos e rotas', () => {
  it('descreve o expediente', () => {
    expect(descricaoExpediente(config)).toBe('Segunda a sábado, das 9h às 20h')
    expect(descricaoExpediente({ ...config, dias_atendimento: [2, 4], abertura: '09:30' })).toBe('Terça e quinta, das 9h30 às 20h')
    expect(descricaoExpediente({ ...config, dias_atendimento: [1, 2, 3, 4, 5, 6, 0] })).toBe('Segunda a domingo, das 9h às 20h')
  })
  it('interpreta as rotas publicas', () => {
    const id = 'b0000000-0000-4000-8000-0000000000aa'
    expect(lerRotaPublica('agendar')).toEqual({ tipo: 'agendar', slug: null })
    expect(lerRotaPublica('agendar/poste-vermelho')).toEqual({ tipo: 'agendar', slug: 'poste-vermelho' })
    expect(lerRotaPublica('agendar/Poste Vermelho')).toEqual({ tipo: 'agendar', slug: '' })
    expect(lerRotaPublica(`cancelar/poste-vermelho/${id}`)).toEqual({ tipo: 'cancelar', slug: 'poste-vermelho', id })
    expect(lerRotaPublica('cancelar/poste-vermelho/123')).toBeNull()
    expect(lerRotaPublica('clientes')).toBeNull()
    expect(lerRotaPublica('inicio')).toBeNull()
  })
})

describe('horario proprio em cada dia da semana', () => {
  const base = { config, profissionais, profissionalId: QUALQUER, dia: '2026-11-20', agora }
  const com = { ...config, dias_atendimento: [1, 2, 3, 4, 5, 6, 0], horarios: {
    1: { abre: '09:00', fecha: '20:00' }, 2: { abre: '09:00', fecha: '20:00' }, 3: { abre: '09:00', fecha: '20:00' },
    4: { abre: '09:00', fecha: '20:00' }, 5: { abre: '09:00', fecha: '20:00' },
    6: { abre: '10:00', fecha: '14:00' }, 0: { abre: '09:00', fecha: '12:00' },
  } }

  it('o sabado usa o horario do sabado e o domingo o do domingo', () => {
    const sabado = horariosReais({ ...base, config: com, servico: corte, dia: '2026-11-21' }).map((h) => h.hora)
    expect(sabado[0]).toBe('10:00')
    expect(sabado.at(-1)).toBe('13:30') // o corte de 30 min termina as 14h
    const domingo = horariosReais({ ...base, config: com, servico: corte, dia: '2026-11-22' }).map((h) => h.hora)
    expect(domingo[0]).toBe('09:00')
    expect(domingo.at(-1)).toBe('11:30')
    const semana = horariosReais({ ...base, config: com, servico: corte, dia: '2026-11-20' }).map((h) => h.hora)
    expect(semana[0]).toBe('09:00')
    expect(semana.at(-1)).toBe('19:30')
  })

  it('descreve o expediente agrupando os dias com o mesmo horario', () => {
    expect(descricaoExpediente(com)).toBe('Segunda a sexta, das 9h às 20h; Sábado, das 10h às 14h; Domingo, das 9h às 12h')
    expect(descricaoExpediente({ ...com, horarios: { ...com.horarios, 6: com.horarios[1], 0: com.horarios[1] } })).toBe('Segunda a domingo, das 9h às 20h')
  })
})
