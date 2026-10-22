import { FormularioModal } from './Formulario.jsx'

// Janela de "Novo/Editar" ligada a um useCadastro
export default function ModalCadastro({ cad, campos, singular, artigo = 'o' }) {
  if (!cad.editando) return null
  const novo = cad.editando === 'novo'
  return (
    <FormularioModal
      titulo={novo ? `${artigo === 'a' ? 'Nova' : 'Novo'} ${singular}` : `Editar ${singular}`}
      campos={campos}
      opcoes={cad.opcoes}
      original={novo ? null : cad.editando}
      aoSalvar={cad.gravar}
      onFechar={cad.fechar}
      onSalvo={cad.salvou}
    />
  )
}
