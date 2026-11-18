import { describe, it, expect } from 'vitest'
import {
  sugerirSlug, formDoBanco, validarConfig, mensagemDoErro, linkPublico, textoWhatsApp, pendencias, horaCurta,
} from '../src/lib/agendamentoOnline.js'

const bancoPadrao = {
  slug: null, agendamento_online: false, abertura: '09:00:00', fechamento: '20:00:00', passo_min: 30,
  dias_atendimento: [1, 2, 3, 4, 5, 6], antecedencia_min: 60, cancelamento_ate_min: 120, janela_dias: 30,
}

describe('configuracao do agendamento online', () => {
  it('sugere o endereco a partir do nome, sem acento e sem "Barbearia"', () => {
    expect(sugerirSlug('Barbearia Poste Vermelho')).toBe('poste-vermelho')
    expect(sugerirSlug('Barbearia do Zé & Cia!')).toBe('do-ze-cia')
    expect(sugerirSlug('  Navalha Ágil  ')).toBe('navalha-agil')
    expect(sugerirSlug('Ab')).toBe('')
    expect(sugerirSlug('x'.repeat(60)).length).toBe(40)
  })

  it('converte o registro do banco em formulario (hora curta, tudo texto)', () => {
    const f = formDoBanco(bancoPadrao)
    expect(f).toMatchObject({ ligado: false, slug: '', abertura: '09:00', fechamento: '20:00', passo_min: '30', antecedencia_min: '60', cancelamento_ate_min: '120', janela_dias: '30' })
    expect(f.dias).toEqual([1, 2, 3, 4, 5, 6])
    expect(horaCurta('09:30:00')).toBe('09:30')
  })

  it('aceita a configuracao padrao e devolve os valores no formato do banco', () => {
    const r = validarConfig({ ...formDoBanco(bancoPadrao), slug: ' poste-vermelho ', ligado: true, dias: [6, 1, 3] })
    expect(r.ok).toBe(true)
    expect(r.valores).toMatchObject({ slug: 'poste-vermelho', agendamento_online: true, passo_min: 30, antecedencia_min: 60, janela_dias: 30 })
    expect(r.valores.dias_atendimento).toEqual([1, 3, 6])
  })

  it('permite salvar desligado e sem endereco, mas nao ligar sem endereco', () => {
    const base = formDoBanco(bancoPadrao)
    expect(validarConfig(base).valores.slug).toBeNull()
    const r = validarConfig({ ...base, ligado: true })
    expect(r).toMatchObject({ ok: false, campo: 'slug' })
  })

  it('recusa os mesmos valores que o banco recusaria', () => {
    const base = { ...formDoBanco(bancoPadrao), slug: 'poste' }
    const campo = (alteracao) => validarConfig({ ...base, ...alteracao }).campo
    expect(campo({ slug: 'Poste Vermelho' })).toBe('slug')
    expect(campo({ slug: 'ab' })).toBe('slug')
    expect(campo({ slug: '-poste' })).toBe('slug')
    expect(campo({ slug: 'a'.repeat(41) })).toBe('slug')
    expect(campo({ abertura: '20:00', fechamento: '09:00' })).toBe('abertura')
    expect(campo({ abertura: '10:00', fechamento: '10:00' })).toBe('abertura')
    expect(campo({ passo_min: '25' })).toBe('passo_min')
    expect(campo({ dias: [] })).toBe('dias')
    expect(campo({ antecedencia_min: '1441' })).toBe('antecedencia_min')
    expect(campo({ antecedencia_min: 'abc' })).toBe('antecedencia_min')
    expect(campo({ cancelamento_ate_min: '2881' })).toBe('cancelamento_ate_min')
    expect(campo({ janela_dias: '0' })).toBe('janela_dias')
    expect(campo({ janela_dias: '91' })).toBe('janela_dias')
    expect(validarConfig({ ...base, antecedencia_min: '0', janela_dias: '90', cancelamento_ate_min: '2880' }).ok).toBe(true)
  })

  it('traduz os erros do banco', () => {
    expect(mensagemDoErro({ code: '23505' })).toMatch(/já está em uso/)
    expect(mensagemDoErro({ code: '23514' })).toMatch(/recusou/)
    expect(mensagemDoErro({ code: 'XX' })).toMatch(/Não foi possível salvar/)
    expect(mensagemDoErro(null)).toBe('')
  })

  it('monta o link e o texto do WhatsApp com o link dentro', () => {
    const link = linkPublico('poste-vermelho', 'https://barbeiro-inteligente.demonfoxninja123.workers.dev')
    expect(link).toBe('https://barbeiro-inteligente.demonfoxninja123.workers.dev/#/agendar/poste-vermelho')
    const t = textoWhatsApp({ nome: 'Barbearia Poste Vermelho', link })
    expect(t).toContain(link)
    expect(t).toContain('Barbearia Poste Vermelho')
    expect(t).not.toMatch(/lembrete/i) // Fase 1: nao promete nada que o sistema nao faz
  })

  it('lista o que falta para o link funcionar', () => {
    expect(pendencias({ profissionais: 0, servicos: 0, slug: null, ligado: false, testeTurnstile: true })).toHaveLength(5)
    expect(pendencias({ profissionais: 2, servicos: 3, slug: 'poste', ligado: true, testeTurnstile: false })).toEqual([])
    expect(pendencias({ profissionais: 1, servicos: 1, slug: 'poste', ligado: true, testeTurnstile: true }).join(' ')).toMatch(/chave real/)
  })
})
