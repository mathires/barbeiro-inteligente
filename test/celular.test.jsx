// @vitest-environment jsdom
// Comportamentos de celular: "voltar" do aparelho fecha a janela / volta uma etapa, e o menu inferior.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import Modal from '../src/components/Modal.jsx'
import Layout from '../src/components/Layout.jsx'
import AgendarPublico from '../src/pages/AgendarPublico.jsx'

vi.mock('../src/lib/supabase.js', () => ({ supabase: { auth: { signOut: vi.fn() } }, configurado: true }))

beforeEach(() => {
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  window.HTMLDialogElement.prototype.showModal ??= function () { this.open = true }
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

// O "voltar" do aparelho: o navegador tira a entrada de cima e dispara popstate
const apertarVoltar = () => act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })) })

function ComJanela({ onFechar = () => {} }) {
  const [aberta, setAberta] = useState(true)
  const fechar = () => { onFechar(); setAberta(false) }
  return aberta ? <Modal titulo="Nova receita" onFechar={fechar}><p>conteudo</p></Modal> : <p>fechada</p>
}

describe('janela (Modal) no celular', () => {
  it('ao abrir empilha uma entrada no historico sem trocar o endereco', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const antes = window.location.href
    render(<ComJanela />)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0][0].biJanela).toBeTruthy()
    expect(window.location.href).toBe(antes)
  })

  it('o voltar do aparelho fecha a janela em vez de sair da tela', () => {
    const fechou = vi.fn()
    render(<ComJanela onFechar={fechou} />)
    apertarVoltar()
    expect(fechou).toHaveBeenCalledTimes(1)
    expect(screen.getByText('fechada')).toBeTruthy()
  })

  it('fechar pelo X retira a entrada extra do historico', async () => {
    vi.useFakeTimers()
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    render(<ComJanela />)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.getByText('fechada')).toBeTruthy()
    act(() => { vi.runAllTimers() })
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('se um link dentro da janela ja trocou de tela, nao desfaz a navegacao', () => {
    vi.useFakeTimers()
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    render(<ComJanela />)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    window.history.pushState(null, '', '#/produtos') // o link do menu "Mais" criou outra entrada
    act(() => { vi.runAllTimers() })
    expect(back).not.toHaveBeenCalled()
  })
})

describe('menu do celular (Layout)', () => {
  const props = { rota: 'agenda', nome: 'Matheus', barbearias: [{ id: 'b1', nome: 'Barbearia Teste' }], ativa: { id: 'b1', nome: 'Barbearia Teste' }, onTrocar() {} }

  it('mostra selos na barra inferior e o Sair fica so dentro do Mais (sem botao solto no topo)', async () => {
    render(<Layout {...props} badges={{ agenda: 3, produtos: 2 }}><p>tela</p></Layout>)
    const barra = screen.getAllByRole('navigation', { name: 'Menu principal' }).find((n) => n.className === 'bottomnav')
    expect(barra.querySelector('a[href="#/agenda"] .bn-badge').textContent).toBe('3')
    expect(barra.querySelector('button .bn-badge.warn').textContent).toBe('2') // produtos fica no "Mais"
    expect(document.querySelector('.topbar button[aria-label="Sair"]')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /Mais/ }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sair' })).toBeTruthy()
  })

  it('trocar de tela volta ao topo da pagina', () => {
    const { rerender } = render(<Layout {...props} badges={{}}><p>tela</p></Layout>)
    document.documentElement.scrollTop = 500
    rerender(<Layout {...props} rota="receitas" badges={{}}><p>tela</p></Layout>)
    expect(document.documentElement.scrollTop).toBe(0)
  })
})

describe('pagina publica: voltar do celular', () => {
  const titulo = (nome) => screen.findByRole('heading', { name: nome })

  it('volta uma etapa por vez em vez de sair do site', async () => {
    const u = userEvent.setup()
    const push = vi.spyOn(window.history, 'pushState')
    render(<AgendarPublico />)

    await u.click(screen.getByRole('button', { name: /Corte \+ barba/ }))
    await titulo('Com quem você prefere?')
    expect(push).toHaveBeenCalledTimes(1) // entrou no meio do fluxo: uma entrada extra

    await u.click(screen.getByRole('button', { name: /Rafa/ }))
    await titulo('Escolha dia e horário')
    expect(push).toHaveBeenCalledTimes(1) // continua uma so

    apertarVoltar()
    await titulo('Com quem você prefere?')
    expect(push).toHaveBeenCalledTimes(2) // ainda no meio: recoloca a entrada para o proximo voltar

    apertarVoltar()
    await titulo('O que vamos fazer hoje?')
    expect(push).toHaveBeenCalledTimes(2) // no inicio: o proximo voltar sai do site normalmente
  })

  it('voltar ao inicio pelos botoes da tela retira a entrada extra', async () => {
    const u = userEvent.setup()
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    render(<AgendarPublico />)
    await u.click(screen.getByRole('button', { name: /Corte \+ barba/ }))
    await titulo('Com quem você prefere?')
    await u.click(screen.getByRole('button', { name: 'Voltar' }))
    await titulo('O que vamos fazer hoje?')
    expect(back).toHaveBeenCalledTimes(1)
  })
})
