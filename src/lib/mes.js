import { supabase } from './supabase.js'
import { somarMeses } from './formato.js'

// Atendimentos CONCLUIDOS do mes (ISO "AAAA-MM-01"), usados nos cartoes de servicos e profissionais
export async function concluidosDoMes(barbeariaId, mes) {
  const de = new Date(`${mes}T00:00:00`).toISOString()
  const ate = new Date(`${somarMeses(mes, 1)}T00:00:00`).toISOString()
  const { data } = await supabase.from('agendamentos').select('servico_id, profissional_id, valor')
    .eq('barbearia_id', barbeariaId).eq('status', 'concluido').gte('inicio', de).lt('inicio', ate)
  return data ?? []
}
