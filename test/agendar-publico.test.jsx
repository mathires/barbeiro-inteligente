// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AgendarPublico from '../src/pages/AgendarPublico.jsx'

beforeEach(() => {
  // movimento reduzido: sem esperas de animacao nos testes
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

const titulo = (nome) => screen.findByRole('heading', { name: nome })

describe('pagina publica de agendamento', () => {
  it('avisa que e uma previa com dados de exemplo e mostra o proximo horario livre', () => {
    render(<AgendarPublico />)
    expect(screen.getByRole('heading', { level: 1, name: 'Corte marcado em 3 toques.' })).toBeTruthy()
    expect(screen.getByRole('note').textContent).toMatch(/dados de exemplo/)
    expect(screen.getByText(/Próximo horário livre:/)).toBeTruthy()
  })

  it('nao tem o botao Agendar no topo; ficam so os botoes vermelhos Agendar horario', () => {
    render(<AgendarPublico />)
    expect(screen.queryByRole('button', { name: 'Agendar' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Agendar horário' }).length).toBeGreaterThan(0)
  })

  it('salvar no calendario abre o Google Agenda com o horario marcado', async () => {
    const u = userEvent.setup()
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<AgendarPublico />)
    await u.click(screen.getByRole('button', { name: /Corte \+ barba/ }))
    await titulo('Com quem você prefere?')
    await u.click(screen.getByRole('button', { name: /Rafa/ }))
    await titulo('Escolha dia e horário')
    const dias = within(screen.getByRole('group', { name: 'Dias' })).getAllByRole('button')
    await u.click(dias.at(-1))
    await u.click(screen.getAllByRole('button', { name: /^\d{2}:\d{2}$/ }).filter((b) => !b.disabled)[0])
    await u.click(screen.getByRole('button', { name: 'Continuar' }))
    await titulo('Confira e confirme')
    await u.type(screen.getByLabelText('Seu nome'), 'Matheus')
    await u.type(screen.getByLabelText('WhatsApp com DDD'), '21999990000')
    await u.click(screen.getByRole('button', { name: 'Confirmar horário' }))
    await titulo('Matheus, está marcado!')
    await u.click(screen.getByRole('button', { name: 'Salvar no Google Agenda' }))
    expect(abrir).toHaveBeenCalledTimes(1)
    expect(String(abrir.mock.calls[0][0])).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/)
    abrir.mockRestore()
  })

  it('percorre servico, barbeiro, horario e confirma com validacao do contato', async () => {
    const u = userEvent.setup()
    render(<AgendarPublico />)

    // 1) servico: escolher avanca sozinho
    await u.click(screen.getByRole('button', { name: /Corte \+ barba/ }))
    await titulo('Com quem você prefere?')

    // 2) barbeiro
    await u.click(screen.getByRole('button', { name: /Rafa/ }))
    await titulo('Escolha dia e horário')
    const continuar = screen.getByRole('button', { name: 'Continuar' })
    expect(continuar.disabled).toBe(true) // sem horario escolhido

    // 3) dia e horario: pega o ultimo dia (mais chance de vaga) e o primeiro horario livre
    const dias = within(screen.getByRole('group', { name: 'Dias' })).getAllByRole('button')
    expect(dias).toHaveLength(7)
    await u.click(dias.at(-1))
    const livres = screen.getAllByRole('button', { name: /^\d{2}:\d{2}$/ }).filter((b) => !b.disabled)
    expect(livres.length).toBeGreaterThan(0)
    const horaEscolhida = livres[0].textContent
    await u.click(livres[0])
    expect(livres[0].getAttribute('aria-pressed')).toBe('true')
    await u.click(screen.getByRole('button', { name: 'Continuar' }))

    // 4) confirmar: resumo e validacao
    await titulo('Confira e confirme')
    expect(screen.getByText('Corte + barba', { selector: 'dd' })).toBeTruthy()
    expect(screen.getByText(/70,00/)).toBeTruthy()
    expect(screen.getByText(new RegExp(`${horaEscolhida}$`), { selector: 'dd' })).toBeTruthy()

    await u.click(screen.getByRole('button', { name: 'Confirmar horário' }))
    expect(screen.getByRole('alert').textContent).toBe('Informe seu nome.')
    expect(document.activeElement).toBe(screen.getByLabelText('Seu nome'))

    await u.type(screen.getByLabelText('Seu nome'), 'Matheus Silva')
    expect(screen.getByRole('alert').textContent).toBe('') // erro some ao digitar
    await u.type(screen.getByLabelText('WhatsApp com DDD'), '999')
    await u.click(screen.getByRole('button', { name: 'Confirmar horário' }))
    expect(screen.getByRole('alert').textContent).toMatch(/WhatsApp com DDD/)
    expect(document.activeElement).toBe(screen.getByLabelText('WhatsApp com DDD'))

    await u.clear(screen.getByLabelText('WhatsApp com DDD'))
    await u.type(screen.getByLabelText('WhatsApp com DDD'), 'ab21999990000999') // letras e excesso sao ignorados
    expect(screen.getByLabelText('WhatsApp com DDD').value).toBe('(21) 99999-0000')
    await u.click(screen.getByRole('button', { name: 'Confirmar horário' }))

    // 5) bilhete
    await titulo('Matheus, está marcado!')
    expect(screen.getByText('Confirmado')).toBeTruthy()
    expect(screen.getByText('chegue 5 min antes')).toBeTruthy()

    // agendar outro volta ao inicio, sem dados anteriores
    await u.click(screen.getByRole('button', { name: 'Agendar outro' }))
    await titulo('O que vamos fazer hoje?')
    expect(screen.getByRole('button', { name: /Corte \+ barba/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('permite voltar para etapas anteriores sem perder a escolha', async () => {
    const u = userEvent.setup()
    render(<AgendarPublico />)
    await u.click(screen.getByRole('button', { name: /Sobrancelha/ }))
    await titulo('Com quem você prefere?')
    await u.click(screen.getByRole('button', { name: 'Voltar' }))
    await titulo('O que vamos fazer hoje?')
    expect(screen.getByRole('button', { name: /Sobrancelha/ }).getAttribute('aria-pressed')).toBe('true')
  })
})
