import { describe, it, expect } from 'vitest'
import {
  resumoDoMes, receitasPorForma, despesasPorCategoria, comissoes, servicosMaisVendidos, ticketMedio, taxaDeFaltas, aniversariantes, contasAPagar,
} from '../src/lib/relatorios.js'

const formas = [{ valor: 'pix', rotulo: 'Pix' }, { valor: 'cartao', rotulo: 'Cartão' }, { valor: 'dinheiro', rotulo: 'Dinheiro' }]

describe('resumo e distribuicoes', () => {
  const receitas = [{ valor: 60, forma_pagamento: 'pix' }, { valor: '40.50', forma_pagamento: 'dinheiro' }, { valor: 100, forma_pagamento: 'pix' }]
  const despesas = [
    { valor: 1000, pago_em: '2026-10-05', categoria_id: 'k1' }, { valor: 200, pago_em: null, categoria_id: 'k2' }, { valor: 300, pago_em: null, categoria_id: 'k1' },
  ]
  it('saldo previsto (tudo lancado) x realizado (so o pago)', () => {
    expect(resumoDoMes(receitas, despesas)).toEqual({
      receitas: 200.5, despesas: 1500, despesasPagas: 1000, despesasAPagar: 500, saldoPrevisto: -1299.5, saldoRealizado: -799.5,
    })
  })
  it('mes vazio zera tudo', () => {
    expect(resumoDoMes([], []).saldoPrevisto).toBe(0)
  })
  it('receitas por forma, com percentual', () => {
    const r = receitasPorForma(receitas, formas)
    expect(r.find((x) => x.forma === 'pix')).toMatchObject({ valor: 160, rotulo: 'Pix' })
    expect(r.find((x) => x.forma === 'pix').pct).toBeCloseTo(79.8, 1)
    expect(r.find((x) => x.forma === 'cartao').valor).toBe(0)
  })
  it('despesas por categoria ordenadas do maior para o menor', () => {
    const r = despesasPorCategoria(despesas, [{ id: 'k1', nome: 'Aluguel' }, { id: 'k2', nome: 'Energia' }])
    expect(r.map((x) => [x.nome, x.valor])).toEqual([['Aluguel', 1300], ['Energia', 200]])
    expect(r[0].pct).toBeCloseTo(86.67, 1)
  })
})

describe('atendimentos', () => {
  const profs = [{ id: 'p1', nome: 'Carlos', comissao_pct: '40' }, { id: 'p2', nome: 'Rafa', comissao_pct: 50 }, { id: 'p3', nome: 'Sem atend.', comissao_pct: 10 }]
  const at = [
    { profissional_id: 'p1', servico_id: 's1', status: 'concluido', valor: 45 },
    { profissional_id: 'p1', servico_id: 's1', status: 'concluido', valor: 45 },
    { profissional_id: 'p1', servico_id: 's2', status: 'concluido', valor: 30 },
    { profissional_id: 'p2', servico_id: 's2', status: 'concluido', valor: 30 },
    { profissional_id: 'p2', servico_id: 's1', status: 'faltou', valor: 45 },
    { profissional_id: 'p2', servico_id: 's1', status: 'cancelado', valor: 45 },
    { profissional_id: 'p2', servico_id: 's1', status: 'confirmado', valor: 45 },
  ]
  it('comissao so sobre concluidos, ignora quem nao atendeu', () => {
    expect(comissoes(at, profs)).toEqual([
      { id: 'p1', nome: 'Carlos', atendimentos: 3, faturamento: 120, pct: 40, comissao: 48 },
      { id: 'p2', nome: 'Rafa', atendimentos: 1, faturamento: 30, pct: 50, comissao: 15 },
    ])
  })
  it('servicos mais realizados', () => {
    const r = servicosMaisVendidos(at, [{ id: 's1', nome: 'Corte' }, { id: 's2', nome: 'Barba' }])
    expect(r).toEqual([{ id: 's2', nome: 'Barba', qtd: 2, valor: 60 }, { id: 's1', nome: 'Corte', qtd: 2, valor: 90 }].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor))
  })
  it('ticket medio e taxa de faltas', () => {
    expect(ticketMedio(at)).toBe(37.5)
    expect(ticketMedio([])).toBe(0)
    expect(taxaDeFaltas(at)).toBeCloseTo(20, 5) // 1 falta para 4 concluidos + 1 falta
    expect(taxaDeFaltas([])).toBe(0)
  })
})

describe('clientes e contas', () => {
  it('aniversariantes do mes, ordenados por dia', () => {
    const c = [
      { id: '1', nome: 'B', aniversario: '1990-10-25' }, { id: '2', nome: 'A', aniversario: '1985-10-03' },
      { id: '3', nome: 'C', aniversario: '1990-11-01' }, { id: '4', nome: 'D', aniversario: null },
    ]
    expect(aniversariantes(c, 10).map((x) => [x.dia, x.nome])).toEqual([[3, 'A'], [25, 'B']])
  })
  it('contas a pagar: vencidas, proximas e fora da janela', () => {
    const d = [
      { id: 'a', vencimento: '2026-10-10', pago_em: null, valor: 100 },
      { id: 'b', vencimento: '2026-10-21', pago_em: null, valor: 50 },
      { id: 'c', vencimento: '2026-10-28', pago_em: null, valor: 25 },
      { id: 'd', vencimento: '2026-10-29', pago_em: null, valor: 999 },
      { id: 'e', vencimento: '2026-10-22', pago_em: '2026-10-20', valor: 999 },
    ]
    const r = contasAPagar(d, '2026-10-21', '2026-10-28')
    expect(r.vencidas.map((x) => x.id)).toEqual(['a'])
    expect(r.proximas.map((x) => x.id)).toEqual(['b', 'c'])
    expect(r.total).toBe(175)
  })
})
