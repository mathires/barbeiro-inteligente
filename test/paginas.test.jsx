// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { criarBanco } from './fakeSupabase.js'
import { hojeISO, somarMeses, inicioDoMes } from '../src/lib/formato.js'
import { somarDias, paraISO } from '../src/lib/agenda.js'

const h = vi.hoisted(() => ({ sb: null }))
vi.mock('../src/lib/supabase.js', () => ({ supabase: { from: (t) => h.sb.from(t) }, configurado: true }))

import Servicos from '../src/pages/Servicos.jsx'
import Clientes from '../src/pages/Clientes.jsx'
import Receitas from '../src/pages/Receitas.jsx'
import Despesas from '../src/pages/Despesas.jsx'
import Produtos from '../src/pages/Produtos.jsx'
import Agenda from '../src/pages/Agenda.jsx'
import Relatorios from '../src/pages/Relatorios.jsx'
import Inicio from '../src/pages/Inicio.jsx'

const B = 'B1'
const hoje = hojeISO()
let banco

function preparar(dados) {
  banco = criarBanco(dados)
  h.sb = banco.sb
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
})
afterEach(cleanup)

describe('Servicos e Clientes', () => {
  beforeEach(() => preparar({
    servicos: [
      { id: 's1', barbearia_id: B, nome: 'Corte', duracao_min: 30, preco: 45, descricao: null, ativo: true },
      { id: 's2', barbearia_id: B, nome: 'Antigo', duracao_min: 20, preco: 10, descricao: null, ativo: false },
      { id: 'sX', barbearia_id: 'OUTRA', nome: 'Segredo', duracao_min: 20, preco: 10, ativo: true },
    ],
    clientes: [{ id: 'c1', barbearia_id: B, nome: 'João', telefone: '21999998888', aniversario: '1990-05-17', servico_preferido_id: 's1', consentimento_lgpd_em: '2026-01-01T00:00:00Z' }],
    agendamentos: [
      { id: 'a1', barbearia_id: B, cliente_id: 'c1', profissional_id: 'p', servico_id: 's1', inicio: paraISO(somarDias(hoje, -60), '10:00'), fim: paraISO(somarDias(hoje, -60), '10:30'), status: 'concluido', valor: 45 },
    ],
  }))

  it('servicos: so a barbearia ativa, inativo esmaecido e cria novo com barbearia_id', async () => {
    const u = userEvent.setup()
    render(<Servicos barbeariaId={B} />)
    expect(await screen.findByText('Corte')).toBeTruthy()
    expect(screen.queryByText('Segredo')).toBeNull()
    expect(screen.getByLabelText('Serviço ativo: Antigo').checked).toBe(false)
    expect(screen.getByLabelText('Serviço ativo: Corte').checked).toBe(true)
    expect(screen.getByText('Antigo').closest('article').className).toMatch(/off/)

    await u.click(screen.getByRole('button', { name: 'Novo serviço' }))
    await u.type(screen.getByLabelText(/Nome do serviço/), 'Barba')
    await u.type(screen.getByLabelText(/Duração/), '25')
    await u.type(screen.getByLabelText(/Preço/), '35,5')
    await u.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(banco.tabelas.servicos.some((s) => s.nome === 'Barba')).toBe(true))
    expect(banco.tabelas.servicos.find((s) => s.nome === 'Barba')).toMatchObject({ duracao_min: 25, preco: 35.5, ativo: true, barbearia_id: B })
  })

  it('servicos: cartao mostra quantidade e faturamento do mes', async () => {
    banco.tabelas.agendamentos.push({
      id: 'a2', barbearia_id: B, cliente_id: 'c1', profissional_id: 'p', servico_id: 's1',
      inicio: paraISO(hoje, '08:00'), fim: paraISO(hoje, '08:30'), status: 'concluido', valor: 45,
    })
    render(<Servicos barbeariaId={B} />)
    const cartao = (await screen.findByText('Corte')).closest('article')
    await waitFor(() => expect(within(cartao).getByText('1 no mês')).toBeTruthy())
    expect(within(cartao).getAllByText(/R\$\s?45,00/).length).toBeGreaterThan(0)
  })

  it('validacao mostra erro sem gravar', async () => {
    const u = userEvent.setup()
    render(<Servicos barbeariaId={B} />)
    await screen.findByText('Corte')
    await u.click(screen.getByRole('button', { name: 'Novo serviço' }))
    await u.type(screen.getByLabelText(/Nome do serviço/), 'X')
    await u.type(screen.getByLabelText(/Duração/), '2')
    await u.type(screen.getByLabelText(/Preço/), '10')
    await u.click(screen.getByRole('button', { name: 'Salvar' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/mínimo/)
    expect(banco.tabelas.servicos).toHaveLength(3)
  })

  it('desativar pelo interruptor atualiza o registro', async () => {
    const u = userEvent.setup()
    render(<Servicos barbeariaId={B} />)
    await screen.findByText('Corte')
    await u.click(screen.getByLabelText('Serviço ativo: Corte'))
    await waitFor(() => expect(banco.tabelas.servicos.find((s) => s.id === 's1').ativo).toBe(false))
  })

  it('clientes: visitas, ultima visita, sumido, servico preferido, WhatsApp e LGPD', async () => {
    const u = userEvent.setup()
    render(<Clientes barbeariaId={B} />)
    expect(await screen.findByText('João')).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/1 visita · última há 60 dias · prefere Corte/)).toBeTruthy())
    expect(screen.getByText('Sumido')).toBeTruthy()
    expect(screen.getByText(/não volta há mais de 45 dias/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toBe('https://wa.me/5521999998888')
    await u.click(screen.getByRole('button', { name: 'Editar João' }))
    expect(screen.getByLabelText(/autorizou o uso/).checked).toBe(true)
  })

  it('clientes: busca e filtro Sumidos', async () => {
    const u = userEvent.setup()
    banco.tabelas.clientes.push({ id: 'c2', barbearia_id: B, nome: 'Pedro' })
    render(<Clientes barbeariaId={B} />)
    await screen.findByText('Pedro')
    await u.click(screen.getByRole('button', { name: /Sumidos/ }))
    await waitFor(() => expect(screen.queryByText('Pedro')).toBeNull())
    expect(screen.getByText('João')).toBeTruthy()
    await u.click(screen.getByRole('button', { name: /Todos/ }))
    await u.type(screen.getByLabelText('Buscar cliente pelo nome'), 'ped')
    expect(screen.queryByText('João')).toBeNull()
    expect(screen.getByText('Pedro')).toBeTruthy()
  })
})

describe('Receitas e Despesas', () => {
  const mesPassado = somarMeses(inicioDoMes(hoje), -1)
  beforeEach(() => preparar({
    receitas: [
      { id: 'r1', barbearia_id: B, data: hoje, descricao: 'Corte manual', valor: 60, forma_pagamento: 'pix' },
      { id: 'r2', barbearia_id: B, data: hoje, descricao: 'Corte - João', valor: 40, forma_pagamento: 'dinheiro', agendamento_id: 'a1' },
      { id: 'r3', barbearia_id: B, data: mesPassado, descricao: 'Mês passado', valor: 999, forma_pagamento: 'cartao' },
    ],
    despesas: [
      { id: 'd1', barbearia_id: B, descricao: 'Aluguel', categoria_id: 'k1', vencimento: hoje, valor: 1000, pago_em: null },
      { id: 'd2', barbearia_id: B, descricao: 'Energia', categoria_id: 'k1', vencimento: hoje, valor: 200, pago_em: hoje },
    ],
    categorias_despesa: [{ id: 'k1', barbearia_id: B, nome: 'Aluguel' }],
  }))

  it('receitas: filtra o mes, soma por forma e protege receita de atendimento', async () => {
    render(<Receitas barbeariaId={B} />)
    expect(await screen.findByText('Corte manual')).toBeTruthy()
    expect(screen.queryByText('Mês passado')).toBeNull()
    expect(screen.getByText('Receita do mês').parentElement.textContent).toMatch(/R\$\s?100,00/)
    expect(screen.getByText(/^Pix 60%$/)).toBeTruthy()
    expect(screen.getByText(/^Dinheiro 40%$/)).toBeTruthy()
    expect(screen.getByText(/^Hoje · /)).toBeTruthy()
    const item = screen.getByText('Corte - João').closest('li')
    expect(within(item).queryByRole('button', { name: /Excluir/ })).toBeNull()
    expect(within(item).getByText(/atendimento da agenda/)).toBeTruthy()
    expect(within(screen.getByText('Corte manual').closest('li')).getByRole('button', { name: 'Excluir Corte manual' })).toBeTruthy()
  })

  it('receitas: filtro por forma de pagamento', async () => {
    const u = userEvent.setup()
    render(<Receitas barbeariaId={B} />)
    await screen.findByText('Corte manual')
    await u.click(screen.getByRole('button', { name: 'Dinheiro' }))
    expect(screen.queryByText('Corte manual')).toBeNull()
    expect(screen.getByText('Corte - João')).toBeTruthy()
  })

  it('receitas: navegar para o mes anterior', async () => {
    const u = userEvent.setup()
    render(<Receitas barbeariaId={B} />)
    await screen.findByText('Corte manual')
    await u.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(await screen.findByText('Mês passado')).toBeTruthy()
    expect(screen.queryByText('Corte manual')).toBeNull()
  })

  it('despesas: totais, marcar paga e repetir no mes seguinte', async () => {
    const u = userEvent.setup()
    render(<Despesas barbeariaId={B} />)
    expect(await screen.findByText('Energia')).toBeTruthy()
    expect(screen.getByText('Despesas do mês').parentElement.textContent).toMatch(/1\.200,00/)
    expect(screen.getByText('A pagar', { selector: '.kpi span' }).parentElement.textContent).toMatch(/1\.000,00/)
    expect(screen.getByText('Pago')).toBeTruthy() // Energia

    await u.click(screen.getByRole('button', { name: 'Marcar como pago: Aluguel' }))
    await waitFor(() => expect(banco.tabelas.despesas.find((d) => d.id === 'd1').pago_em).toBe(hoje))
    await u.click(await screen.findByRole('button', { name: 'Repetir no mês seguinte: Aluguel' }))
    await waitFor(() => expect(banco.tabelas.despesas).toHaveLength(3))
    expect(banco.tabelas.despesas[2]).toMatchObject({ descricao: 'Aluguel', valor: 1000, vencimento: somarMeses(hoje, 1), pago_em: null })
    expect(await screen.findByRole('status')).toBeTruthy()
  })
})

describe('Produtos', () => {
  beforeEach(() => preparar({
    produtos: [{ id: 'p1', barbearia_id: B, nome: 'Pomada', custo: 20, preco_venda: 35, estoque_minimo: 3, ativo: true }],
    vw_produtos_estoque: [{ id: 'p1', barbearia_id: B, estoque_atual: 2, repor: true }],
    movimentos_estoque: [{ id: 'm1', barbearia_id: B, produto_id: 'p1', tipo: 'entrada', quantidade: 2 }],
    receitas: [],
  }))

  it('mostra estoque, margem e aviso de reposicao', async () => {
    render(<Produtos barbeariaId={B} />)
    expect(await screen.findByText('Pomada')).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Repor Pomada' })).toBeTruthy()
    expect(screen.getByText(/1 item está abaixo do estoque mínimo: Pomada/)).toBeTruthy()
    expect(screen.getByText(/Margem 43%/)).toBeTruthy()
    expect(screen.getByText('2 un')).toBeTruthy()
  })

  it('venda: gera receita e baixa estoque; sem estoque e recusada', async () => {
    const u = userEvent.setup()
    render(<Produtos barbeariaId={B} />)
    await screen.findByText('Pomada')
    await u.click(screen.getByRole('button', { name: 'Vender Pomada' }))
    const dlg = await screen.findByRole('dialog', { hidden: true })
    expect(within(dlg).getByLabelText(/Valor unitário/).value).toBe('35')
    await u.clear(within(dlg).getByLabelText(/Quantidade/)); await u.type(within(dlg).getByLabelText(/Quantidade/), '5')
    await u.selectOptions(within(dlg).getByLabelText(/Forma de pagamento/), 'pix')
    await u.click(within(dlg).getByRole('button', { name: 'Registrar venda' }))
    expect((await within(dlg).findByRole('alert')).textContent).toMatch(/insuficiente/)
    expect(banco.tabelas.receitas).toHaveLength(0)

    await u.clear(within(dlg).getByLabelText(/Quantidade/)); await u.type(within(dlg).getByLabelText(/Quantidade/), '2')
    await u.click(within(dlg).getByRole('button', { name: 'Registrar venda' }))
    await waitFor(() => expect(banco.tabelas.receitas).toHaveLength(1))
    expect(banco.tabelas.receitas[0]).toMatchObject({ valor: 70, forma_pagamento: 'pix', barbearia_id: B })
    expect(banco.tabelas.movimentos_estoque.at(-1).quantidade).toBe(-2)
  })

  it('repor abre o formulario de entrada de estoque', async () => {
    const u = userEvent.setup()
    render(<Produtos barbeariaId={B} />)
    await u.click(await screen.findByRole('button', { name: 'Repor Pomada' }))
    const dlg = await screen.findByRole('dialog', { hidden: true })
    expect(within(dlg).getByLabelText(/Tipo de movimento/).value).toBe('entrada')
    await u.type(within(dlg).getByLabelText(/Quantidade/), '10')
    await u.click(within(dlg).getByRole('button', { name: 'Registrar' }))
    await waitFor(() => expect(banco.tabelas.movimentos_estoque.at(-1)).toMatchObject({ tipo: 'entrada', quantidade: 10 }))
  })
})

describe('Agenda', () => {
  const at = (id, hora, fimHora, status, extra = {}) => ({
    id, barbearia_id: B, cliente_id: 'c1', profissional_id: 'pr1', servico_id: 's1',
    inicio: paraISO(hoje, hora), fim: paraISO(hoje, fimHora), status, valor: 45, ...extra,
  })
  beforeEach(() => preparar({
    profissionais: [{ id: 'pr1', barbearia_id: B, nome: 'Carlos', ativo: true }, { id: 'pr2', barbearia_id: B, nome: 'Rafa', ativo: true }],
    servicos: [{ id: 's1', barbearia_id: B, nome: 'Corte', duracao_min: 30, preco: 45, ativo: true }],
    clientes: [{ id: 'c1', barbearia_id: B, nome: 'João' }],
    agendamentos: [at('a1', '09:00', '09:30', 'confirmado'), at('a2', '10:00', '10:30', 'cancelado')],
    receitas: [],
  }))

  it('lista o dia com horario, cliente, servico, profissional, resumo e semana', async () => {
    render(<Agenda barbeariaId={B} />)
    expect(await screen.findByText('09:00')).toBeTruthy()
    expect(screen.getAllByText('João', { selector: 'strong' })).toHaveLength(2)
    expect(screen.getAllByText(/Corte · 30 min/).length).toBe(2)
    expect(screen.getByText('Concluídos').parentElement.textContent).toMatch(/0\/1/) // cancelado nao conta
    expect(screen.getByText('Cancelado')).toBeTruthy()
    expect(screen.getByText('Confirmado')).toBeTruthy()
    expect(screen.getByText('Janelas livres')).toBeTruthy()
    expect(within(screen.getByText('Janelas livres').closest('section')).getByText('Rafa')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /ag\.|agendamentos/ })).toHaveLength(7) // faixa da semana
  })

  it('filtra por profissional', async () => {
    const u = userEvent.setup()
    render(<Agenda barbeariaId={B} />)
    await screen.findByText('09:00')
    await u.click(screen.getByRole('button', { name: 'Rafa' }))
    expect(screen.getByText(/Nenhum atendimento neste dia/)).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Todos' }))
    expect(await screen.findByText('09:00')).toBeTruthy()
  })

  it('concluir gera receita; reabrir remove', async () => {
    const u = userEvent.setup()
    render(<Agenda barbeariaId={B} />)
    await screen.findByText('09:00')
    await u.click(screen.getByRole('button', { name: 'Concluir atendimento de João' }))
    const dlg = await screen.findByRole('dialog', { hidden: true })
    await u.selectOptions(within(dlg).getByLabelText(/Forma de pagamento/), 'cartao')
    await u.click(within(dlg).getByRole('button', { name: /Concluir e lançar receita/ }))
    await waitFor(() => expect(banco.tabelas.receitas).toHaveLength(1))
    expect(banco.tabelas.receitas[0]).toMatchObject({ agendamento_id: 'a1', valor: 45, forma_pagamento: 'cartao', data: hoje, descricao: 'Corte - João' })
    expect(banco.tabelas.agendamentos.find((a) => a.id === 'a1').status).toBe('concluido')

    const item2 = (await screen.findByText('Concluído')).closest('li')
    await u.click(within(item2).getByRole('button', { name: /Reabrir/ }))
    await waitFor(() => expect(banco.tabelas.receitas).toHaveLength(0))
    expect(banco.tabelas.agendamentos.find((a) => a.id === 'a1').status).toBe('confirmado')
  })

  it('novo agendamento: servico preenche valor e duracao; choque e recusado', async () => {
    const u = userEvent.setup()
    render(<Agenda barbeariaId={B} />)
    await screen.findByText('09:00')
    await u.click(screen.getByRole('button', { name: 'Novo agendamento' }))
    const dlg = await screen.findByRole('dialog', { hidden: true })
    await u.selectOptions(within(dlg).getByLabelText('Profissional'), 'pr1')
    await u.selectOptions(within(dlg).getByLabelText('Serviço'), 's1')
    expect(within(dlg).getByLabelText(/Duração/).value).toBe('30')
    expect(within(dlg).getByLabelText(/Valor/).value).toBe('45')
    // hora padrao 09:00 conflita com o atendimento a1 do Carlos
    await u.click(within(dlg).getByRole('button', { name: 'Agendar' }))
    expect((await within(dlg).findByRole('alert')).textContent).toMatch(/09:00 às 09:30/)
    expect(banco.tabelas.agendamentos).toHaveLength(2)
    // outro profissional no mesmo horario: ok
    await u.selectOptions(within(dlg).getByLabelText('Profissional'), 'pr2')
    await u.click(within(dlg).getByRole('button', { name: 'Agendar' }))
    await waitFor(() => expect(banco.tabelas.agendamentos).toHaveLength(3))
    expect(banco.tabelas.agendamentos[2]).toMatchObject({ profissional_id: 'pr2', status: 'confirmado', barbearia_id: B })
  })
})

describe('Relatorios e Inicio', () => {
  const mes = inicioDoMes(hoje)
  const dados = () => ({
    receitas: [{ id: 'r1', barbearia_id: B, data: hoje, descricao: 'x', valor: 100, forma_pagamento: 'pix' }],
    despesas: [
      { id: 'd1', barbearia_id: B, descricao: 'Aluguel', categoria_id: 'k1', vencimento: somarDias(hoje, -2), valor: 300, pago_em: null },
      { id: 'd2', barbearia_id: B, descricao: 'Internet', categoria_id: 'k1', vencimento: somarDias(hoje, 3), valor: 100, pago_em: null },
    ],
    categorias_despesa: [{ id: 'k1', barbearia_id: B, nome: 'Aluguel' }],
    profissionais: [{ id: 'pr1', barbearia_id: B, nome: 'Carlos', comissao_pct: 40, ativo: true }],
    servicos: [{ id: 's1', barbearia_id: B, nome: 'Corte', ativo: true }],
    clientes: [{ id: 'c1', barbearia_id: B, nome: 'João', aniversario: `1990-${mes.slice(5, 7)}-15`, telefone: '2199' }],
    agendamentos: [{
      id: 'a1', barbearia_id: B, cliente_id: 'c1', profissional_id: 'pr1', servico_id: 's1',
      inicio: paraISO(hoje, '10:00'), fim: paraISO(hoje, '10:30'), status: 'concluido', valor: 50,
    }],
    vw_saldo_mensal: [{ barbearia_id: B, mes, receitas: 100, despesas_total: 400, despesas_pagas: 0, saldo_previsto: -300, saldo_realizado: 100 }],
    vw_produtos_estoque: [{ id: 'p1', barbearia_id: B, nome: 'Pomada', estoque_atual: 1, estoque_minimo: 3, repor: true }],
  })

  it('relatorios: kpis, comissao, receita por servico, pico e aniversariante', async () => {
    preparar(dados())
    render(<Relatorios barbeariaId={B} />)
    expect(await screen.findByText('Lucro do mês')).toBeTruthy()
    expect(screen.getByText('Faturamento').parentElement.textContent).toMatch(/R\$\s?100,00/)
    expect(screen.getByText('Lucro do mês').parentElement.textContent).toMatch(/-R\$\s?300,00/)
    expect(screen.getByText(/comissão 40% = R\$\s?20,00/)).toBeTruthy() // 40% de 50
    expect(screen.getByText(/1 atendimento · ticket médio R\$\s?50,00/)).toBeTruthy()
    expect(screen.getByText('Outras receitas')).toBeTruthy() // receita avulsa de 100
    expect(screen.getByText(/O pico do mês é .* às 10h/)).toBeTruthy()
    expect(screen.getByText(/Dia 15/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /seis meses/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Mapa de calor/ })).toBeTruthy()
  })

  it('inicio: saldo, agenda do dia, contas vencidas e estoque', async () => {
    preparar(dados())
    render(<Inicio nome="Matheus" ativa={{ id: B, nome: 'Barbearia' }} />)
    expect(await screen.findByText('Saldo do mês')).toBeTruthy()
    expect(screen.getByText('Saldo do mês').nextSibling.textContent).toMatch(/-R\$\s?300,00/)
    expect(await screen.findByText(/2 contas \(1 vencida\)/)).toBeTruthy()
    expect(screen.getByText('Agenda do dia concluída')).toBeTruthy()
    expect(screen.getByText('1 item')).toBeTruthy()
    expect(screen.getByText('Abaixo do mínimo, hora de repor')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Matheus/)
  })

  it('inicio: botao Outra frase troca o texto', async () => {
    preparar(dados())
    const u = userEvent.setup()
    render(<Inicio nome="Matheus" ativa={{ id: B, nome: 'Barbearia' }} />)
    const antes = screen.getByRole('heading', { level: 1 }).textContent
    await u.click(screen.getByRole('button', { name: /Outra frase/ }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe(antes)
  })

  it('inicio com tudo vazio mostra zeros e mensagens amigaveis', async () => {
    preparar({})
    render(<Inicio nome="Ana" ativa={{ id: B, nome: 'Barbearia' }} />)
    expect(await screen.findByText('Nenhum atendimento marcado para hoje')).toBeTruthy()
    expect(screen.getByText('Nenhuma conta a vencer')).toBeTruthy()
    expect(screen.getByText('Tudo em dia')).toBeTruthy()
  })
})
