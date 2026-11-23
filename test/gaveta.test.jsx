// @vitest-environment jsdom
// Menu do celular: gaveta lateral, barra inferior enxuta e botao "+ Criar" (e o atalho que abre o formulario na tela).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { criarBanco } from './fakeSupabase.js'
import { hojeISO } from '../src/lib/formato.js'
import { MENU, BARRA, GRUPOS_GAVETA } from '../src/lib/menu.js'
import { ATALHOS_CRIAR, pedirCriar, consumirCriar, VALIDADE_MS, _limparPedido } from '../src/lib/atalhoCriar.js'

const h = vi.hoisted(() => ({ sb: null, signOut: vi.fn() }))
vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    auth: { signOut: (...a) => h.signOut(...a) },
    from: (t) => h.sb.from(t),
    channel: (n) => h.sb.channel(n),
    removeChannel: (c) => h.sb.removeChannel(c),
  },
  configurado: true,
}))

import Layout from '../src/components/Layout.jsx'
import Receitas from '../src/pages/Receitas.jsx'
import Agenda from '../src/pages/Agenda.jsx'

const B = 'B1'
const props = { rota: 'agenda', nome: 'Matheus', barbearias: [{ id: B, nome: 'Barbearia Teste' }], ativa: { id: B, nome: 'Barbearia Teste' }, onTrocar() {} }
const bottomnav = () => screen.getAllByRole('navigation', { name: 'Menu principal' }).find((n) => n.className === 'bottomnav')
const apertarVoltar = () => act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })) })
const menuLateral = () => screen.getByRole('dialog', { name: 'Menu' })

beforeEach(() => {
  h.sb = criarBanco({ barbearias: [{ id: B, slug: 'poste-vermelho', agendamento_online: true }] }).sb
  h.signOut.mockClear()
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  window.location.hash = ''
  _limparPedido()
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('configuracao do menu (fonte unica)', () => {
  it('toda tela do menu aparece em exatamente um grupo da gaveta, e so telas que existem', () => {
    const noMenu = MENU.map((m) => m.rota).sort()
    const naGaveta = GRUPOS_GAVETA.flatMap((g) => g.itens)
    expect([...naGaveta].sort()).toEqual(noMenu)
    expect(new Set(naGaveta).size).toBe(naGaveta.length)
  })

  it('as abas fixas da barra sao telas do menu', () => {
    BARRA.forEach((id) => expect(MENU.some((m) => m.rota === id)).toBe(true))
  })

  it('os atalhos do + Criar levam a telas que existem', () => {
    ATALHOS_CRIAR.forEach((a) => expect(MENU.some((m) => m.rota === a.rota)).toBe(true))
  })
})

describe('pedido do + Criar (lib)', () => {
  it('em outra tela: troca o endereco e guarda o pedido para a tela consumir uma unica vez', () => {
    window.location.hash = '#/inicio'
    expect(pedirCriar('receita')).toBe(true)
    expect(window.location.hash).toBe('#/receitas')
    expect(consumirCriar('despesa')).toBe(false) // outro tipo nao consome
    expect(consumirCriar('receita')).toBe(true)
    expect(consumirCriar('receita')).toBe(false) // so uma vez
  })

  it('na propria tela: avisa por evento, sem mudar o endereco', () => {
    window.location.hash = '#/receitas'
    const ouvir = vi.fn()
    window.addEventListener('bi:criar', ouvir)
    pedirCriar('receita')
    window.removeEventListener('bi:criar', ouvir)
    expect(ouvir).toHaveBeenCalledTimes(1)
    expect(ouvir.mock.calls[0][0].detail).toBe('receita')
  })

  it('o pedido expira: tela que demora demais nao abre formulario do nada', () => {
    vi.useFakeTimers()
    pedirCriar('cliente')
    vi.advanceTimersByTime(VALIDADE_MS + 1)
    expect(consumirCriar('cliente')).toBe(false)
  })

  it('tipo desconhecido e ignorado', () => {
    expect(pedirCriar('foguete')).toBe(false)
    expect(window.location.hash).toBe('')
  })
})

describe('barra inferior enxuta', () => {
  it('tem Inicio, Agenda, Criar, Clientes e Menu, nessa ordem (Receitas e Despesas foram para a gaveta)', () => {
    render(<Layout {...props} badges={{}}><p>tela</p></Layout>)
    const itens = [...bottomnav().querySelectorAll('.bn')].map((e) => e.textContent.trim())
    expect(itens).toEqual(['Início', 'Agenda', 'Criar', 'Clientes', 'Menu'])
  })

  it('fora das abas fixas, o botao Menu mostra a tela atual (orientacao) e fica marcado', () => {
    render(<Layout {...props} rota="receitas" badges={{}}><p>tela</p></Layout>)
    const menu = within(bottomnav()).getByRole('button', { name: 'Menu, tela atual: Receitas' })
    expect(menu.textContent).toContain('Receitas')
    expect(menu.getAttribute('aria-current')).toBe('page')
  })

  it('nas abas fixas, o Menu nao fica marcado', () => {
    render(<Layout {...props} rota="clientes" badges={{}}><p>tela</p></Layout>)
    expect(within(bottomnav()).getByRole('button', { name: 'Menu' }).getAttribute('aria-current')).toBeNull()
  })
})

describe('gaveta lateral', () => {
  it('abre pelo Menu com os grupos; Financeiro comeca recolhido e abre ao tocar', async () => {
    const u = userEvent.setup()
    render(<Layout {...props} badges={{}}><p>tela</p></Layout>)
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
    await u.click(within(bottomnav()).getByRole('button', { name: 'Menu' }))

    const g = within(menuLateral())
    expect(g.getByText('Dia a dia')).toBeTruthy()
    expect(g.getByText('Cadastro')).toBeTruthy()
    expect(g.getByRole('link', { name: 'Serviços' }).getAttribute('href')).toBe('#/servicos')
    expect(g.queryByRole('link', { name: 'Receitas' })).toBeNull()

    const fin = g.getByRole('button', { name: 'Financeiro' })
    expect(fin.getAttribute('aria-expanded')).toBe('false')
    await u.click(fin)
    expect(fin.getAttribute('aria-expanded')).toBe('true')
    ;['Receitas', 'Despesas', 'Relatórios'].forEach((n) => expect(g.getByRole('link', { name: n })).toBeTruthy())
  })

  it('Financeiro ja abre expandido quando a tela atual esta nele, com a tela marcada', async () => {
    render(<Layout {...props} rota="despesas" badges={{}}><p>tela</p></Layout>)
    await userEvent.click(within(bottomnav()).getByRole('button', { name: /^Menu/ }))
    const g = within(menuLateral())
    expect(g.getByRole('button', { name: 'Financeiro' }).getAttribute('aria-expanded')).toBe('true')
    expect(g.getByRole('link', { name: 'Despesas' }).getAttribute('aria-current')).toBe('page')
  })

  it('mostra os selos das telas dentro dela (produtos abaixo do minimo) e da agenda', async () => {
    render(<Layout {...props} badges={{ agenda: 3, produtos: 2 }}><p>tela</p></Layout>)
    expect(within(bottomnav()).getByRole('button', { name: 'Menu' }).querySelector('.bn-badge.warn').textContent).toBe('2')
    await userEvent.click(within(bottomnav()).getByRole('button', { name: 'Menu' }))
    const g = within(menuLateral())
    expect(g.getByRole('link', { name: /Produtos/ }).querySelector('.nb.warn').textContent).toBe('2')
    expect(g.getByRole('link', { name: /^Agenda\d*$/ }).querySelector('.nb').textContent).toBe('3')
  })

  it('escolher uma tela fecha a gaveta sem desfazer a navegacao', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    render(<Layout {...props} badges={{}}><p>tela</p></Layout>)
    fireEvent.click(within(bottomnav()).getByRole('button', { name: 'Menu' }))
    const link = within(menuLateral()).getByRole('link', { name: 'Serviços' })
    fireEvent.click(link)
    window.history.pushState(null, '', '#/servicos') // o navegador cria a entrada do link
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
    act(() => { vi.runAllTimers() })
    expect(back).not.toHaveBeenCalled()
  })

  it('o voltar do aparelho fecha a gaveta em vez de sair da tela', async () => {
    render(<Layout {...props} badges={{}}><p>tela</p></Layout>)
    fireEvent.click(within(bottomnav()).getByRole('button', { name: 'Menu' }))
    expect(menuLateral()).toBeTruthy()
    apertarVoltar()
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
  })

  it('fecha pelo X e tocando fora', async () => {
    const u = userEvent.setup()
    render(<Layout {...props} badges={{}}><p>tela</p></Layout>)
    await u.click(within(bottomnav()).getByRole('button', { name: 'Menu' }))
    await u.click(screen.getByRole('button', { name: 'Fechar menu' }))
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()

    await u.click(within(bottomnav()).getByRole('button', { name: 'Menu' }))
    fireEvent.click(menuLateral()) // toque no fundo escuro: o alvo e o proprio <dialog>
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
  })

  it('fecha deslizando para a esquerda, mas nao ao rolar a lista na vertical', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Layout {...props} badges={{}}><p>tela</p></Layout>)
    fireEvent.click(within(bottomnav()).getByRole('button', { name: 'Menu' }))
    const d = menuLateral()
    const toque = (x, y) => ({ touches: [{ clientX: x, clientY: y }] })

    fireEvent.touchStart(d, toque(200, 300))
    fireEvent.touchMove(d, toque(190, 420)) // rolagem vertical
    fireEvent.touchEnd(d)
    act(() => { vi.runAllTimers() })
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeTruthy()

    fireEvent.touchStart(d, toque(250, 300))
    fireEvent.touchMove(d, toque(120, 305)) // 130px para a esquerda
    fireEvent.touchEnd(d)
    act(() => { vi.runAllTimers() })
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()
  })

  it('Sair fica dentro da gaveta e encerra a sessao', async () => {
    const u = userEvent.setup()
    render(<Layout {...props} badges={{}}><p>tela</p></Layout>)
    await u.click(within(bottomnav()).getByRole('button', { name: 'Menu' }))
    await u.click(within(menuLateral()).getByRole('button', { name: 'Sair' }))
    expect(h.signOut).toHaveBeenCalledTimes(1)
  })

  it('mostra o link de agendamento com copiar e abrir quando esta no ar', async () => {
    const u = userEvent.setup()
    const copiar = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: copiar }, configurable: true })
    render(<Layout {...props} badges={{}}><p>tela</p></Layout>)
    await u.click(within(bottomnav()).getByRole('button', { name: 'Menu' }))
    const g = within(menuLateral())
    const abrir = await g.findByRole('link', { name: 'Abrir página de agendamento' })
    expect(abrir.getAttribute('href')).toBe(`${window.location.origin}/#/agendar/poste-vermelho`)
    expect(abrir.getAttribute('rel')).toContain('noopener')

    await u.click(g.getByRole('button', { name: 'Copiar link de agendamento' }))
    expect(copiar).toHaveBeenCalledWith(`${window.location.origin}/#/agendar/poste-vermelho`)
    expect(await g.findByText('Link copiado.')).toBeTruthy()
  })

  it('sem agendamento online ligado, nao mostra o atalho do link', async () => {
    h.sb = criarBanco({ barbearias: [{ id: B, slug: 'poste-vermelho', agendamento_online: false }] }).sb
    render(<Layout {...props} badges={{}}><p>tela</p></Layout>)
    fireEvent.click(within(bottomnav()).getByRole('button', { name: 'Menu' }))
    await act(async () => { await Promise.resolve() })
    expect(within(menuLateral()).queryByText('Seu link de agendamento')).toBeNull()
  })
})

describe('botao + Criar', () => {
  it('abre o menu com os 4 atalhos e fecha com Esc', async () => {
    const u = userEvent.setup()
    render(<Layout {...props} badges={{}}><p>tela</p></Layout>)
    const criar = within(bottomnav()).getByRole('button', { name: 'Criar' })
    expect(criar.getAttribute('aria-expanded')).toBe('false')
    await u.click(criar)
    expect(criar.getAttribute('aria-expanded')).toBe('true')
    const itens = within(screen.getByRole('menu', { name: 'Criar' })).getAllByRole('menuitem').map((e) => e.textContent)
    expect(itens).toEqual(['Novo agendamento', 'Nova receita', 'Nova despesa', 'Novo cliente'])
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('escolher um atalho leva a tela certa e fecha o menu', async () => {
    const u = userEvent.setup()
    render(<Layout {...props} badges={{}}><p>tela</p></Layout>)
    await u.click(within(bottomnav()).getByRole('button', { name: 'Criar' }))
    await u.click(screen.getByRole('menuitem', { name: 'Nova receita' }))
    expect(window.location.hash).toBe('#/receitas')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('tocar fora fecha o menu sem criar nada', async () => {
    const u = userEvent.setup()
    render(<Layout {...props} badges={{}}><p>tela</p></Layout>)
    await u.click(within(bottomnav()).getByRole('button', { name: 'Criar' }))
    await u.click(screen.getByRole('button', { name: 'Fechar atalhos' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(window.location.hash).toBe('')
  })
})

describe('atalho abre o formulario na tela de destino', () => {
  it('Receitas aberta depois do pedido (veio de outra tela): abre "Nova receita" ao carregar', async () => {
    pedirCriar('receita') // acontece antes de a tela existir
    render(<Receitas barbeariaId={B} />)
    expect(await screen.findByRole('dialog', { name: 'Nova receita' })).toBeTruthy()
  })

  it('Receitas ja aberta: o pedido abre o formulario na hora, sem navegar', async () => {
    window.location.hash = '#/receitas'
    render(<Receitas barbeariaId={B} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => { pedirCriar('receita') })
    expect(await screen.findByRole('dialog', { name: 'Nova receita' })).toBeTruthy()
  })

  it('Agenda abre "Novo agendamento"', async () => {
    window.location.hash = '#/agenda'
    render(<Agenda barbeariaId={B} />)
    act(() => { pedirCriar('agendamento') })
    expect(await screen.findByRole('dialog', { name: 'Novo agendamento' })).toBeTruthy()
  })

  it('pedido de outro tipo nao abre formulario errado', async () => {
    pedirCriar('cliente')
    render(<Receitas barbeariaId={B} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nova receita' })).toBeTruthy())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('o pedido e consumido uma vez: reabrir a tela depois nao abre de novo', async () => {
    pedirCriar('receita')
    const { unmount } = render(<Receitas barbeariaId={B} />)
    await screen.findByRole('dialog', { name: 'Nova receita' })
    unmount()
    render(<Receitas barbeariaId={B} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nova receita' })).toBeTruthy())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('hoje de verdade: a data do formulario novo e a de hoje (sanidade do formulario aberto pelo atalho)', async () => {
    pedirCriar('receita')
    render(<Receitas barbeariaId={B} />)
    const dlg = await screen.findByRole('dialog', { name: 'Nova receita' })
    expect(within(dlg).getByLabelText(/Data/).value).toBe(hojeISO())
  })
})
