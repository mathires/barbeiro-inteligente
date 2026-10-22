import { describe, it, expect } from 'vitest'
import { classificar, linkWhatsApp, resumoDeVisitas, textoUltima } from '../src/lib/clientes.js'
import { janelaLivre, diasDaSemana, paraISO, ABRE, FECHA } from '../src/lib/agenda.js'
import { receitaPorOrigem, mapaDeCalor } from '../src/lib/relatorios.js'
import { rotuloDoDia, diasAte } from '../src/lib/formato.js'
import { FRASES, sortearFrase, montarFrase, saudacao } from '../src/lib/frases.js'

describe('clientes', () => {
  it('classifica novo, fiel e sumido como no prototipo', () => {
    expect(classificar(2, 3)).toBe('novo')
    expect(classificar(0, 0)).toBe('novo')
    expect(classificar(20, 5)).toBe('fiel')
    expect(classificar(8, 46)).toBe('sumido')
    expect(classificar(30, 46)).toBe('sumido') // sumir pesa mais que ser fiel
    expect(classificar(8, 45)).toBe(null)
  })
  it('link do WhatsApp so com telefone valido e DDI 55', () => {
    expect(linkWhatsApp('(21) 99999-8888')).toBe('https://wa.me/5521999998888')
    expect(linkWhatsApp('5521999998888')).toBe('https://wa.me/5521999998888')
    expect(linkWhatsApp('2199')).toBe(null)
    expect(linkWhatsApp(null)).toBe(null)
  })
  it('conta visitas e guarda a mais recente', () => {
    const m = resumoDeVisitas([
      { cliente_id: 'a', inicio: '2026-01-01T10:00:00Z' }, { cliente_id: 'a', inicio: '2026-03-01T10:00:00Z' }, { cliente_id: null, inicio: '2026-03-01T10:00:00Z' },
    ])
    expect(m.get('a')).toMatchObject({ visitas: 2, ultima: '2026-03-01T10:00:00Z' })
    expect(m.size).toBe(1)
    expect([textoUltima(0), textoUltima(1), textoUltima(9)]).toEqual(['hoje', 'ontem', 'há 9 dias'])
  })
})

describe('agenda', () => {
  const dia = '2026-10-21'
  const a = (prof, i, f, status = 'confirmado') => ({ profissional_id: prof, inicio: paraISO(dia, i), fim: paraISO(dia, f), status })
  it('acha a maior janela livre do profissional', () => {
    const lista = [a('p1', '09:00', '10:00'), a('p1', '11:00', '12:00'), a('p1', '15:00', '16:00')]
    expect(janelaLivre(lista, 'p1')).toEqual([960, FECHA]) // 16:00 as 20:00 (240 min) e a maior
    expect(janelaLivre(lista, 'p2')).toEqual([ABRE, FECHA])
  })
  it('cancelado nao ocupa e agenda cheia devolve null', () => {
    expect(janelaLivre([a('p1', '09:00', '20:00', 'cancelado')], 'p1')).toEqual([ABRE, FECHA])
    expect(janelaLivre([a('p1', '09:00', '20:00')], 'p1')).toBe(null)
    expect(janelaLivre([a('p1', '09:00', '19:45')], 'p1')).toBe(null) // sobra menos de 30 min
  })
  it('semana vai de segunda a domingo', () => {
    const s = diasDaSemana('2026-10-21') // quarta
    expect(s[0]).toBe('2026-10-19')
    expect(s[6]).toBe('2026-10-25')
    expect(diasDaSemana('2026-10-25')[0]).toBe('2026-10-19') // domingo pertence a semana anterior
  })
})

describe('relatorios', () => {
  it('receita por origem: servicos concluidos, venda de produtos e outras', () => {
    const r = receitaPorOrigem(
      [
        { descricao: 'Corte - Ana', valor: 45, agendamento_id: 'a1' },
        { descricao: 'Venda: Pomada x2', valor: 70 },
        { descricao: 'Gorjeta', valor: 10 },
      ],
      [{ status: 'concluido', servico_id: 's1', valor: 45 }, { status: 'cancelado', servico_id: 's1', valor: 99 }],
      [{ id: 's1', nome: 'Corte' }],
    )
    expect(r).toEqual([
      { nome: 'Venda de produtos', valor: 70 }, { nome: 'Corte', valor: 45 }, { nome: 'Outras receitas', valor: 10 },
    ])
  })
  it('mapa de calor normaliza pelo pico e ignora cancelados', () => {
    const seg = (h, status = 'confirmado') => ({ inicio: paraISO('2026-10-19', h), status }) // segunda
    const c = mapaDeCalor([seg('10:00'), seg('10:30'), seg('11:00'), seg('11:00', 'cancelado')], [9, 10, 11])
    expect(c.valores[0]).toEqual([0, 1, 0.5])
    expect(c.melhor).toMatchObject({ dia: 0, hora: 10, n: 2 })
    expect(mapaDeCalor([], [9]).melhor).toBe(null)
  })
})

describe('formato e frases', () => {
  it('rotulo do dia', () => {
    expect(rotuloDoDia('2026-10-21', '2026-10-21')).toBe('Hoje · 21/10')
    expect(rotuloDoDia('2026-10-20', '2026-10-21')).toBe('Ontem · 20/10')
    expect(rotuloDoDia('2026-10-19', '2026-10-21')).toBe('Seg · 19/10')
    expect(diasAte('2026-10-24', '2026-10-21')).toBe(3)
  })
  it('frases: nunca repete a anterior e sempre cita o nome', () => {
    for (let i = 0; i < FRASES.length; i++) {
      let n = 0 // 1o sorteio cai na anterior, o seguinte em outra
      expect(sortearFrase(i, () => (i + n++) / FRASES.length)).not.toBe(i)
      expect(montarFrase(i, 'Matheus')).toContain('Matheus')
    }
    expect(['Bom dia', 'Boa tarde', 'Boa noite']).toContain(saudacao())
    expect(saudacao(new Date(2026, 9, 21, 8))).toBe('Bom dia')
    expect(saudacao(new Date(2026, 9, 21, 15))).toBe('Boa tarde')
    expect(saudacao(new Date(2026, 9, 21, 21))).toBe('Boa noite')
  })
})
