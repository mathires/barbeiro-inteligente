import { useEffect, useRef, useState } from 'react'
import Icone from './Icone.jsx'
import { ATALHOS_CRIAR, pedirCriar } from '../lib/atalhoCriar.js'

/*
 * Botao "+ Criar" no centro da barra inferior: abre um menu curto com os registros mais frequentes
 * (agendamento, receita, despesa, cliente). Cada item leva a tela certa e ja abre o formulario novo.
 * Fecha tocando fora, com Esc ou ao escolher. Nao usa o historico do navegador (sem entrada extra do "voltar").
 */
export default function BotaoCriar() {
  const [aberto, setAberto] = useState(false)
  const primeiro = useRef(null)

  useEffect(() => {
    if (!aberto) return undefined
    primeiro.current?.focus()
    const aoTeclar = (e) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto])

  const escolher = (tipo) => {
    setAberto(false)
    pedirCriar(tipo)
  }

  return (
    <div className="bn-criar-caixa">
      {aberto && <button type="button" className="criar-fundo" tabIndex={-1} aria-label="Fechar atalhos" onClick={() => setAberto(false)} />}
      {aberto && (
        <ul className="criar-menu" role="menu" aria-label="Criar">
          {ATALHOS_CRIAR.map((a, i) => (
            <li key={a.tipo} role="none">
              <button ref={i === 0 ? primeiro : undefined} type="button" role="menuitem" className="criar-item" onClick={() => escolher(a.tipo)}>
                <Icone nome={a.ic} /><span>{a.rotulo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="bn bn-criar" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        <span className="bn-criar-bola"><Icone nome="plus" tam={26} /></span>
        <span>Criar</span>
      </button>
    </div>
  )
}
