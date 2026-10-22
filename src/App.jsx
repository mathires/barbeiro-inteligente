import { useCallback, useEffect, useState } from 'react'
import { supabase, configurado } from './lib/supabase.js'
import { nomeDoEmail } from './lib/formato.js'
import Login from './pages/Login.jsx'
import NovaBarbearia from './pages/NovaBarbearia.jsx'
import Inicio from './pages/Inicio.jsx'
import Clientes from './pages/Clientes.jsx'
import Servicos from './pages/Servicos.jsx'
import Profissionais from './pages/Profissionais.jsx'
import Receitas from './pages/Receitas.jsx'
import Despesas from './pages/Despesas.jsx'
import Produtos from './pages/Produtos.jsx'
import Agenda from './pages/Agenda.jsx'
import Relatorios from './pages/Relatorios.jsx'
import EmBreve from './pages/EmBreve.jsx'
import Layout from './components/Layout.jsx'
import { useRota } from './hooks/useRota.js'
import { useBadges } from './hooks/useBadges.js'

const CHAVE_BARBEARIA = 'bi-barbearia-ativa'

function lerAtiva() {
  try { return localStorage.getItem(CHAVE_BARBEARIA) } catch { return null }
}
function gravarAtiva(id) {
  try { localStorage.setItem(CHAVE_BARBEARIA, id) } catch { /* sem armazenamento: segue sem lembrar */ }
}

export default function App() {
  const [sessao, setSessao] = useState(undefined) // undefined = carregando
  const [perfil, setPerfil] = useState(null)
  const [barbearias, setBarbearias] = useState(null) // null = carregando
  const [ativaId, setAtivaId] = useState(lerAtiva())
  const [erro, setErro] = useState('')

  // 1) Sessao de login
  useEffect(() => {
    if (!configurado) { setSessao(null); return }
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // 2) Perfil + barbearias do dono (o RLS ja filtra: so vem o que e dele)
  const carregar = useCallback(async () => {
    setErro('')
    const [p, b] = await Promise.all([
      supabase.from('perfis').select('nome').maybeSingle(),
      supabase.from('barbearias').select('id, nome, bairro').order('criado_em'),
    ])
    if (p.error || b.error) {
      setErro('Não foi possível carregar seus dados. Tente novamente.')
      return
    }
    setPerfil(p.data)
    setBarbearias(b.data)
    setAtivaId((atual) => (b.data.some((x) => x.id === atual) ? atual : b.data[0]?.id ?? null))
  }, [])

  useEffect(() => {
    if (sessao) carregar()
    else { setPerfil(null); setBarbearias(null) }
  }, [sessao, carregar])

  useEffect(() => { if (ativaId) gravarAtiva(ativaId) }, [ativaId])

  if (!configurado) {
    return (
      <main className="centro">
        <div className="cartao">
          <h1>Falta configurar</h1>
          <p>Crie o arquivo <code>.env</code> com a URL e a chave pública do Supabase (veja <code>.env.example</code>) e reinicie.</p>
        </div>
      </main>
    )
  }

  if (sessao === undefined) return <main className="centro"><p className="mudo">Carregando...</p></main>
  if (!sessao) return <Login />

  if (erro) {
    return (
      <main className="centro">
        <div className="cartao">
          <p role="alert" className="erro">{erro}</p>
          <button className="btn primary" onClick={carregar}>Tentar de novo</button>
        </div>
      </main>
    )
  }

  if (barbearias === null) return <main className="centro"><p className="mudo">Carregando...</p></main>

  if (barbearias.length === 0) {
    return <NovaBarbearia onCriada={carregar} onSair={() => supabase.auth.signOut()} />
  }

  const nome = perfil?.nome || nomeDoEmail(sessao.user.email)
  const ativa = barbearias.find((b) => b.id === ativaId) ?? barbearias[0]

  return <Aplicativo nome={nome} barbearias={barbearias} ativa={ativa} onTrocar={setAtivaId} />
}

// Area logada: menu + pagina escolhida pela rota (#/clientes, #/agenda...)
function Aplicativo({ nome, barbearias, ativa, onTrocar }) {
  const rota = useRota('inicio')
  const badges = useBadges(ativa.id, rota)
  // key={ativa.id}: ao trocar de barbearia, as telas recomecam do zero (sem dados da outra)
  const id = ativa.id
  const paginas = {
    inicio: <Inicio key={id} nome={nome} ativa={ativa} />,
    agenda: <Agenda key={id} barbeariaId={id} />,
    receitas: <Receitas key={id} barbeariaId={id} />,
    despesas: <Despesas key={id} barbeariaId={id} />,
    clientes: <Clientes key={id} barbeariaId={id} />,
    servicos: <Servicos key={id} barbeariaId={id} />,
    profissionais: <Profissionais key={id} barbeariaId={id} />,
    produtos: <Produtos key={id} barbeariaId={id} />,
    relatorios: <Relatorios key={id} barbeariaId={id} />,
  }
  return (
    <Layout rota={rota} nome={nome} barbearias={barbearias} ativa={ativa} onTrocar={onTrocar} badges={badges}>
      {paginas[rota] ?? <EmBreve />}
    </Layout>
  )
}
