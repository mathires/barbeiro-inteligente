import { useEffect, useRef } from 'react'

// Widget "Sou humano" do Cloudflare Turnstile. Carrega o script da Cloudflare so quando e usado.
// onToken(token) quando aprova; onToken(null) quando o token expira ou da erro (cada token vale uma vez).
// Aumentar "reinicio" pede um token novo (usado depois de cada tentativa de agendar).
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let promessa = null

function carregarScript() {
  if (typeof window !== 'undefined' && window.turnstile) return Promise.resolve(window.turnstile)
  promessa ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    s.onerror = () => { promessa = null; reject(new Error('turnstile')) }
    document.head.appendChild(s)
  })
  return promessa
}

export default function Turnstile({ siteKey, onToken, onFalha, reinicio = 0 }) {
  const caixa = useRef(null)
  const widget = useRef(null)
  const ouvintes = useRef({ onToken, onFalha })
  ouvintes.current = { onToken, onFalha }

  useEffect(() => {
    let vivo = true
    carregarScript().then((t) => {
      if (!vivo || !caixa.current) return
      widget.current = t.render(caixa.current, {
        sitekey: siteKey,
        language: 'pt-br',
        callback: (token) => ouvintes.current.onToken(token),
        'expired-callback': () => ouvintes.current.onToken(null),
        'error-callback': () => { ouvintes.current.onToken(null); ouvintes.current.onFalha?.() },
      })
    }).catch(() => { if (vivo) ouvintes.current.onFalha?.() })
    return () => {
      vivo = false
      if (widget.current != null && window.turnstile) window.turnstile.remove(widget.current)
      widget.current = null
    }
  }, [siteKey])

  useEffect(() => {
    if (reinicio > 0 && widget.current != null) window.turnstile?.reset(widget.current)
  }, [reinicio])

  return <div ref={caixa} className="pub-turnstile" />
}
