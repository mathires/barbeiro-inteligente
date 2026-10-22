import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Marca } from '../components/Layout.jsx'

// Primeiro acesso: cria a barbearia do dono. O banco preenche dono_id (auth.uid())
// e cria as categorias de despesa padrao automaticamente.
export default function NovaBarbearia({ onCriada, onSair }) {
  const [nome, setNome] = useState('')
  const [bairro, setBairro] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function criar(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await supabase.from('barbearias').insert({ nome: nome.trim(), bairro: bairro.trim() || null })
    setEnviando(false)
    if (error) setErro('Não foi possível criar a barbearia. Tente novamente.')
    else onCriada()
  }

  return (
    <div className="login">
      <section className="login-brand">
        <div className="brand-row"><Marca /></div>
        <div className="brand-copy">
          <h1>Vamos abrir a sua primeira barbearia</h1>
          <p className="lead">Você poderá cadastrar outras unidades depois e alternar entre elas no topo do app.</p>
        </div>
        <div className="pole pole-strip anim" aria-hidden="true" />
        <div className="pole pole-big anim" aria-hidden="true" />
      </section>
      <section className="login-form">
        <form className="lf" onSubmit={criar}>
          <h2>Sua barbearia</h2>
          <div className="fld">
            <label htmlFor="nb-nome">Nome da barbearia</label>
            <input id="nb-nome" className="inp" required value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="nb-bairro">Bairro (opcional)</label>
            <input id="nb-bairro" className="inp" value={bairro} onChange={(e) => setBairro(e.target.value)} />
          </div>
          {erro && <p role="alert" className="err">{erro}</p>}
          <button className="btn primary block" disabled={enviando}>{enviando ? 'Criando...' : 'Criar barbearia'}</button>
          <button type="button" className="btn ghost block" onClick={onSair}>Sair</button>
        </form>
      </section>
    </div>
  )
}
