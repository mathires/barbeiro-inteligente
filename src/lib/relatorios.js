// Calculos dos relatorios (sem React). Recebem linhas ja lidas do banco.

const soma = (lista, f = (x) => x) => lista.reduce((s, x) => s + Number(f(x) || 0), 0)
const arred = (n) => Math.round(n * 100) / 100

export function resumoDoMes(receitas, despesas) {
  const rec = soma(receitas, (r) => r.valor)
  const desp = soma(despesas, (d) => d.valor)
  const pagas = soma(despesas.filter((d) => d.pago_em), (d) => d.valor)
  return {
    receitas: arred(rec), despesas: arred(desp), despesasPagas: arred(pagas), despesasAPagar: arred(desp - pagas),
    saldoPrevisto: arred(rec - desp), saldoRealizado: arred(rec - pagas),
  }
}

export function receitasPorForma(receitas, formas) {
  const total = soma(receitas, (r) => r.valor)
  return formas.map((f) => {
    const v = soma(receitas.filter((r) => r.forma_pagamento === f.valor), (r) => r.valor)
    return { forma: f.valor, rotulo: f.rotulo, valor: arred(v), pct: total ? (v / total) * 100 : 0 }
  })
}

export function despesasPorCategoria(despesas, categorias) {
  const total = soma(despesas, (d) => d.valor)
  const mapa = new Map()
  for (const d of despesas) mapa.set(d.categoria_id, (mapa.get(d.categoria_id) ?? 0) + Number(d.valor))
  return [...mapa.entries()]
    .map(([id, v]) => ({ id, nome: categorias.find((c) => c.id === id)?.nome ?? 'Sem categoria', valor: arred(v), pct: total ? (v / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor)
}

// Comissao = % do profissional sobre o valor dos atendimentos CONCLUIDOS do mes
export function comissoes(atendimentos, profissionais) {
  const concl = atendimentos.filter((a) => a.status === 'concluido')
  return profissionais
    .map((p) => {
      const meus = concl.filter((a) => a.profissional_id === p.id)
      const fat = soma(meus, (a) => a.valor)
      return { id: p.id, nome: p.nome, atendimentos: meus.length, faturamento: arred(fat), pct: Number(p.comissao_pct), comissao: arred((fat * Number(p.comissao_pct)) / 100) }
    })
    .filter((x) => x.atendimentos > 0)
    .sort((a, b) => b.faturamento - a.faturamento)
}

export function servicosMaisVendidos(atendimentos, servicos, limite = 5) {
  const concl = atendimentos.filter((a) => a.status === 'concluido')
  const mapa = new Map()
  for (const a of concl) {
    const x = mapa.get(a.servico_id) ?? { qtd: 0, valor: 0 }
    x.qtd += 1; x.valor += Number(a.valor)
    mapa.set(a.servico_id, x)
  }
  return [...mapa.entries()]
    .map(([id, x]) => ({ id, nome: servicos.find((s) => s.id === id)?.nome ?? 'Serviço removido', qtd: x.qtd, valor: arred(x.valor) }))
    .sort((a, b) => b.qtd - a.qtd || b.valor - a.valor)
    .slice(0, limite)
}

export function ticketMedio(atendimentos) {
  const concl = atendimentos.filter((a) => a.status === 'concluido')
  return concl.length ? arred(soma(concl, (a) => a.valor) / concl.length) : 0
}

// Taxa de faltas sobre os atendimentos que "valiam" (concluidos + faltas)
export function taxaDeFaltas(atendimentos) {
  const faltas = atendimentos.filter((a) => a.status === 'faltou').length
  const base = faltas + atendimentos.filter((a) => a.status === 'concluido').length
  return base ? (faltas / base) * 100 : 0
}

// Clientes que fazem aniversario no mes (1-12), ordenados pelo dia
export function aniversariantes(clientes, mes) {
  return clientes
    .filter((c) => c.aniversario && Number(c.aniversario.slice(5, 7)) === mes)
    .map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone, dia: Number(c.aniversario.slice(8, 10)) }))
    .sort((a, b) => a.dia - b.dia)
}

// Despesas nao pagas ate "dias" a frente de hoje (inclui as vencidas)
export function contasAPagar(despesas, hoje, limiteISO) {
  const abertas = despesas.filter((d) => !d.pago_em && d.vencimento <= limiteISO)
  return {
    vencidas: abertas.filter((d) => d.vencimento < hoje),
    proximas: abertas.filter((d) => d.vencimento >= hoje),
    total: arred(soma(abertas, (d) => d.valor)),
  }
}

// De onde veio a receita: cada servico (atendimentos concluidos), venda de produtos e outras
export function receitaPorOrigem(receitas, atendimentos, servicos) {
  const itens = new Map()
  for (const a of atendimentos.filter((x) => x.status === 'concluido')) {
    const nome = servicos.find((s) => s.id === a.servico_id)?.nome ?? 'Serviço removido'
    itens.set(nome, (itens.get(nome) ?? 0) + Number(a.valor))
  }
  const avulsas = receitas.filter((r) => !r.agendamento_id)
  const vendas = soma(avulsas.filter((r) => String(r.descricao).startsWith('Venda: ')), (r) => r.valor)
  const outras = soma(avulsas.filter((r) => !String(r.descricao).startsWith('Venda: ')), (r) => r.valor)
  const lista = [...itens.entries()].map(([nome, valor]) => ({ nome, valor: arred(valor) }))
  if (vendas > 0) lista.push({ nome: 'Venda de produtos', valor: arred(vendas) })
  if (outras > 0) lista.push({ nome: 'Outras receitas', valor: arred(outras) })
  return lista.sort((a, b) => b.valor - a.valor)
}

// Mapa de calor: atendimentos por dia da semana (seg..dom) e hora de inicio, normalizado de 0 a 1
export function mapaDeCalor(atendimentos, horas) {
  const cont = Array.from({ length: 7 }, () => Array(horas.length).fill(0))
  for (const a of atendimentos) {
    if (['cancelado', 'faltou'].includes(a.status)) continue
    const d = new Date(a.inicio)
    const dia = (d.getDay() + 6) % 7
    const col = horas.indexOf(d.getHours())
    if (col >= 0) cont[dia][col] += 1
  }
  const max = Math.max(0, ...cont.flat())
  let melhor = null
  const valores = cont.map((linha, dia) => linha.map((n, col) => {
    const v = max ? n / max : 0
    if (n > 0 && (!melhor || n > melhor.n)) melhor = { dia, hora: horas[col], n }
    return v
  }))
  return { valores, melhor, max }
}
