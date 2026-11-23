import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { gravarCache, lerCache } from '../lib/cache.js'
import { linkPublico } from '../lib/agendamentoOnline.js'

// Link publico de agendamento para o atalho da gaveta. Mostra o ultimo valor na hora (cache) e confere no banco
// ao abrir, porque o endereco pode ter sido trocado na tela "Agendamento online". Vazio = nao esta no ar.
export function useLinkAgendamento(barbeariaId, ativo) {
  const chave = `ln|${barbeariaId}`
  const [dados, setDados] = useState(() => lerCache(chave) ?? null)

  useEffect(() => {
    if (!ativo) return undefined
    let cancelado = false
    supabase.from('barbearias').select('slug, agendamento_online').eq('id', barbeariaId).maybeSingle()
      .then(({ data }) => {
        if (cancelado || !data) return
        setDados(data)
        gravarCache(chave, data)
      })
    return () => { cancelado = true }
  }, [barbeariaId, ativo, chave])

  return dados?.agendamento_online && dados?.slug ? linkPublico(dados.slug, window.location.origin) : ''
}
