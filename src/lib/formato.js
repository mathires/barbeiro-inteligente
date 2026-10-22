const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const moeda = (v) => brl.format(Number(v) || 0)

// "2026-10-01" do mes atual (data local, sem problemas de fuso)
export function primeiroDiaDoMes(d = new Date()) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-01`
}

export function nomeDoMes(d = new Date()) {
  const s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Nome amigavel a partir do e-mail: "joao.silva@x.com" -> "Joao Silva"
export function nomeDoEmail(email = '') {
  return email
    .split('@')[0]
    .split(/[._\s-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

// "2026-10-21" -> "21/10/2026" (sem passar por Date, para nao ter erro de fuso)
export function dataBR(iso) {
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

const dois = (n) => String(n).padStart(2, '0')

// "2026-10-21" de hoje (data local)
export function hojeISO(d = new Date()) {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

// "2026-10-21" -> "2026-10-01"
export const inicioDoMes = (iso) => `${iso.slice(0, 7)}-01`

// Soma meses a uma data ISO, ajustando o dia (31/01 + 1 mes = 28/02 ou 29/02)
export function somarMeses(iso, n) {
  const [a, m, d] = iso.split('-').map(Number)
  const total = a * 12 + (m - 1) + n
  const ano = Math.floor(total / 12)
  const mes = (total % 12) + 1
  const ultimo = new Date(ano, mes, 0).getDate()
  return `${ano}-${dois(mes)}-${dois(Math.min(d, ultimo))}`
}

// "2026-10-01" -> "Outubro de 2026"
export function nomeDoMesISO(iso) {
  const [a, m] = iso.split('-').map(Number)
  const s = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// "2026-10-21" -> "Hoje · 21/10", "Ontem · 20/10" ou "Seg · 19/10"
export function rotuloDoDia(iso, hoje = hojeISO()) {
  const [a, m, d] = iso.split('-').map(Number)
  const dt = new Date(a, m - 1, d)
  const [ha, hm, hd] = hoje.split('-').map(Number)
  const dif = Math.round((new Date(ha, hm - 1, hd) - dt) / 864e5)
  const base = `${dois(d)}/${dois(m)}`
  if (dif === 0) return `Hoje · ${base}`
  if (dif === 1) return `Ontem · ${base}`
  return `${DIAS_CURTOS[dt.getDay()]} · ${base}`
}

// dias entre hoje e a data (negativo = passou)
export function diasAte(iso, hoje = hojeISO()) {
  const [a, m, d] = iso.split('-').map(Number)
  const [ha, hm, hd] = hoje.split('-').map(Number)
  return Math.round((new Date(a, m - 1, d) - new Date(ha, hm - 1, hd)) / 864e5)
}

export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
