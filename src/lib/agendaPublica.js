// Regras da pagina publica de agendamento REAL (sem React).
// Recebe a configuracao da barbearia e os intervalos ocupados (publico_barbearia / publico_ocupacao)
// e calcula quais horarios estao livres. A palavra final e do banco: ele recusa o que estiver
// ocupado ou fora das regras mesmo que esta tela erre (ver supabase/agendamento_publico.sql).
import { horaDeMinutos, somarDias } from './agenda.js'

export const QUALQUER = 'qualquer'
export const FUSO_PADRAO = 'America/Sao_Paulo'

const dois = (n) => String(n).padStart(2, '0')
export const minutosDeHora = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

// "2026-11-17" da barbearia (no fuso dela), independente do fuso do aparelho do cliente
export function hojeNoFuso(agora = new Date(), fuso = FUSO_PADRAO) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(agora).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

// 0 = domingo ... 6 = sabado (calculo so com a data, sem fuso)
export function diaDaSemana(dia) {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

// Quantos minutos o fuso esta a leste do UTC naquele instante (Brasil: -180)
function deslocamentoMin(data, fuso) {
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: fuso, timeZoneName: 'longOffset' })
    .formatToParts(data).find((x) => x.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(nome)
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0
}

// ("2026-11-20", "10:00", fuso) -> instante em milissegundos (10:00 NO FUSO DA BARBEARIA)
export function instanteNoFuso(dia, hora, fuso = FUSO_PADRAO) {
  const [a, m, d] = dia.split('-').map(Number)
  const [h, mi] = hora.split(':').map(Number)
  const chute = Date.UTC(a, m - 1, d, h, mi)
  return chute - deslocamentoMin(new Date(chute), fuso) * 60000
}

// Proximos dias em que a barbearia abre, dentro da janela de agendamento
export function diasAbertos(config, agora = new Date(), quantidade = 7) {
  const hoje = hojeNoFuso(agora, config.fuso)
  const limite = somarDias(hoje, config.janela_dias)
  const dias = []
  for (let dia = hoje; dia <= limite && dias.length < quantidade; dia = somarDias(dia, 1)) {
    if (config.dias_atendimento.includes(diaDaSemana(dia))) dias.push(dia)
  }
  return dias
}

// Horarios de um dia para um servico: [{ hora, livre, profissionalId }]
//  - o servico tem de terminar ate o fechamento;
//  - respeita a antecedencia minima e a janela;
//  - "qualquer" fica livre se algum barbeiro estiver livre (o primeiro da lista, como no banco).
export function horariosReais({ config, servico, profissionais, profissionalId, dia, ocupacao = [], agora = new Date() }) {
  const fuso = config.fuso ?? FUSO_PADRAO
  const passo = config.passo_min
  const abre = minutosDeHora(config.abertura)
  const fecha = minutosDeHora(config.fechamento)
  const duracao = servico.duracao_min
  const cedo = agora.getTime() + config.antecedencia_min * 60000
  const tarde = agora.getTime() + config.janela_dias * 86400000
  const abertoNoDia = config.dias_atendimento.includes(diaDaSemana(dia))
  const donos = profissionalId === QUALQUER ? profissionais.map((p) => p.id) : [profissionalId]
  const ocupados = ocupacao.map((o) => ({ p: o.profissional_id, ini: Date.parse(o.inicio), fim: Date.parse(o.fim) }))

  const lista = []
  for (let m = Math.ceil(abre / passo) * passo; m + duracao <= fecha; m += passo) {
    const hora = horaDeMinutos(m)
    const ini = instanteNoFuso(dia, hora, fuso)
    const fim = ini + duracao * 60000
    const livreCom = donos.find((id) => !ocupados.some((o) => o.p === id && o.ini < fim && o.fim > ini)) ?? null
    lista.push({ hora, livre: abertoNoDia && ini >= cedo && ini <= tarde && livreCom !== null, profissionalId: livreCom })
  }
  return lista
}

// "9h", "9h30"
const horaCurta = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return m ? `${h}h${dois(m)}` : `${h}h` }

// "Segunda a sabado, das 9h as 20h"
export function descricaoExpediente(config) {
  const nomes = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
  const ordem = [1, 2, 3, 4, 5, 6, 0] // semana comeca na segunda
  const abertos = ordem.filter((d) => config.dias_atendimento.includes(d))
  const faixas = []
  for (const d of abertos) {
    const ultima = faixas.at(-1)
    if (ultima && ordem.indexOf(ultima.at(-1)) + 1 === ordem.indexOf(d)) ultima.push(d)
    else faixas.push([d])
  }
  // faixas de 3+ dias seguidos viram "segunda a quarta"; os demais dias sao listados soltos
  const itens = faixas.flatMap((f) => (f.length >= 3 ? [`${nomes[f[0]]} a ${nomes[f.at(-1)]}`] : f.map((d) => nomes[d])))
  const texto = itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : (itens[0] ?? '')
  const dias = texto.charAt(0).toUpperCase() + texto.slice(1)
  return `${dias}, das ${horaCurta(config.abertura)} às ${horaCurta(config.fechamento)}`
}

// Rotulo do erro mais comum para o cliente: o horario sumiu entre a escolha e a confirmacao
export const ERROS_QUE_PEDEM_OUTRO_HORARIO = ['horario_ocupado', 'fora_do_expediente', 'antecedencia', 'horario_invalido', 'fora_da_janela', 'servico_invalido', 'profissional_invalido']

// Dia e hora ("2026-11-20", "10:30") de um instante ISO, no fuso da barbearia
export function partesNoFuso(iso, fuso = FUSO_PADRAO) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
}

// Rotas publicas (sem login): #/agendar (previa), #/agendar/<slug>, #/cancelar/<slug>/<id>
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function lerRotaPublica(rota = '') {
  const [raiz, slug, id] = rota.split('?')[0].split('/')
  if (raiz === 'agendar') return slug === undefined || slug === '' ? { tipo: 'agendar', slug: null } : SLUG.test(slug) ? { tipo: 'agendar', slug } : { tipo: 'agendar', slug: '' }
  if (raiz === 'cancelar' && SLUG.test(slug ?? '') && UUID.test(id ?? '')) return { tipo: 'cancelar', slug, id }
  return null
}
