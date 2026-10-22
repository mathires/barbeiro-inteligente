import { describe, it, expect } from 'vitest'
import { criarBanco } from './fakeSupabase.js'
import { moverEstoque, venderProduto, concluirAtendimento, reabrirAtendimento } from '../src/lib/operacoes.js'

const B = 'B1'
const produto = { id: 'p1', nome: 'Pomada' }

function base(extra = {}, opc) {
  return criarBanco({
    movimentos_estoque: [{ id: 'm1', barbearia_id: B, produto_id: 'p1', tipo: 'entrada', quantidade: 5 }],
    receitas: [], agendamentos: [{ id: 'a1', barbearia_id: B, status: 'em_atendimento', valor: 45, cliente_id: 'c1' }],
    ...extra,
  }, opc)
}

describe('estoque', () => {
  it('entrada soma e saida bloqueia quando passa do estoque', async () => {
    const { sb, tabelas } = base()
    expect(await moverEstoque(sb, { barbeariaId: B, produto, tipo: 'entrada', quantidade: 3, data: '2026-10-21' })).toBeNull()
    expect(await moverEstoque(sb, { barbeariaId: B, produto, tipo: 'saida', quantidade: 9, data: '2026-10-21' })).toMatch(/insuficiente: há 8/)
    expect(await moverEstoque(sb, { barbeariaId: B, produto, tipo: 'saida', quantidade: 8, data: '2026-10-21' })).toBeNull()
    expect(tabelas.movimentos_estoque.map((m) => m.quantidade)).toEqual([5, 3, -8])
  })
  it('valida quantidades', async () => {
    const { sb } = base()
    expect(await moverEstoque(sb, { barbeariaId: B, produto, tipo: 'entrada', quantidade: 0, data: 'x' })).toMatch(/maior que zero/)
    expect(await moverEstoque(sb, { barbeariaId: B, produto, tipo: 'ajuste', quantidade: 0, data: 'x' })).toMatch(/zero/)
  })
  it('ajuste negativo nao deixa estoque ficar negativo', async () => {
    const { sb } = base()
    expect(await moverEstoque(sb, { barbeariaId: B, produto, tipo: 'ajuste', quantidade: -6, data: 'x' })).toMatch(/insuficiente/)
    expect(await moverEstoque(sb, { barbeariaId: B, produto, tipo: 'ajuste', quantidade: -2, data: 'x' })).toBeNull()
  })
})

describe('venda de produto', () => {
  it('gera receita e baixa estoque', async () => {
    const { sb, tabelas } = base()
    const r = await venderProduto(sb, { barbeariaId: B, produto, quantidade: 2, valorUnitario: 35.5, forma: 'pix', data: '2026-10-21', clienteId: null })
    expect(r).toBeNull()
    expect(tabelas.receitas[0]).toMatchObject({ valor: 71, forma_pagamento: 'pix', descricao: 'Venda: Pomada x2', barbearia_id: B })
    expect(tabelas.movimentos_estoque.at(-1)).toMatchObject({ tipo: 'saida', quantidade: -2 })
  })
  it('sem estoque nao vende e nao cria receita', async () => {
    const { sb, tabelas } = base()
    expect(await venderProduto(sb, { barbeariaId: B, produto, quantidade: 6, valorUnitario: 10, forma: 'pix', data: 'x' })).toMatch(/insuficiente/)
    expect(tabelas.receitas).toHaveLength(0)
  })
  it('se a baixa de estoque falhar, desfaz a receita', async () => {
    const { sb, tabelas } = base({}, { falhas: { 'insert:movimentos_estoque': { code: 'XX' } } })
    // a falha vale tambem para estoqueAtual? nao: so insert. a venda chega no 2o passo e falha
    const r = await venderProduto(sb, { barbeariaId: B, produto, quantidade: 1, valorUnitario: 10, forma: 'pix', data: 'x' })
    expect(r).toMatch(/Não foi possível/)
    expect(tabelas.receitas).toHaveLength(0)
  })
})

describe('atendimento', () => {
  const at = { id: 'a1', valor: 45, cliente_id: 'c1', status: 'em_atendimento' }
  it('concluir muda status e cria uma receita ligada ao atendimento', async () => {
    const { sb, tabelas } = base()
    expect(await concluirAtendimento(sb, { barbeariaId: B, atendimento: at, descricao: 'Corte - João', forma: 'dinheiro', data: '2026-10-21' })).toBeNull()
    expect(tabelas.agendamentos[0].status).toBe('concluido')
    expect(tabelas.receitas[0]).toMatchObject({ agendamento_id: 'a1', valor: 45, cliente_id: 'c1', forma_pagamento: 'dinheiro' })
  })
  it('se a receita falhar, volta o status anterior', async () => {
    const { sb, tabelas } = base({}, { falhas: { 'insert:receitas': { code: '23505' } } })
    const r = await concluirAtendimento(sb, { barbeariaId: B, atendimento: at, descricao: 'x', forma: 'pix', data: 'x' })
    expect(r).toBeTruthy()
    expect(tabelas.agendamentos[0].status).toBe('em_atendimento')
  })
  it('reabrir apaga a receita e volta o status', async () => {
    const { sb, tabelas } = base()
    await concluirAtendimento(sb, { barbeariaId: B, atendimento: at, descricao: 'x', forma: 'pix', data: 'x' })
    expect(await reabrirAtendimento(sb, { barbeariaId: B, atendimento: at })).toBeNull()
    expect(tabelas.receitas).toHaveLength(0)
    expect(tabelas.agendamentos[0].status).toBe('confirmado')
  })
})
