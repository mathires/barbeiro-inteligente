import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Marca } from '../components/Layout.jsx'

// Primeiro acesso: grava o nome do barbeiro (perfil) e cria a barbearia do dono. O banco preenche
// dono_id (auth.uid()) e cria as categorias de despesa padrao automaticamente.
export default function NovaBarbearia({ onCriada, onSair }) {
  const [seuNome, setSeuNome] = useState('')
  const [nome, setNome] = useState('')
  const [endereco, setEndereco] = useState('')
  const [bairro, setBairro] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function criar(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const perfil = await supabase.from('perfis').update({ nome: seuNome.trim() }).eq('id', user?.id ?? '')
    if (perfil.error) { setEnviando(false); setErro('Não foi possível salvar o seu nome. Tente novamente.'); return }
    const { error } = await supabase.from('barbearias').insert({
      nome: nome.trim(), endereco: endereco.trim() || null, bairro: bairro.trim() || null,
    })
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
          <h2>Seus dados</h2>
          <div className="fld">
            <label htmlFor="nb-seu-nome">Seu nome (barbeiro)</label>
            <input id="nb-seu-nome" className="inp" required autoComplete="name" value={seuNome} onChange={(e) => setSeuNome(e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="nb-nome">Nome da barbearia</label>
            <input id="nb-nome" className="inp" required value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="nb-endereco">Endereço</label>
            <input id="nb-endereco" className="inp" required autoComplete="street-address" placeholder="Rua, número" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="nb-bairro">Bairro</label>
            <input id="nb-bairro" className="inp" required value={bairro} onChange={(e) => setBairro(e.target.value)} />
          </div>
          {erro && <p role="alert" className="err">{erro}</p>}
          <button className="btn primary block" disabled={enviando}>{enviando ? 'Criando...' : 'Criar barbearia'}</button>
          <button type="button" className="btn ghost block" onClick={onSair}>Sair</button>
        </form>
      </section>
    </div>
  )
}
