import { describe, it, expect } from 'vitest'
import { lerNumero, formularioInicial, paraLinha, mensagemDeErro } from '../src/lib/campos.js'
import { somarMeses, inicioDoMes, nomeDoMesISO, dataBR } from '../src/lib/formato.js'

describe('lerNumero', () => {
  it.each([['35,50', 35.5], ['35.50', 35.5], ['1.234,56', 1234.56], ['1.234', 1234], ['45', 45], ['', null], ['abc', null], ['0', 0]])('%s', (e, s) => {
    expect(lerNumero(e)).toBe(s)
  })
})

const campos = [
  { chave: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true },
  { chave: 'duracao_min', rotulo: 'Duração', tipo: 'inteiro', obrigatorio: true, min: 5, max: 600 },
  { chave: 'preco', rotulo: 'Preço', tipo: 'moeda', obrigatorio: true, min: 0 },
  { chave: 'descricao', rotulo: 'Desc', tipo: 'texto-longo' },
  { chave: 'ativo', rotulo: 'Ativo', tipo: 'booleano', padrao: true },
]

describe('paraLinha / formularioInicial', () => {
  it('converte formulario valido', () => {
    const f = { nome: '  Corte ', duracao_min: '30', preco: '45,5', descricao: '', ativo: true }
    expect(paraLinha(campos, f)).toEqual({ nome: 'Corte', duracao_min: 30, preco: 45.5, descricao: null, ativo: true })
  })
  it('rejeita obrigatorio vazio, faixa e valor invalido', () => {
    const base = { nome: 'x', duracao_min: '30', preco: '10', descricao: '', ativo: true }
    expect(() => paraLinha(campos, { ...base, nome: ' ' })).toThrow(/Preencha/)
    expect(() => paraLinha(campos, { ...base, duracao_min: '2' })).toThrow(/mínimo/)
    expect(() => paraLinha(campos, { ...base, duracao_min: '30,5' })).toThrow(/inteiro/)
    expect(() => paraLinha(campos, { ...base, preco: 'dez' })).toThrow(/inválido/)
    expect(() => paraLinha(campos, { ...base, preco: '-1' })).toThrow(/mínimo/)
  })
  it('padroes (inclusive funcao) e edicao', () => {
    expect(formularioInicial(campos, null).ativo).toBe(true)
    expect(formularioInicial(campos, { nome: 'A', preco: 45.5, duracao_min: 30, ativo: false }).preco).toBe('45,5')
    expect(formularioInicial([{ chave: 'd', tipo: 'data', padrao: () => '2026-10-21' }], null).d).toBe('2026-10-21')
    expect(formularioInicial([{ chave: 'q', tipo: 'inteiro', padrao: '1' }], null).q).toBe('1')
  })
  it('lgpd preserva data original e limpa ao desmarcar', () => {
    const c = [{ chave: 'consentimento_lgpd_em', rotulo: 'L', tipo: 'lgpd' }]
    const orig = { consentimento_lgpd_em: '2026-01-01T00:00:00Z' }
    expect(paraLinha(c, { consentimento_lgpd_em: true }, orig).consentimento_lgpd_em).toBe('2026-01-01T00:00:00Z')
    expect(paraLinha(c, { consentimento_lgpd_em: false }, orig).consentimento_lgpd_em).toBeNull()
    expect(typeof paraLinha(c, { consentimento_lgpd_em: true }, null).consentimento_lgpd_em).toBe('string')
  })
  it('mensagens de erro do banco', () => {
    expect(mensagemDeErro({ code: '23505' })).toMatch(/Já existe/)
    expect(mensagemDeErro({ code: '23503' }, 'excluir')).toMatch(/em uso/)
    expect(mensagemDeErro({ code: '23P01' })).toMatch(/horário/)
  })
})

describe('datas', () => {
  it('somarMeses ajusta fim de mes e virada de ano', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29')
    expect(somarMeses('2026-12-15', 1)).toBe('2027-01-15')
    expect(somarMeses('2026-01-15', -1)).toBe('2025-12-15')
  })
  it('formatos', () => {
    expect(inicioDoMes('2026-10-21')).toBe('2026-10-01')
    expect(nomeDoMesISO('2026-10-01')).toBe('Outubro de 2026')
    expect(dataBR('2026-05-17')).toBe('17/05/2026')
  })
})
