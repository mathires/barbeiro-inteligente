import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Icone from './Icone.jsx'
import Modal from './Modal.jsx'
import { Avatar } from './ui.jsx'
import { alternarTema } from '../hooks/useTema.js'

export const MENU = [
  { rota: 'inicio', rotulo: 'Início', ic: 'home' },
  { rota: 'agenda', rotulo: 'Agenda', ic: 'cal' },
  { rota: 'receitas', rotulo: 'Receitas', ic: 'up' },
  { rota: 'despesas', rotulo: 'Despesas', ic: 'down' },
  { rota: 'clientes', rotulo: 'Clientes', ic: 'users' },
  { rota: 'servicos', rotulo: 'Serviços', ic: 'cut' },
  { rota: 'profissionais', rotulo: 'Profissionais', ic: 'scissors2' },
  { rota: 'produtos', rotulo: 'Produtos', ic: 'box' },
  { rota: 'relatorios', rotulo: 'Relatórios', ic: 'chart' },
]
const PRINCIPAIS = ['inicio', 'agenda', 'receitas', 'despesas']

const sair = () => supabase.auth.signOut()

export function Marca({ classe = '' }) {
  return (
    <>
      <span className="pole logo-pole" aria-hidden="true" />
      <span className={`brandname ${classe}`}>Barbeiro Inteligente</span>
    </>
  )
}

export default function Layout({ rota, nome, barbearias, ativa, onTrocar, badges = {}, children }) {
  const [mais, setMais] = useState(false)
  const maisAtivo = !PRINCIPAIS.includes(rota)
  const itemAtual = MENU.find((m) => m.rota === rota)
  const local = [ativa.bairro, 'Rio de Janeiro'].filter(Boolean).join(', ')

  return (
    <div className="app">
      <aside className="side" aria-label="Menu principal">
        <div className="side-brand">
          <span className="pole logo-pole" aria-hidden="true" />
          <span className="brandname">Barbeiro<br />Inteligente</span>
        </div>
        <nav className="side-nav">
          {MENU.map((m) => (
            <a key={m.rota} href={`#/${m.rota}`} className="ni" aria-current={rota === m.rota ? 'page' : undefined}>
              <Icone nome={m.ic} /><span>{m.rotulo}</span>
              {badges[m.rota] > 0 && <i className={`nb${m.rota === 'produtos' ? ' warn' : ''}`}>{badges[m.rota]}</i>}
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <div className="shopcard">
            <Avatar nome={nome} grande />
            <div><b>{nome}</b><small>Proprietário · {ativa.nome}</small></div>
          </div>
          <button className="logout" onClick={sair}><Icone nome="out" /><span>Sair</span></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-in">
            <div className="tb-brand"><Marca /></div>
            <div className="tb-shop">
              <span className="dot" />
              <b>{ativa.nome}</b>
              <small>{local}</small>
            </div>
            <div className="tb-actions">
              {barbearias.length > 1 && (
                <select className="inp sel-barbearia" aria-label="Trocar de barbearia" value={ativa.id} onChange={(e) => onTrocar(e.target.value)}>
                  {barbearias.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              )}
              <button className="icon-btn" onClick={alternarTema} aria-label="Alternar tema claro e escuro"><Icone nome="theme" /></button>
              <button className="icon-btn mob-only" onClick={sair} aria-label="Sair"><Icone nome="out" /></button>
            </div>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>

      <nav className="bottomnav" aria-label="Menu principal">
        {PRINCIPAIS.map((id) => {
          const m = MENU.find((x) => x.rota === id)
          return (
            <a key={id} href={`#/${id}`} className="bn" aria-current={rota === id ? 'page' : undefined}>
              <Icone nome={m.ic} tam={22} /><span>{m.rotulo}</span>
            </a>
          )
        })}
        <button className="bn" onClick={() => setMais(true)} aria-current={maisAtivo ? 'page' : undefined}>
          <Icone nome="more" tam={22} /><span>{maisAtivo && itemAtual ? itemAtual.rotulo : 'Mais'}</span>
        </button>
      </nav>

      {mais && (
        <Modal titulo="Mais opções" onFechar={() => setMais(false)}>
          <div className="morelist">
            {MENU.filter((m) => !PRINCIPAIS.includes(m.rota)).map((m) => (
              <a key={m.rota} href={`#/${m.rota}`} className="btn ghost" onClick={() => setMais(false)}><Icone nome={m.ic} />{m.rotulo}</a>
            ))}
            <button className="btn ghost" onClick={sair}><Icone nome="out" />Sair</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
