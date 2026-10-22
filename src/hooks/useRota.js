import { useEffect, useState } from 'react'

const lerRota = (padrao) => window.location.hash.replace(/^#\/?/, '') || padrao

// Rota simples baseada no hash da URL: "#/clientes" -> "clientes"
export function useRota(padrao = 'inicio') {
  const [rota, setRota] = useState(() => lerRota(padrao))
  useEffect(() => {
    const aoMudar = () => setRota(lerRota(padrao))
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [padrao])
  return rota
}
