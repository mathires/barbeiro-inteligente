import { describe, it, expect } from 'vitest'
import {
  TODOS_HORARIOS, QUALQUER, horariosDoDia, diasDeAtendimento, proximoHorarioLivre, profissionalDoHorario,
  rotuloCurto, rotuloLongo, diaDoMes, validarContato, linkGoogleAgenda, digitosTelefone, formatarTelefone,
} from '../src/lib/publico.js'

// terca-feira, 17/11/2026, 10:10 (horario local; o fuso e fixado em test/global.js)
const agora = new Date(2026, 10, 17, 10, 10)

describe('pagina publica de agendamento', () => {
  it('horarios vao de 09:00 a 19:30, de 30 em 30 minutos', () => {
    expect(TODOS_HORARIOS[0]).toBe('09:00')
    expect(TODOS_HORARIOS.at(-1)).toBe('19:30')
    expect(TODOS_HORARIOS).toHaveLength(22)
  })

  it('nao oferece horario que ja passou nem os proximos 30 minutos', () => {
    const hoje = horariosDoDia('2026-11-17', QUALQUER, agora)
    // 10:10 + 30 min = 10:40 -> 10:30 ja nao serve; 11:00 em diante pode ter vaga
    expect(hoje.find((h) => h.hora === '09:00').livre).toBe(false)
    expect(hoje.find((h) => h.hora === '10:30').livre).toBe(false)
    expect(hoje.filter((h) => h.hora >= '11:00').some((h) => h.livre)).toBe(true)
    // dia passado: nada livre
    expect(horariosDoDia('2026-11-16', QUALQUER, agora).some((h) => h.livre)).toBe(false)
  })

  it('a disponibilidade de exemplo e estavel e "qualquer um" acha vaga quando algum barbeiro tem', () => {
    const a = horariosDoDia('2026-11-19', 'rafa', agora)
    const b = horariosDoDia('2026-11-19', 'rafa', agora)
    expect(a).toEqual(b)
    for (const { hora, livre } of horariosDoDia('2026-11-19', QUALQUER, agora)) {
      const alguem = ['rafa', 'diego', 'thiago'].some((id) => profissionalDoHorario('2026-11-19', id, hora) !== null)
      expect(livre).toBe(alguem)
    }
  })

  it('pula domingo e comeca em hoje', () => {
    const sexta = new Date(2026, 10, 20, 9, 0)
    const dias = diasDeAtendimento(sexta, 4)
    expect(dias).toEqual(['2026-11-20', '2026-11-21', '2026-11-23', '2026-11-24']) // sem 22/11 (domingo)
  })

  it('proximo horario livre existe, vem de dia de atendimento e nunca no passado', () => {
    const p = proximoHorarioLivre(agora)
    expect(p).not.toBeNull()
    expect(p.dia >= '2026-11-17').toBe(true)
    if (p.dia === '2026-11-17') expect(p.hora >= '10:40').toBe(true)
    expect(['rafa', 'diego', 'thiago']).toContain(p.profissionalId)
  })

  it('rotulos de data em portugues', () => {
    expect(rotuloCurto('2026-11-17', agora)).toBe('Hoje')
    expect(rotuloCurto('2026-11-18', agora)).toBe('qua')
    expect(diaDoMes('2026-11-05')).toBe(5)
    expect(rotuloLongo('2026-11-17')).toBe('terça-feira, 17 de novembro')
  })

  it('valida nome e WhatsApp com DDD, apontando o campo com problema', () => {
    expect(validarContato({ nome: ' ', telefone: '21999990000' })).toMatchObject({ ok: false, campo: 'nome' })
    expect(validarContato({ nome: 'Ana', telefone: '99999' })).toMatchObject({ ok: false, campo: 'telefone' })
    expect(validarContato({ nome: 'Ana', telefone: '(21) 99999-0000' })).toEqual({ ok: true })
    expect(validarContato({ nome: 'Ana', telefone: '+55 21 99999-0000' })).toEqual({ ok: true })
    // so celular: DDD de 2 digitos + 9 digitos comecando por 9
    expect(validarContato({ nome: 'Ana', telefone: '2133334444' })).toMatchObject({ ok: false, campo: 'telefone' }) // fixo
    expect(validarContato({ nome: 'Ana', telefone: '21899990000' })).toMatchObject({ ok: false, campo: 'telefone' }) // 3o digito nao e 9
    expect(validarContato({ nome: 'Ana', telefone: '02199999000' })).toMatchObject({ ok: false, campo: 'telefone' }) // DDD com zero
    expect(validarContato({ nome: 'Ana', telefone: '99999000011' })).toEqual({ ok: true }) // DDD 99 existe (MA)
    expect(validarContato({ nome: 'Ana', telefone: '9999900001' })).toMatchObject({ ok: false, campo: 'telefone' }) // faltou 1 digito
  })

  it('mascara do WhatsApp aceita so digitos, no maximo DDD (2) + numero (9)', () => {
    expect(formatarTelefone('')).toBe('')
    expect(formatarTelefone('2')).toBe('(2')
    expect(formatarTelefone('21')).toBe('(21')
    expect(formatarTelefone('219')).toBe('(21) 9')
    expect(formatarTelefone('2199999')).toBe('(21) 99999')
    expect(formatarTelefone('21999990')).toBe('(21) 99999-0')
    expect(formatarTelefone('21999990000')).toBe('(21) 99999-0000')
    expect(formatarTelefone('abc(21) 99999-0000xyz')).toBe('(21) 99999-0000') // letras e simbolos sao descartados
    expect(formatarTelefone('219999900001234')).toBe('(21) 99999-0000') // passou de 11 digitos: corta
    expect(formatarTelefone('+55 21 99999-0000')).toBe('(21) 99999-0000') // colado com +55: tira o pais
    expect(digitosTelefone('55999990000')).toBe('55999990000') // 55 no inicio com 11 digitos e o DDD do RS
  })
})

describe('link do Google Agenda', () => {
  it('monta o evento no fuso da barbearia, com titulo, local e detalhes', () => {
    const url = new URL(linkGoogleAgenda({
      dia: '2026-11-21', hora: '10:30', duracao_min: 70, titulo: 'Corte + barba - Poste', local: 'Poste, Recreio', detalhes: 'Para cancelar: https://x.test/#/cancelar/a/b',
    }))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('Corte + barba - Poste')
    expect(url.searchParams.get('dates')).toBe('20261121T103000/20261121T114000')
    expect(url.searchParams.get('ctz')).toBe('America/Sao_Paulo')
    expect(url.searchParams.get('location')).toBe('Poste, Recreio')
    expect(url.searchParams.get('details')).toContain('Para cancelar')
  })
})
