import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Icone from './Icone.jsx'
import Gaveta from './Gaveta.jsx'
import BotaoCriar from './BotaoCriar.jsx'
import { Avatar } from './ui.jsx'
import { alternarTema } from '../hooks/useTema.js'
import { MENU, BARRA, itemDoMenu } from '../lib/menu.js'

const sair = () => supabase.auth.signOut()

export function Marca({ classe = '' }) {
  return (
    <>
      <span className="pole logo-pole" aria-hidden="true" />
      <span className={`brandname ${classe}`}>Barbeiro Inteligente</span>
    </>
  )
}

// Aba da barra inferior que leva direto a uma tela
function AbaBarra({ id, rota, badges }) {
  const m = itemDoMenu(id)
  return (
    <a href={`#/${id}`} className="bn" aria-current={rota === id ? 'page' : undefined}>
      <Icone nome={m.ic} tam={22} /><span>{m.rotulo}</span>
      {badges[id] > 0 && <i className="bn-badge" aria-label={`${badges[id]} pendentes`}>{badges[id]}</i>}
    </a>
  )
}

export default function Layout({ rota, nome, barbearias, ativa, onTrocar, badges = {}, children }) {
  const [gaveta, setGaveta] = useState(false)
  const naGaveta = !BARRA.includes(rota) // a tela atual so se alcanca pelo Menu
  const itemAtual = itemDoMenu(rota)
  const local = [ativa.bairro, 'Rio de Janeiro'].filter(Boolean).join(', ')
  // selo do Menu no celular: soma os contadores das telas que ficam dentro da gaveta
  const badgeMenu = MENU.filter((m) => !BARRA.includes(m.rota)).reduce((t, m) => t + (badges[m.rota] || 0), 0)
  const rotuloMenu = naGaveta && itemAtual ? itemAtual.rotulo : 'Menu'

  // Trocar de tela comeca do topo (sem isso, a tela nova abria no meio, onde a anterior estava rolada)
  useEffect(() => {
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [rota])

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
            </div>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>

      <nav className="bottomnav" aria-label="Menu principal">
        <AbaBarra id={BARRA[0]} rota={rota} badges={badges} />
        <AbaBarra id={BARRA[1]} rota={rota} badges={badges} />
        <BotaoCriar />
        <AbaBarra id={BARRA[2]} rota={rota} badges={badges} />
        <button
          type="button" className="bn" aria-haspopup="dialog" aria-expanded={gaveta}
          aria-label={naGaveta && itemAtual ? `Menu, tela atual: ${itemAtual.rotulo}` : 'Menu'}
          aria-current={naGaveta ? 'page' : undefined} onClick={() => setGaveta(true)}
        >
          <Icone nome="menu" tam={22} /><span>{rotuloMenu}</span>
          {badgeMenu > 0 && <i className="bn-badge warn" aria-label={`${badgeMenu} avisos`}>{badgeMenu}</i>}
        </button>
      </nav>

      {gaveta && <Gaveta rota={rota} nome={nome} ativa={ativa} badges={badges} onFechar={() => setGaveta(false)} />}
    </div>
  )
}
