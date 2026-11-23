import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Icone from './Icone.jsx'
import { Avatar } from './ui.jsx'
import { useVoltarFecha } from '../hooks/useVoltarFecha.js'
import { useLinkAgendamento } from '../hooks/useLinkAgendamento.js'
import { GRUPOS_GAVETA, itemDoMenu } from '../lib/menu.js'

const FECHA_APOS_PX = 80 // arrastar a gaveta para a esquerda mais que isso fecha

/*
 * Menu lateral do celular (substitui a janela "Mais"). E um <dialog> nativo: foco preso, Esc fecha e o fundo
 * fica inerte. Abre so pelo botao Menu da barra inferior (deslizar da borda da tela conflita com o gesto de
 * "voltar" do Android e do iPhone). Fecha pelo X, tocando fora, deslizando para a esquerda, ao escolher uma tela
 * ou com o "voltar" do aparelho.
 */
export default function Gaveta({ rota, nome, ativa, badges = {}, onFechar }) {
  const ref = useRef(null)
  const arrasto = useRef(null)
  const [copiado, setCopiado] = useState(false)
  // Grupo recolhivel comeca fechado, a menos que a tela atual esteja dentro dele
  const [abertos, setAbertos] = useState(() => new Set(GRUPOS_GAVETA.filter((g) => g.itens.includes(rota)).map((g) => g.id)))
  const link = useLinkAgendamento(ativa.id, true)
  useVoltarFecha(onFechar)

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  useEffect(() => {
    if (!copiado) return undefined
    const t = setTimeout(() => setCopiado(false), 2000)
    return () => clearTimeout(t)
  }, [copiado])

  const alternar = (id) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  async function copiar() {
    try { await navigator.clipboard.writeText(link); setCopiado(true) } catch { /* sem permissao: o botao ao lado abre o link */ }
  }

  const inicioArrasto = (e) => {
    if (e.touches.length !== 1) return
    arrasto.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, horizontal: null }
  }
  const moverArrasto = (e) => {
    const a = arrasto.current
    if (!a) return
    const dx = e.touches[0].clientX - a.x
    const dy = e.touches[0].clientY - a.y
    if (a.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) a.horizontal = Math.abs(dx) > Math.abs(dy)
    if (!a.horizontal) return // rolagem vertical da lista: nao mexe na gaveta
    a.dx = Math.min(0, dx)
    ref.current.style.transition = 'none'
    ref.current.style.transform = `translateX(${a.dx}px)`
  }
  const fimArrasto = () => {
    const a = arrasto.current
    arrasto.current = null
    const d = ref.current
    if (!a || !d || !a.horizontal) return
    d.style.transition = 'transform .18s ease-out'
    if (a.dx < -FECHA_APOS_PX) {
      d.style.transform = 'translateX(-100%)'
      setTimeout(onFechar, 160)
    } else {
      d.style.transform = ''
    }
  }

  return (
    <dialog
      ref={ref}
      className="gaveta"
      aria-label="Menu"
      onClose={onFechar}
      onClick={(e) => { if (e.target === ref.current) onFechar() }}
      onTouchStart={inicioArrasto} onTouchMove={moverArrasto} onTouchEnd={fimArrasto} onTouchCancel={fimArrasto}
    >
      <div className="gv-painel">
        <div className="gv-topo">
          <div className="gv-marca">
            <span className="pole logo-pole" aria-hidden="true" />
            <span className="brandname">Barbeiro<br />Inteligente</span>
          </div>
          <button type="button" className="icon-btn gv-x" onClick={onFechar} aria-label="Fechar menu"><Icone nome="x" /></button>
        </div>

        {link && (
          <div className="gv-link">
            <div className="gv-link-txt">
              <b>Seu link de agendamento</b>
              <small>{link.replace(/^https?:\/\//, '')}</small>
            </div>
            <button type="button" className="gv-mini" onClick={copiar} aria-label="Copiar link de agendamento">
              {copiado ? <Icone nome="check" tam={18} /> : <Icone nome="copy" tam={18} />}
            </button>
            <a className="gv-mini" href={link} target="_blank" rel="noopener noreferrer" aria-label="Abrir página de agendamento"><Icone nome="open" tam={18} /></a>
            <span className="gv-aviso" role="status" aria-live="polite">{copiado ? 'Link copiado.' : ''}</span>
          </div>
        )}

        <nav className="gv-nav" aria-label="Todas as telas">
          {GRUPOS_GAVETA.map((g) => {
            const aberto = !g.recolhivel || abertos.has(g.id)
            return (
              <section key={g.id} className="gv-grupo">
                {g.recolhivel ? (
                  <button type="button" className="gv-cab" aria-expanded={aberto} aria-controls={`gv-${g.id}`} onClick={() => alternar(g.id)}>
                    <span>{g.rotulo}</span><Icone nome="next" tam={16} />
                  </button>
                ) : <h3 className="gv-rot">{g.rotulo}</h3>}
                {aberto && (
                  <ul id={`gv-${g.id}`} className="gv-lista">
                    {g.itens.map(itemDoMenu).map((m) => (
                      <li key={m.rota}>
                        <a href={`#/${m.rota}`} className="gv-item" aria-current={rota === m.rota ? 'page' : undefined} onClick={onFechar}>
                          <Icone nome={m.ic} /><span>{m.rotulo}</span>
                          {badges[m.rota] > 0 && <i className={`nb${m.rota === 'produtos' ? ' warn' : ''}`}>{badges[m.rota]}</i>}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </nav>

        <div className="gv-pe">
          <div className="gv-loja">
            <Avatar nome={nome} grande />
            <div><b>{nome}</b><small>Proprietário · {ativa.nome}</small></div>
          </div>
          <button type="button" className="gv-sair" onClick={() => supabase.auth.signOut()}><Icone nome="out" /><span>Sair</span></button>
        </div>
      </div>
    </dialog>
  )
}
