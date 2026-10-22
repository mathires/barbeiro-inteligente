import { diasAte } from './formato.js'

// Visitas e ultima visita de cada cliente, a partir dos atendimentos CONCLUIDOS
export function resumoDeVisitas(atendimentos) {
  const mapa = new Map()
  for (const a of atendimentos) {
    if (!a.cliente_id) continue
    const dia = a.inicio.slice(0, 10) // so para ordenar; o texto abaixo usa a data local
    const x = mapa.get(a.cliente_id) ?? { visitas: 0, ultima: null }
    x.visitas += 1
    if (!x.ultima || a.inicio > x.ultima) x.ultima = a.inicio
    mapa.set(a.cliente_id, { ...x, dia })
  }
  return mapa
}

export const DIAS_PARA_SUMIR = 45
export const VISITAS_PARA_FIEL = 20

// "novo", "fiel", "sumido" ou null (regras do protótipo)
export function classificar(visitas, diasDesdeUltima) {
  if (visitas > 0 && diasDesdeUltima > DIAS_PARA_SUMIR) return 'sumido'
  if (visitas >= VISITAS_PARA_FIEL) return 'fiel'
  if (visitas <= 3) return 'novo'
  return null
}

export const textoUltima = (n) => (n === 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`)

// Dias desde a ultima visita (instante ISO -> data local)
export function diasDesde(iso, hoje) {
  const d = new Date(iso)
  const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return Math.max(0, -diasAte(dia, hoje))
}

// Link do WhatsApp (so digitos; assume Brasil quando faltar o DDI)
export function linkWhatsApp(telefone) {
  const d = String(telefone ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  return `https://wa.me/${d.startsWith('55') && d.length >= 12 ? d : `55${d}`}`
}
