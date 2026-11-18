import { useEffect, useId, useRef } from 'react'
import Icone from './Icone.jsx'
import { useVoltarFecha } from '../hooks/useVoltarFecha.js'

const FECHA_APOS_PX = 90 // arrastar o topo da janela para baixo mais que isso fecha
const ehCelular = () => typeof matchMedia === 'function' && matchMedia('(max-width: 719px)').matches

// Janela nativa (<dialog>): foco preso, Esc fecha. No celular sobe de baixo; no desktop fica no centro.
// No celular tambem fecha com o "voltar" do aparelho e arrastando o topo para baixo.
export default function Modal({ titulo, onFechar, children }) {
  const ref = useRef(null)
  const arrasto = useRef(null)
  const idTitulo = useId()
  useVoltarFecha(onFechar)

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  const inicioArrasto = (e) => {
    if (!ehCelular() || e.touches.length !== 1) return
    arrasto.current = { y: e.touches[0].clientY, dy: 0 }
    ref.current.style.transition = 'none'
  }
  const moverArrasto = (e) => {
    const a = arrasto.current
    if (!a) return
    a.dy = Math.max(0, e.touches[0].clientY - a.y)
    ref.current.style.transform = a.dy ? `translateY(${a.dy}px)` : ''
  }
  const fimArrasto = () => {
    const a = arrasto.current
    arrasto.current = null
    const d = ref.current
    if (!a || !d) return
    d.style.transition = 'transform .2s ease-out'
    if (a.dy > FECHA_APOS_PX) {
      d.style.transform = 'translateY(100%)'
      setTimeout(onFechar, 180)
    } else {
      d.style.transform = ''
    }
  }

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={idTitulo}
      onClose={onFechar}
      onClick={(e) => { if (e.target === ref.current) onFechar() }}
    >
      <div className="sheet-h" onTouchStart={inicioArrasto} onTouchMove={moverArrasto} onTouchEnd={fimArrasto} onTouchCancel={fimArrasto}>
        <span className="sheet-alca" aria-hidden="true" />
        <h2 id={idTitulo}>{titulo}</h2>
        <button type="button" className="icon-btn" onClick={onFechar} aria-label="Fechar"><Icone nome="x" /></button>
      </div>
      {children}
    </dialog>
  )
}
