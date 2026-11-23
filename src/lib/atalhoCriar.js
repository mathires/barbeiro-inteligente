/*
 * Atalho "+ Criar" da barra inferior: abre o formulario de novo registro de qualquer tela.
 *
 * Cada tela ja tem seu proprio formulario (estado local). Em vez de duplicar isso no menu, o atalho
 * so "pede" a criacao e a tela de destino atende ao pedido:
 *  - tela ja aberta: recebe o evento e abre o formulario na hora;
 *  - outra tela: o endereco muda, a tela carrega (sob demanda) e, ao montar, consome o pedido guardado.
 * O pedido vale poucos segundos: se a tela nao chegar a atender (rede lenta, erro), ele expira em vez de
 * abrir um formulario "do nada" mais tarde.
 */
export const ATALHOS_CRIAR = [
  { tipo: 'agendamento', rotulo: 'Novo agendamento', ic: 'cal', rota: 'agenda' },
  { tipo: 'receita', rotulo: 'Nova receita', ic: 'up', rota: 'receitas' },
  { tipo: 'despesa', rotulo: 'Nova despesa', ic: 'down', rota: 'despesas' },
  { tipo: 'cliente', rotulo: 'Novo cliente', ic: 'users', rota: 'clientes' },
]

export const EVENTO_CRIAR = 'bi:criar'
export const VALIDADE_MS = 5000

let pedido = null

export function pedirCriar(tipo) {
  const atalho = ATALHOS_CRIAR.find((a) => a.tipo === tipo)
  if (!atalho) return false
  pedido = { tipo, em: Date.now() }
  const destino = `#/${atalho.rota}`
  if (window.location.hash === destino) window.dispatchEvent(new CustomEvent(EVENTO_CRIAR, { detail: tipo }))
  else window.location.hash = destino
  return true
}

// Devolve true uma unica vez por pedido, e so para o tipo certo e dentro da validade
export function consumirCriar(tipo) {
  if (!pedido || pedido.tipo !== tipo) return false
  const valido = Date.now() - pedido.em <= VALIDADE_MS
  pedido = null
  return valido
}

export const _limparPedido = () => { pedido = null } // so para os testes
