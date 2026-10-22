import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { mensagemDeErro } from '../lib/campos.js'
import { hojeISO, inicioDoMes, somarMeses } from '../lib/formato.js'

/*
 * Logica comum dos cadastros (a tela de cada modulo so desenha o resultado):
 * carrega as linhas da barbearia (com filtro opcional por mes), listas de escolha dos
 * formularios, dados extras, e oferece gravar, excluir e ativar/desativar.
 * O isolamento entre barbearias vem do banco (RLS); aqui so enviamos barbearia_id.
 */
export function useCadastro({ tabela, barbeariaId, campos = [], ordem = 'nome', mesPor, carregarExtras }) {
  const [linhas, setLinhas] = useState(null)
  const [opcoes, setOpcoes] = useState({})
  const [extras, setExtras] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [mes, setMes] = useState(() => inicioDoMes(hojeISO()))
  const [editando, setEditando] = useState(null) // null | 'novo' | linha

  const coluna = typeof ordem === 'string' ? ordem : ordem.coluna
  const crescente = typeof ordem === 'string' ? true : ordem.asc !== false

  const carregar = useCallback(async () => {
    setAviso('')
    let q = supabase.from(tabela).select('*').eq('barbearia_id', barbeariaId)
    if (mesPor) q = q.gte(mesPor, mes).lt(mesPor, somarMeses(mes, 1))
    const [{ data, error }, ex] = await Promise.all([
      q.order(coluna, { ascending: crescente }),
      carregarExtras ? carregarExtras(barbeariaId, mes) : Promise.resolve(null),
    ])
    if (error) { setErro('Não foi possível carregar a lista.'); setLinhas([]) }
    else { setErro(''); setLinhas(data) }
    setExtras(ex)
  }, [tabela, barbeariaId, mesPor, mes, coluna, crescente, carregarExtras])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    let cancelado = false
    campos.filter((c) => c.opcoes).forEach(async (c) => {
      const { tabela: t, valor, rotulo } = c.opcoes
      const { data } = await supabase.from(t).select(`${valor}, ${rotulo}`).eq('barbearia_id', barbeariaId).order(rotulo)
      if (!cancelado) setOpcoes((o) => ({ ...o, [c.chave]: data ?? [] }))
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

  async function atualizar(linha, mudanca, acao = 'atualizar') {
    const { error } = await supabase.from(tabela).update(mudanca).eq('id', linha.id).eq('barbearia_id', barbeariaId)
    if (error) setErro(mensagemDeErro(error, acao))
    else carregar()
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
