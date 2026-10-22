import { Cabecalho } from '../components/ui.jsx'

// Rota desconhecida (endereco digitado errado)
export default function EmBreve() {
  return (
    <div className="wrap">
      <Cabecalho titulo="Página não encontrada" sub="Use o menu para navegar." />
    </div>
  )
}
