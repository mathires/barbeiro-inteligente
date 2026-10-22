// Operacoes que mexem em mais de uma tabela. Recebem o cliente do Supabase como
// parametro (facilita testar). Quando o 2o passo falha, o 1o e desfeito.
import { mensagemDeErro } from './campos.js'

export const FORMAS_PAGAMENTO = [
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'cartao', rotulo: 'Cartão' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
]
export const rotuloForma = (v) => FORMAS_PAGAMENTO.find((f) => f.valor === v)?.rotulo ?? v

export async function estoqueAtual(sb, barbeariaId, produtoId) {
  const { data, error } = await sb
    .from('movimentos_estoque').select('quantidade').eq('barbearia_id', barbeariaId).eq('produto_id', produtoId)
  if (error) throw error
  return data.reduce((s, m) => s + m.quantidade, 0)
}

// Entrada, saida ou ajuste de estoque. "quantidade" vem positiva em entrada/saida.
export async function moverEstoque(sb, { barbeariaId, produto, tipo, quantidade, data, observacao }) {
  if (tipo !== 'ajuste' && quantidade <= 0) return 'A quantidade deve ser maior que zero.'
  if (tipo === 'ajuste' && quantidade === 0) return 'O ajuste não pode ser zero.'
  const assinada = tipo === 'saida' ? -quantidade : quantidade
  try {
    if (assinada < 0) {
      const atual = await estoqueAtual(sb, barbeariaId, produto.id)
      if (atual + assinada < 0) return `Estoque insuficiente: há ${atual} unidade(s) de "${produto.nome}".`
    }
    const { error } = await sb.from('movimentos_estoque').insert({
      barbearia_id: barbeariaId, produto_id: produto.id, tipo, quantidade: assinada, data, observacao,
    })
    return error ? mensagemDeErro(error) : null
  } catch (e) { return mensagemDeErro(e) }
}

// Venda de produto: gera uma receita e baixa o estoque.
export async function venderProduto(sb, { barbeariaId, produto, quantidade, valorUnitario, forma, data, clienteId }) {
  if (quantidade <= 0) return 'A quantidade deve ser maior que zero.'
  try {
    const atual = await estoqueAtual(sb, barbeariaId, produto.id)
    if (atual < quantidade) return `Estoque insuficiente: há ${atual} unidade(s) de "${produto.nome}".`
  } catch (e) { return mensagemDeErro(e) }

  const total = Math.round(quantidade * valorUnitario * 100) / 100
  if (total <= 0) return 'O valor da venda deve ser maior que zero.'
  const { data: rec, error: e1 } = await sb.from('receitas').insert({
    barbearia_id: barbeariaId, data, descricao: `Venda: ${produto.nome} x${quantidade}`,
    forma_pagamento: forma, valor: total, cliente_id: clienteId ?? null,
  }).select('id').single()
  if (e1) return mensagemDeErro(e1)

  const { error: e2 } = await sb.from('movimentos_estoque').insert({
    barbearia_id: barbeariaId, produto_id: produto.id, tipo: 'saida', quantidade: -quantidade, data, observacao: 'Venda',
  })
  if (e2) {
    await sb.from('receitas').delete().eq('id', rec.id).eq('barbearia_id', barbeariaId) // desfaz a receita
    return mensagemDeErro(e2)
  }
  return null
}

// Concluir atendimento: muda o status e gera UMA receita (agendamento_id e unico no banco).
export async function concluirAtendimento(sb, { barbeariaId, atendimento, descricao, forma, data }) {
  const { error: e1 } = await sb.from('agendamentos').update({ status: 'concluido' })
    .eq('id', atendimento.id).eq('barbearia_id', barbeariaId)
  if (e1) return mensagemDeErro(e1, 'concluir')
  if (Number(atendimento.valor) > 0) {
    const { error: e2 } = await sb.from('receitas').insert({
      barbearia_id: barbeariaId, data, descricao, forma_pagamento: forma, valor: atendimento.valor,
      cliente_id: atendimento.cliente_id ?? null, agendamento_id: atendimento.id,
    })
    if (e2) {
      await sb.from('agendamentos').update({ status: atendimento.status }).eq('id', atendimento.id).eq('barbearia_id', barbeariaId)
      return mensagemDeErro(e2, 'registrar a receita')
    }
  }
  return null
}

// Reabrir um atendimento concluido: remove a receita gerada e volta o status.
export async function reabrirAtendimento(sb, { barbeariaId, atendimento, novoStatus = 'confirmado' }) {
  const { error: e1 } = await sb.from('receitas').delete().eq('agendamento_id', atendimento.id).eq('barbearia_id', barbeariaId)
  if (e1) return mensagemDeErro(e1, 'reabrir')
  const { error: e2 } = await sb.from('agendamentos').update({ status: novoStatus }).eq('id', atendimento.id).eq('barbearia_id', barbeariaId)
  return e2 ? mensagemDeErro(e2, 'reabrir') : null
}
