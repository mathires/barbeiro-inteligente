import { useEffect, useId, useRef } from 'react'
import Icone from './Icone.jsx'

// Janela nativa (<dialog>): foco preso, Esc fecha. No celular sobe de baixo; no desktop fica no centro.
export default function Modal({ titulo, onFechar, children }) {
  const ref = useRef(null)
  const idTitulo = useId()

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={idTitulo}
      onClose={onFechar}
      onClick={(e) => { if (e.target === ref.current) onFechar() }}
    >
      <div className="sheet-h">
        <h2 id={idTitulo}>{titulo}</h2>
        <button type="button" className="icon-btn" onClick={onFechar} aria-label="Fechar"><Icone nome="x" /></button>
      </div>
      {children}
    </dialog>
  )
}
