import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { hojeISO } from '../lib/formato.js'
import { limitesDoDia } from '../lib/agenda.js'

const ATUALIZA_APOS = ['agenda', 'produtos'] // as unicas telas que mudam os contadores
const INTERVALO_MS = 30000

// Contadores do menu: atendimentos de hoje ainda por fazer e produtos abaixo do minimo.
// So consulta de novo ao sair da Agenda/Produtos (onde as mudancas acontecem) ou depois de 30 s,
// em vez de duas consultas a cada clique no menu.
export function useBadges(barbeariaId, rota) {
  const [b, setB] = useState({ agenda: 0, produtos: 0 })
  const ultima = useRef({ id: null, rota, quando: 0 })

  useEffect(() => {
    const u = ultima.current
    const trocouBarbearia = u.id !== barbeariaId
    const saiuDeTelaQueMuda = u.rota !== rota && ATUALIZA_APOS.includes(u.rota)
    const velho = Date.now() - u.quando > INTERVALO_MS
    ultima.current = { id: barbeariaId, rota, quando: u.quando }
    if (!trocouBarbearia && !saiuDeTelaQueMuda && !velho) return undefined

    let cancelado = false
    const [ini, fim] = limitesDoDia(hojeISO())
    Promise.all([
      supabase.from('agendamentos').select('id').eq('barbearia_id', barbeariaId)
        .gte('inicio', ini).lt('inicio', fim).in('status', ['aguardando', 'confirmado', 'em_atendimento']),
      supabase.from('vw_produtos_estoque').select('id').eq('barbearia_id', barbeariaId).eq('repor', true),
    ]).then(([a, p]) => {
      if (cancelado) return
      ultima.current.quando = Date.now()
      setB({ agenda: a.data?.length ?? 0, produtos: p.data?.length ?? 0 })
    })
    return () => { cancelado = true }
  }, [barbeariaId, rota])
  return b
}
