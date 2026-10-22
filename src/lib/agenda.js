// Regras da agenda (sem React): datas locais, status e gravacao de atendimentos.
import { mensagemDeErro, lerNumero } from './campos.js'
import { somarMeses } from './formato.js'

export const STATUS = {
  aguardando: 'Aguardando',
  confirmado: 'Confirmado',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  faltou: 'Faltou',
}
// Status que ocupam a agenda (cancelado e faltou liberam o horario)
export const STATUS_OCUPAM = ['aguardando', 'confirmado', 'em_atendimento', 'concluido']

const dois = (n) => String(n).padStart(2, '0')

// ("2026-10-21", "14:30") -> instante ISO (UTC), interpretando como horario local
export const paraISO = (data, hora) => new Date(`${data}T${hora}:00`).toISOString()

// instante ISO -> { data: "2026-10-21", hora: "14:30" } no horario local
export function partesLocais(iso) {
  const d = new Date(iso)
  return { data: `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`, hora: `${dois(d.getHours())}:${dois(d.getMinutes())}` }
}
export const horaLocal = (iso) => partesLocais(iso).hora

// [inicio, fim) do dia local, em ISO
export function limitesDoDia(dia) {
  const [a, m, d] = dia.split('-').map(Number)
  return [new Date(a, m - 1, d).toISOString(), new Date(a, m - 1, d + 1).toISOString()]
}

export function somarDias(dia, n) {
  const [a, m, d] = dia.split('-').map(Number)
  const x = new Date(a, m - 1, d + n)
  return `${x.getFullYear()}-${dois(x.getMonth() + 1)}-${dois(x.getDate())}`
}

export function rotuloDia(dia) {
  const [a, m, d] = dia.split('-').map(Number)
  const s = new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Acoes disponiveis para cada status. "especial" tem tratamento proprio na tela.
export function acoesDoStatus(status) {
  switch (status) {
    case 'aguardando': return [
      { rotulo: 'Confirmar', novo: 'confirmado' }, { rotulo: 'Cancelar', novo: 'cancelado', perigo: true }, { rotulo: 'Faltou', novo: 'faltou', perigo: true }]
    case 'confirmado': return [
      { rotulo: 'Iniciar', novo: 'em_atendimento' }, { rotulo: 'Concluir', especial: 'concluir' },
      { rotulo: 'Cancelar', novo: 'cancelado', perigo: true }, { rotulo: 'Faltou', novo: 'faltou', perigo: true }]
    case 'em_atendimento': return [{ rotulo: 'Concluir', especial: 'concluir' }]
    case 'concluido': return [{ rotulo: 'Reabrir', especial: 'reabrir' }]
    default: return [{ rotulo: 'Reabrir', novo: 'confirmado' }]
  }
}

// Procura outro atendimento do mesmo profissional que se sobreponha ao intervalo
export async function buscarConflito(sb, { barbeariaId, profissionalId, inicio, fim, ignorarId }) {
  const { data, error } = await sb.from('agendamentos').select('id, inicio, fim, cliente_id')
    .eq('barbearia_id', barbeariaId).eq('profissional_id', profissionalId)
    .in('status', STATUS_OCUPAM).lt('inicio', fim).gt('fim', inicio)
  if (error) throw error
  return data.find((a) => a.id !== ignorarId) ?? null
}

// Valida e grava (cria ou atualiza). Devolve null (ok) ou mensagem de erro.
export async function salvarAtendimento(sb, { barbeariaId, form, original }) {
  const duracao = lerNumero(form.duracao_min)
  const valor = lerNumero(form.valor)
  if (!form.profissional_id) return 'Escolha o profissional.'
  if (!form.servico_id) return 'Escolha o serviço.'
  if (!form.data || !form.hora) return 'Informe a data e a hora.'
  if (duracao == null || !Number.isInteger(duracao) || duracao < 5 || duracao > 600) return 'A duração deve ser um número inteiro entre 5 e 600 minutos.'
  if (valor == null || valor < 0) return 'Informe um valor válido (pode ser 0 para cortesia).'

  const inicio = paraISO(form.data, form.hora)
  const fim = new Date(new Date(inicio).getTime() + duracao * 60000).toISOString()
  try {
    const choque = await buscarConflito(sb, { barbeariaId, profissionalId: form.profissional_id, inicio, fim, ignorarId: original?.id })
    if (choque) return `Esse profissional já tem atendimento das ${horaLocal(choque.inicio)} às ${horaLocal(choque.fim)}.`
  } catch (e) { return mensagemDeErro(e) }

  const linha = {
    cliente_id: form.cliente_id || null, profissional_id: form.profissional_id, servico_id: form.servico_id,
    inicio, fim, valor: Math.round(valor * 100) / 100, observacoes: form.observacoes?.trim() || null,
  }
  const { error } = original
    ? await sb.from('agendamentos').update(linha).eq('id', original.id).eq('barbearia_id', barbeariaId)
    : await sb.from('agendamentos').insert({ ...linha, barbearia_id: barbeariaId, status: 'confirmado' })
  return error ? mensagemDeErro(error) : null
}

export async function mudarStatus(sb, { barbeariaId, atendimento, novo }) {
  const { error } = await sb.from('agendamentos').update({ status: novo }).eq('id', atendimento.id).eq('barbearia_id', barbeariaId)
  return error ? mensagemDeErro(error, 'atualizar') : null
}

// Expediente padrao da barbearia (minutos desde 00:00): 09:00 as 20:00
export const ABRE = 540
export const FECHA = 1200

export const minutosDoDia = (iso) => {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}
export const horaDeMinutos = (m) => `${dois(Math.floor(m / 60))}:${dois(m % 60)}`

// Maior intervalo livre (>= 30 min) do profissional entre "de" e o fim do expediente.
// Devolve [inicioMin, fimMin] ou null.
export function janelaLivre(atendimentos, profissionalId, de = ABRE, ate = FECHA, minimo = 30) {
  const ocupados = atendimentos
    .filter((a) => a.profissional_id === profissionalId && STATUS_OCUPAM.includes(a.status))
    .map((a) => [minutosDoDia(a.inicio), minutosDoDia(a.fim)])
    .sort((x, y) => x[0] - y[0])
  let cur = de
  let melhor = null
  for (const [s, e] of ocupados) {
    if (e <= cur) continue
    if (s - cur >= minimo && (!melhor || s - cur > melhor[1] - melhor[0])) melhor = [cur, s]
    cur = Math.max(cur, e)
  }
  if (ate - cur >= minimo && (!melhor || ate - cur > melhor[1] - melhor[0])) melhor = [cur, ate]
  return melhor
}

// Os 7 dias (segunda a domingo) da semana que contem "dia"
export function diasDaSemana(dia) {
  const [a, m, d] = dia.split('-').map(Number)
  const dow = (new Date(a, m - 1, d).getDay() + 6) % 7 // segunda = 0
  const segunda = somarDias(dia, -dow)
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i))
}

export { somarMeses }
