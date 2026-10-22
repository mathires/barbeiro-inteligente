import { Component } from 'react'

// Evita a "tela branca": se algo quebrar, mostra uma mensagem e um botao para recarregar.
export default class ErroGeral extends Component {
  state = { quebrou: false }
  static getDerivedStateFromError() { return { quebrou: true } }
  componentDidCatch(erro) { console.error('Erro no aplicativo:', erro) }
  render() {
    if (!this.state.quebrou) return this.props.children
    return (
      <main className="centro">
        <div className="cartao">
          <h1>Algo deu errado</h1>
          <p className="mudo">Seus dados estão seguros. Recarregue a página para continuar.</p>
          <button className="btn primary" onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      </main>
    )
  }
}
