// Fonte unica das telas do menu. A barra lateral do computador e a gaveta do celular leem daqui,
// entao uma tela nova entra em um lugar so (e o teste confere que nenhuma ficou de fora da gaveta).
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
  { rota: 'agendamento-online', rotulo: 'Agendamento online', ic: 'chat' },
]

// Abas fixas da barra inferior do celular (as de uso diario). O resto fica na gaveta.
export const BARRA = ['inicio', 'agenda', 'clientes']

// Gaveta lateral do celular. "recolhivel": comeca fechado, a menos que a tela atual esteja dentro dele.
export const GRUPOS_GAVETA = [
  { id: 'dia', rotulo: 'Dia a dia', itens: ['inicio', 'agenda', 'clientes'] },
  { id: 'financeiro', rotulo: 'Financeiro', recolhivel: true, itens: ['receitas', 'despesas', 'relatorios'] },
  { id: 'cadastro', rotulo: 'Cadastro', itens: ['servicos', 'profissionais', 'produtos'] },
  { id: 'divulgacao', rotulo: 'Divulgação', itens: ['agendamento-online'] },
]

export const itemDoMenu = (rota) => MENU.find((m) => m.rota === rota)
