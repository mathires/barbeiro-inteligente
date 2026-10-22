import Icone from './Icone.jsx'
import { hojeISO, inicioDoMes, somarMeses, nomeDoMesISO } from '../lib/formato.js'

// Pecas visuais pequenas reaproveitadas em todas as telas (classes do protótipo)

export const iniciais = (nome = '') =>
  nome.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?'

export function Cabecalho({ titulo, sub, acoes }) {
  return (
    <header className="mh">
      <div>
        <h1>{titulo}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {acoes && <div className="mh-actions">{acoes}</div>}
    </header>
  )
}

export function BotaoNovo({ rotulo, onClick }) {
  return (
    <button className="btn primary" onClick={onClick}>
      <Icone nome="plus" tam={18} /><span>{rotulo}</span>
    </button>
  )
}

export const Pill = ({ tipo = 'ok', children }) => <span className={`pill ${tipo}`}>{children}</span>

export const Avatar = ({ nome, grande }) => <span className={`av${grande ? ' lg' : ''}`}>{iniciais(nome)}</span>

export function Dica({ titulo, tipo, children }) {
  return (
    <div className={`tip${tipo === 'warn' ? ' warn' : ''}`}>
      <div className="tip-h"><Icone nome="spark" tam={16} />{titulo}</div>
      {children}
    </div>
  )
}

export function Kpi({ rotulo, valor, nota, tipo }) {
  return (
    <div className={`kpi${tipo ? ` ${tipo}` : ''}`}>
      <span>{rotulo}</span>
      <b>{valor}</b>
      {nota && <small>{nota}</small>}
    </div>
  )
}

export function Aviso({ erro, info }) {
  return (
    <>
      {erro && <p role="alert" className="frm-err">{erro}</p>}
      {info && <p role="status" className="tip">{info}</p>}
    </>
  )
}

export function NavegadorMes({ mes, onChange }) {
  return (
    <div className="mnav" role="group" aria-label="Mês">
      <button className="icon-btn" onClick={() => onChange(somarMeses(mes, -1))} aria-label="Mês anterior"><Icone nome="prev" /></button>
      <strong>{nomeDoMesISO(mes)}</strong>
      <button className="icon-btn" onClick={() => onChange(somarMeses(mes, 1))} aria-label="Próximo mês"><Icone nome="next" /></button>
      <button className="btn ghost sm" onClick={() => onChange(inicioDoMes(hojeISO()))}>Este mês</button>
    </div>
  )
}

export function Chips({ rotulo, opcoes, valor, onChange }) {
  return (
    <div className="chips" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} className="chip" aria-pressed={valor === o.valor} onClick={() => onChange(o.valor)}>{o.rotulo}</button>
      ))}
    </div>
  )
}

export function Busca({ valor, onChange, rotulo = 'Buscar' }) {
  return (
    <div className="search">
      <Icone nome="search" tam={18} />
      <input className="inp" type="search" placeholder={rotulo} aria-label={rotulo} value={valor} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
