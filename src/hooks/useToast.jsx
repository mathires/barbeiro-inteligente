import { useCallback, useEffect, useRef, useState } from 'react'

// Aviso curto que some sozinho (o "toast" do protótipo). Uso: const [toast, avisar] = useToast()
export function useToast() {
  const [texto, setTexto] = useState('')
  const timer = useRef(null)
  const avisar = useCallback((msg) => {
    setTexto(msg)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setTexto(''), 3200)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const toast = texto ? <div className="toast" role="status" aria-live="polite">{texto}</div> : null
  return [toast, avisar]
}
