// Frases de boas-vindas com trocadilhos de barbearia (a do protótipo aprovado).
export const saudacao = (agora = new Date()) => {
  const h = agora.getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export const FRASES = [
  (n) => `Podemos começar a cortar, ${n}?`,
  (n, g) => `${g}, ${n}!`,
  (n) => `Já afiou a navalha, ${n}?`,
  (n) => `${n}, aqui o caixa fecha na régua.`,
  (n) => `Cadeira vazia não paga conta. Bora encher a agenda, ${n}!`,
  (n) => `Sem pelo na língua, ${n}: o saldo do mês está logo abaixo.`,
  (n) => `Hoje o corte é na precisão, ${n}.`,
  (n) => `Navalha afiada e agenda cheia. Vamos, ${n}?`,
  (n) => `Tudo na régua por aqui, ${n}.`,
  (n) => `${n}, hoje o lucro vem com acabamento fino.`,
  (n) => `Pronto para dar um trato no dia, ${n}?`,
  (n, g) => `${g}, ${n}! Que o dia seja sem fios soltos.`,
]

// Sorteia o indice de uma frase diferente da anterior
export function sortearFrase(anterior = -1, aleatorio = Math.random) {
  let i
  do { i = Math.floor(aleatorio() * FRASES.length) } while (i === anterior && FRASES.length > 1)
  return i
}

export const montarFrase = (indice, nome, agora = new Date()) => FRASES[indice](nome, saudacao(agora))
