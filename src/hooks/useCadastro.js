import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { mensagemDeErro } from '../lib/campos.js'
import { hojeISO, inicioDoMes, somarMeses } from '../lib/formato.js'
import { gravarCache, lerCache } from '../lib/cache.js'

/*
 * Logica comum dos cadastros (a tela de cada modulo so desenha o resultado):
 * carrega as linhas da barbearia (com filtro opcional por mes), listas de escolha dos
 * formularios, dados extras, e oferece gravar, excluir e ativar/desativar.
 * O isolamento entre barbearias vem do banco (RLS); aqui so enviamos barbearia_id.
 */
export function useCadastro({ tabela, barbeariaId, campos = [], ordem = 'nome', mesPor, carregarExtras }) {
  const [mes, setMes] = useState(() => inicioDoMes(hojeISO()))
  const chave = `cad|${tabela}|${barbeariaId}|${mesPor ? mes : ''}`
  const chaveOpcoes = (t) => `op|${barbeariaId}|${t}`
  // Volta para a tela ja com o que foi carregado antes (e revalida em seguida)
  const [linhas, setLinhas] = useState(() => lerCache(chave)?.linhas ?? null)
  const [extras, setExtras] = useState(() => lerCache(chave)?.extras ?? null)
  const [opcoes, setOpcoes] = useState(() => {
    const o = {}
    campos.filter((c) => c.opcoes).forEach((c) => { const v = lerCache(chaveOpcoes(c.opcoes.tabela)); if (v) o[c.chave] = v })
    return o
  })
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [editando, setEditando] = useState(null) // null | 'novo' | linha

  const coluna = typeof ordem === 'string' ? ordem : ordem.coluna
  const crescente = typeof ordem === 'string' ? true : ordem.asc !== false

  // Troca de mes: mostra na hora o que ja foi visto daquele mes, se houver
  useEffect(() => {
    const c = lerCache(chave)
    if (c) { setLinhas(c.linhas); setExtras(c.extras) }
  }, [chave])

  const carregar = useCallback(async () => {
    setAviso('')
    let q = supabase.from(tabela).select('*').eq('barbearia_id', barbeariaId)
    if (mesPor) q = q.gte(mesPor, mes).lt(mesPor, somarMeses(mes, 1))
    const [{ data, error }, ex] = await Promise.all([
      q.order(coluna, { ascending: crescente }),
      carregarExtras ? carregarExtras(barbeariaId, mes) : Promise.resolve(null),
    ])
    if (error) { setErro('Não foi possível carregar a lista.'); setLinhas((l) => l ?? []) }
    else { setErro(''); setLinhas(data); gravarCache(chave, { linhas: data, extras: ex }) }
    setExtras(ex)
  }, [chave, tabela, barbeariaId, mesPor, mes, coluna, crescente, carregarExtras])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    let cancelado = false
    campos.filter((c) => c.opcoes).forEach(async (c) => {
      const { tabela: t, valor, rotulo } = c.opcoes
      const { data } = await supabase.from(t).select(`${valor}, ${rotulo}`).eq('barbearia_id', barbeariaId).order(rotulo)
      if (!cancelado) { setOpcoes((o) => ({ ...o, [c.chave]: data ?? [] })); gravarCache(chaveOpcoes(t), data ?? []) }
    })
    return () => { cancelado = true }
  }, [campos, barbeariaId])

  const gravar = useCallback(async (linha, original) => {
    const consulta = original
      ? supabase.from(tabela).update(linha).eq('id', original.id).eq('barbearia_id', barbeariaId)
      : supabase.from(tabela).insert({ ...linha, barbearia_id: barbeariaId })
    const { error } = await consulta
    return error ? mensagemDeErro(error) : null
  }, [tabela, barbeariaId])

  // Atualizacao otimista: a tela muda na hora e, se o banco recusar, volta ao que era
  async function atualizar(linha, mudanca, acao = 'atualizar') {
    setLinhas((ls) => ls && ls.map((x) => (x.id === linha.id ? { ...x, ...mudanca } : x)))
    const { error } = await supabase.from(tabela).update(mudanca).eq('id', linha.id).eq('barbearia_id', barbeariaId)
    if (error) {
      setLinhas((ls) => ls && ls.map((x) => (x.id === linha.id ? linha : x)))
      setErro(mensagemDeErro(error, acao))
    } else carregar()
  }

  async function excluir(linha, nome) {
    if (!window.confirm(`Excluir "${nome}" definitivamente? Esta ação não pode ser desfeita.`)) return
    const { error } = await supabase.from(tabela).delete().eq('id', linha.id).eq('barbearia_id', barbeariaId)
    if (error) setErro(mensagemDeErro(error, 'excluir'))
    else carregar()
  }

  return {
    linhas, opcoes, extras, erro, aviso, mes, editando,
    setMes, setErro, setAviso, setEditando, carregar, gravar, atualizar, excluir,
    abrirNovo: () => setEditando('novo'),
    fechar: () => setEditando(null),
    salvou: () => { setEditando(null); carregar() },
  }
}
