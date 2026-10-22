import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { hojeISO } from '../lib/formato.js'
import { limitesDoDia } from '../lib/agenda.js'

// Contadores do menu: atendimentos de hoje ainda por fazer e produtos abaixo do minimo
export function useBadges(barbeariaId, rota) {
  const [b, setB] = useState({ agenda: 0, produtos: 0 })
  useEffect(() => {
    let cancelado = false
    const [ini, fim] = limitesDoDia(hojeISO())
    Promise.all([
      supabase.from('agendamentos').select('id').eq('barbearia_id', barbeariaId)
        .gte('inicio', ini).lt('inicio', fim).in('status', ['aguardando', 'confirmado', 'em_atendimento']),
      supabase.from('vw_produtos_estoque').select('id').eq('barbearia_id', barbeariaId).eq('repor', true),
    ]).then(([a, p]) => {
      if (!cancelado) setB({ agenda: a.data?.length ?? 0, produtos: p.data?.length ?? 0 })
    })
    return () => { cancelado = true }
  }, [barbeariaId, rota])
  return b
}
