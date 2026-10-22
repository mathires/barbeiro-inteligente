import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Icone from '../components/Icone.jsx'
import { Marca } from '../components/Layout.jsx'

const FATOS = [
  'Agenda por barbeiro que avisa antes de marcar dois clientes no mesmo horário.',
  'Receitas por Pix, cartão e dinheiro lançadas na hora em que o cliente paga.',
  'Estoque que mostra o que repor antes de acabar a pomada.',
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    if (!email.trim() || !senha) { setErro('Informe e-mail e senha para entrar.'); return }
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEnviando(false)
    if (error) {
      setErro(error.message?.toLowerCase().includes('invalid') ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar agora. Tente novamente.')
    }
  }

  return (
    <div className="login">
      <section className="login-brand">
        <div className="brand-row"><Marca /></div>
        <div className="brand-copy">
          <h1>Do primeiro corte ao fechamento do caixa</h1>
          <p className="lead">Agenda, caixa, clientes e estoque da sua barbearia em um só lugar, no balcão ou no celular.</p>
          <ul className="facts">
            {FATOS.map((f) => <li key={f}><Icone nome="check" /><span>{f}</span></li>)}
          </ul>
        </div>
        <div className="pole pole-strip anim" aria-hidden="true" />
        <div className="pole pole-big anim" aria-hidden="true" />
      </section>
      <section className="login-form">
        <form className="lf" onSubmit={entrar} noValidate>
          <div>
            <h2>Entrar na barbearia</h2>
            <p className="sub" style={{ marginTop: 8 }}>Acesso exclusivo do proprietário da barbearia.</p>
          </div>
          <div className="fld">
            <label htmlFor="email">E-mail</label>
            <input id="email" className="inp" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="senha">Senha</label>
            <div className="pw">
              <input id="senha" className="inp" type={ver ? 'text' : 'password'} autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
              <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}><Icone nome="eye" /></button>
            </div>
          </div>
          {erro && <p role="alert" className="err">{erro}</p>}
          <button className="btn primary block" disabled={enviando}>{enviando ? 'Entrando...' : 'Entrar'}</button>
        </form>
      </section>
    </div>
  )
}
