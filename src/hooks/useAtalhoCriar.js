import { useEffect, useRef } from 'react'
import { consumirCriar, EVENTO_CRIAR } from '../lib/atalhoCriar.js'

// A tela chama isto com o tipo que ela cria; quando o "+ Criar" pedir esse tipo, roda aoCriar (abrir o formulario).
export function useAtalhoCriar(tipo, aoCriar) {
  const ref = useRef(aoCriar)
  useEffect(() => { ref.current = aoCriar })

  useEffect(() => {
    if (consumirCriar(tipo)) ref.current() // pedido feito antes de a tela existir (veio de outra tela)
    const ouvir = (e) => { if (e.detail === tipo && consumirCriar(tipo)) ref.current() }
    window.addEventListener(EVENTO_CRIAR, ouvir)
    return () => window.removeEventListener(EVENTO_CRIAR, ouvir)
  }, [tipo])
}
