// Regras da tela "Agendamento online" (configuracao do dono). Sem React, para poder testar.

export const PASSOS = [10, 15, 20, 30, 60]
export const DIAS_SEMANA = [
  { n: 1, rotulo: 'Seg' }, { n: 2, rotulo: 'Ter' }, { n: 3, rotulo: 'Qua' }, { n: 4, rotulo: 'Qui' },
  { n: 5, rotulo: 'Sex' }, { n: 6, rotulo: 'Sáb' }, { n: 0, rotulo: 'Dom' },
]
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

// "Barbearia Poste Vermelho" -> "poste-vermelho" (sem acento, so a-z, 0-9 e hifen, 3 a 40 letras)
export function sugerirSlug(nome = '') {
  const s = nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/^barbearia\s+/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40).replace(/-+$/, '')
  return s.length >= 3 ? s : ''
}

// O banco devolve "09:00:00"; o campo de hora trabalha com "09:00"
export const horaCurta = (t = '') => String(t).slice(0, 5)

// Banco -> formulario (tudo texto, como nos campos)
export function formDoBanco(b) {
  return {
    ligado: Boolean(b.agendamento_online),
    slug: b.slug ?? '',
    abertura: horaCurta(b.abertura ?? '09:00'),
    fechamento: horaCurta(b.fechamento ?? '20:00'),
    passo_min: String(b.passo_min ?? 30),
    dias: [...(b.dias_atendimento ?? [1, 2, 3, 4, 5, 6])].map(Number),
    antecedencia_min: String(b.antecedencia_min ?? 60),
    cancelamento_ate_min: String(b.cancelamento_ate_min ?? 120),
    janela_dias: String(b.janela_dias ?? 30),
  }
}

const inteiro = (v, min, max) => /^\d+$/.test(String(v).trim()) && Number(v) >= min && Number(v) <= max

// Confere o formulario com as mesmas regras do banco. Devolve { ok:true, valores } ou { ok:false, mensagem, campo }.
export function validarConfig(f) {
  const slug = f.slug.trim()
  if (f.ligado && !slug) return { ok: false, campo: 'slug', mensagem: 'Defina o endereço do link antes de ligar o agendamento online.' }
  if (slug && (!SLUG.test(slug) || slug.length < 3 || slug.length > 40)) {
    return { ok: false, campo: 'slug', mensagem: 'O endereço deve ter de 3 a 40 caracteres: letras minúsculas, números e hífen (ex.: poste-vermelho).' }
  }
  if (!/^\d{2}:\d{2}$/.test(f.abertura) || !/^\d{2}:\d{2}$/.test(f.fechamento) || f.fechamento <= f.abertura) {
    return { ok: false, campo: 'abertura', mensagem: 'O fechamento precisa ser depois da abertura.' }
  }
  if (!PASSOS.includes(Number(f.passo_min))) return { ok: false, campo: 'passo_min', mensagem: 'Escolha o intervalo entre horários.' }
  if (f.dias.length === 0) return { ok: false, campo: 'dias', mensagem: 'Marque pelo menos um dia de atendimento.' }
  if (!inteiro(f.antecedencia_min, 0, 1440)) return { ok: false, campo: 'antecedencia_min', mensagem: 'Antecedência mínima: de 0 a 1440 minutos.' }
  if (!inteiro(f.cancelamento_ate_min, 0, 2880)) return { ok: false, campo: 'cancelamento_ate_min', mensagem: 'Prazo de cancelamento: de 0 a 2880 minutos.' }
  if (!inteiro(f.janela_dias, 1, 90)) return { ok: false, campo: 'janela_dias', mensagem: 'Agenda aberta por: de 1 a 90 dias.' }
  return {
    ok: true,
    valores: {
      slug: slug || null,
      agendamento_online: f.ligado,
      abertura: f.abertura,
      fechamento: f.fechamento,
      passo_min: Number(f.passo_min),
      dias_atendimento: [...f.dias].sort((a, b) => a - b),
      antecedencia_min: Number(f.antecedencia_min),
      cancelamento_ate_min: Number(f.cancelamento_ate_min),
      janela_dias: Number(f.janela_dias),
    },
  }
}

// Traduz o erro do banco ao gravar a configuracao
export function mensagemDoErro(error) {
  if (!error) return ''
  if (error.code === '23505') return 'Esse endereço já está em uso por outra barbearia. Escolha outro.'
  if (error.code === '23514') return 'O banco recusou algum valor. Confira o endereço, o expediente e os dias.'
  return 'Não foi possível salvar. Tente novamente.'
}

export const linkPublico = (slug, origem = '') => `${origem}/#/agendar/${slug}`

// Mensagem pronta para a resposta automatica do WhatsApp Business (Fase 1: so um link, sem API)
export function textoWhatsApp({ nome, link }) {
  return `Olá! Aqui é a ${nome}. Para marcar seu horário, é só escolher o serviço, o barbeiro e o horário neste link: ${link}\nA confirmação aparece na hora, na própria tela.`
}

// O que falta para o link funcionar de verdade
export function pendencias({ profissionais, servicos, slug, ligado, testeTurnstile }) {
  const lista = []
  if (profissionais < 1) lista.push('Cadastre pelo menos um profissional ativo (menu Profissionais).')
  if (servicos < 1) lista.push('Cadastre pelo menos um serviço ativo (menu Serviços).')
  if (!slug) lista.push('Defina o endereço do link.')
  if (!ligado) lista.push('Ligue o agendamento online.')
  if (testeTurnstile) lista.push('A verificação anti-robô está em modo de teste. Troque pela chave real da Cloudflare antes de divulgar o link.')
  return lista
}
