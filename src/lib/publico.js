// Regras da pagina publica de agendamento (sem React).
// ATENCAO: por enquanto os servicos, barbeiros e horarios abaixo sao DADOS DE EXEMPLO.
// Nada e lido nem gravado no Supabase; a ligacao com o banco e uma etapa a parte
// (precisa de politicas RLS para acesso anonimo e revisao de seguranca).
import { ABRE, FECHA, horaDeMinutos, somarDias } from './agenda.js'
import { hojeISO } from './formato.js'

export const SERVICOS_EXEMPLO = [
  { id: 'corte', nome: 'Corte', descricao: 'Máquina, tesoura ou degradê', duracao_min: 40, preco: 45 },
  { id: 'barba', nome: 'Barba na toalha quente', descricao: 'Navalha e hidratação', duracao_min: 30, preco: 35 },
  { id: 'combo', nome: 'Corte + barba', descricao: 'Economiza R$ 10', duracao_min: 70, preco: 70, destaque: 'Mais pedido' },
  { id: 'sobrancelha', nome: 'Sobrancelha', descricao: 'Na navalha', duracao_min: 15, preco: 15 },
  { id: 'pezinho', nome: 'Pezinho e acabamento', descricao: 'Para manter entre cortes', duracao_min: 15, preco: 15 },
]

export const QUALQUER = 'qualquer'
export const PROFISSIONAIS_EXEMPLO = [
  { id: QUALQUER, nome: 'Quem estiver livre', apoio: 'Horário mais cedo', inicial: '★' },
  { id: 'rafa', nome: 'Rafa', apoio: 'Degradê e navalhado', inicial: 'R' },
  { id: 'diego', nome: 'Diego', apoio: 'Barba e cortes clássicos', inicial: 'D' },
  { id: 'thiago', nome: 'Thiago', apoio: 'Social e infantil', inicial: 'T' },
]

const PASSO = 30
const ANTECEDENCIA_MIN = 30 // nao oferece horario que comeca dentro dos proximos 30 min

// Todos os horarios de um dia ("09:00", "09:30", ... "19:30"), no mesmo expediente da Agenda
export const TODOS_HORARIOS = (() => {
  const lista = []
  for (let m = ABRE; m + PASSO <= FECHA; m += PASSO) lista.push(horaDeMinutos(m))
  return lista
})()

const minutosDe = (hora) => { const [h, m] = hora.split(':').map(Number); return h * 60 + m }

// Numero 0..99 estavel para (dia, barbeiro, horario): simula uma agenda ja ocupada
function sorteio(dia, profissionalId, hora) {
  const texto = `${dia}|${profissionalId}|${hora}`
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) % 100
}
const ocupado = (dia, profissionalId, hora) => sorteio(dia, profissionalId, hora) < 38

const reais = PROFISSIONAIS_EXEMPLO.filter((p) => p.id !== QUALQUER)

// Quem atende nesse horario (para "qualquer um", o primeiro barbeiro livre). null = ninguem.
export function profissionalDoHorario(dia, profissionalId, hora) {
  const candidatos = profissionalId === QUALQUER ? reais.map((p) => p.id) : [profissionalId]
  return candidatos.find((id) => !ocupado(dia, id, hora)) ?? null
}

function jaPassou(dia, hora, agora) {
  if (dia !== hojeISO(agora)) return dia < hojeISO(agora)
  return minutosDe(hora) < agora.getHours() * 60 + agora.getMinutes() + ANTECEDENCIA_MIN
}

export function horariosDoDia(dia, profissionalId, agora = new Date()) {
  return TODOS_HORARIOS.map((hora) => ({
    hora,
    livre: !jaPassou(dia, hora, agora) && profissionalDoHorario(dia, profissionalId, hora) !== null,
  }))
}

// Proximos dias de atendimento (a barbearia fecha aos domingos)
export function diasDeAtendimento(agora = new Date(), quantidade = 7) {
  const dias = []
  let dia = hojeISO(agora)
  while (dias.length < quantidade) {
    const [a, m, d] = dia.split('-').map(Number)
    if (new Date(a, m - 1, d).getDay() !== 0) dias.push(dia)
    dia = somarDias(dia, 1)
  }
  return dias
}

export function proximoHorarioLivre(agora = new Date()) {
  for (const dia of diasDeAtendimento(agora)) {
    const livre = horariosDoDia(dia, QUALQUER, agora).find((h) => h.livre)
    if (livre) return { dia, hora: livre.hora, profissionalId: profissionalDoHorario(dia, QUALQUER, livre.hora) }
  }
  return null
}

// "Hoje" ou dia da semana abreviado ("qua"); o numero do dia vem de diaDoMes
export function rotuloCurto(dia, agora = new Date()) {
  if (dia === hojeISO(agora)) return 'Hoje'
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
}
export const diaDoMes = (dia) => Number(dia.slice(8, 10))

// "terça-feira, 17 de novembro"
export function rotuloLongo(dia) {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Extrai so os digitos do WhatsApp: DDD (2) + numero (9) = 11 no maximo.
// Se vier com +55 (colado ou preenchido pelo navegador), o 55 do pais e descartado.
// "55" digitado logo no inicio continua sendo o DDD do RS: so cai quando passa de 11 digitos.
export function digitosTelefone(valor = '') {
  let d = String(valor).replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  return d.slice(0, 11)
}

// Mascara enquanto digita: (21) 99999-0000
export function formatarTelefone(valor = '') {
  const d = digitosTelefone(valor)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// Confere nome e WhatsApp: DDD de 2 digitos (11 a 99, sem zero) + celular de 9 digitos comecando por 9.
// Devolve o primeiro problema, para o foco ir ao campo certo.
export function validarContato({ nome = '', telefone = '' }) {
  if (nome.trim().length < 2) return { ok: false, campo: 'nome', mensagem: 'Informe seu nome.' }
  const d = digitosTelefone(telefone)
  if (!/^[1-9][1-9]9\d{8}$/.test(d)) {
    return { ok: false, campo: 'telefone', mensagem: 'Informe o WhatsApp com DDD e 9 dígitos, por exemplo (21) 99999-0000.' }
  }
  return { ok: true }
}

// Link do Google Agenda ja preenchido (abre o app Google Agenda no celular, ou o site): o cliente so confirma.
// Horario no fuso da barbearia (ctz), sem converter nada no aparelho do cliente.
export function linkGoogleAgenda({ dia, hora, duracao_min, titulo, local, detalhes = '', fuso = 'America/Sao_Paulo' }) {
  const inicio = minutosDe(hora)
  const fim = inicio + duracao_min
  const carimbo = (min) => `${dia.replaceAll('-', '')}T${String(Math.floor(min / 60) % 24).padStart(2, '0')}${String(min % 60).padStart(2, '0')}00`
  const q = new URLSearchParams({ action: 'TEMPLATE', text: titulo, dates: `${carimbo(inicio)}/${carimbo(fim)}`, ctz: fuso, location: local })
  if (detalhes) q.set('details', detalhes)
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}
