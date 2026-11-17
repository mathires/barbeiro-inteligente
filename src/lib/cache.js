/*
 * Cache em memoria para as telas abrirem na hora ao voltar (stale-while-revalidate):
 * a tela mostra o que ja foi carregado e, em paralelo, busca a versao nova no banco.
 * - Vive so na memoria da aba: fechar o app ou recarregar a pagina zera tudo.
 * - As chaves sempre incluem o id da barbearia, entao uma barbearia nunca ve dados de outra.
 * - E limpo ao sair da conta (ver App.jsx), para nao sobrar dado de um usuario para o proximo.
 */
const mapa = new Map()

export const lerCache = (chave) => mapa.get(chave)
export const gravarCache = (chave, valor) => { mapa.set(chave, valor); return valor }
export const limparCache = () => mapa.clear()
