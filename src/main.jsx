import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErroGeral from './components/ErroGeral.jsx'
import '@fontsource-variable/manrope'
import './styles.css'
import { aplicarTemaSalvo } from './hooks/useTema.js'
import { esconderSplash } from './lib/splash.js'

aplicarTemaSalvo()
// Rede de seguranca: se nada resolver em 10 s, a splash sai e o app mostra o que tiver
setTimeout(esconderSplash, 10000)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErroGeral>
      <App />
    </ErroGeral>
  </StrictMode>,
)

// Torna o app instalavel no celular (somente na versao publicada, nao no npm run dev)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sem service worker o app funciona igual */ })
  })
}
