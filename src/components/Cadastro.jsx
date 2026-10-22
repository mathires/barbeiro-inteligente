import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { formularioInicial, paraLinha, mensagemDeErro } from '../lib/campos.js'
import { hojeISO, inicioDoMes, somarMeses, nomeDoMesISO } from '../lib/formato.js'
import Modal from './Modal.jsx'

/*
 * Cadastro generico: lista + busca + criar + editar + ativar/desativar + excluir.
 * Cada pagina so descreve tabela, campos do formulario e colunas da lista.
 * O isolamento entre barbearias vem do banco (RLS); aqui so enviamos barbearia_id.
 *
 * Opcoes extras (todas opcionais):
 *  ordem         'nome' ou { coluna, asc }
 *  tituloLinha   (linha, extras) => texto principal da linha (padrao: linha.nome)
 *  mesPor        coluna de data: mostra navegador de mes e filtra por ele
 *  rodape        (linhasVisiveis) => resumo/totais
 *  acoes         (linha, ctx) => [{ rotulo, aoClicar, perigo }]   ctx = { recarregar, extras, avisar, informar }
 *  carregarExtras async (barbeariaId) => dados auxiliares (ex.: estoque atual)
 *  podeExcluir   true | (linha) => boolean
 */
export default function Cadastro({
  titulo, singular, artigo = 'o', tabela, barbeariaId, campos, colunas,
  ordem = 'nome', tituloLinha = (l) => l.nome, mesPor, rodape, acoes, carregarExtras,
  comAtivo = false, podeExcluir = false, vazio = 'Nada cadastrado ainda.',
}) {
  const [linhas, setLinhas] = useState(null)
  const [opcoes, setOpcoes] = useState({})
  const [extras, setExtras] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [busca, setBusca] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [editando, setEditando] = useState(null) // null | 'novo' | linha
  const [mes, setMes] = useState(() => inicioDoMes(hojeISO()))

  const colunaOrdem = typeof ordem === 'string' ? ordem : ordem.coluna
  const crescente = typeof ordem === 'string' ? true : ordem.asc !== false

  const carregar = useCallback(async () => {
    setAviso('')
    let q = supabase.from(tabela).select('*').eq('barbearia_id', barbeariaId)
    if (mesPor) q = q.gte(mesPor, mes).lt(mesPor, somarMeses(mes, 1))
    const [{ data, error }, ex] = await Promise.all([
      q.order(colunaOrdem, { ascending: crescente }),
      carregarExtras ? carregarExtras(barbeariaId) : Promise.resolve(null),
    ])
    if (error) { setErro('Não foi possível carregar a lista.'); setLinhas([]) }
    else { setErro(''); setLinhas(data) }
    setExtras(ex)
  }, [tabela, barbeariaId, mesPor, mes, colunaOrdem, crescente, carregarExtras])

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

  const visiveis = useMemo(() => {
    if (!linhas) return []
    const termo = busca.trim().toLowerCase()
    return linhas.filter((l) => {
      if (comAtivo && !mostrarInativos && l.ativo === false) return false
      return !termo || String(tituloLinha(l, extras) ?? '').toLowerCase().includes(termo)
    })
  }, [linhas, busca, comAtivo, mostrarInativos, tituloLinha, extras])

  async function alternarAtivo(linha) {
    const { error } = await supabase.from(tabela).update({ ativo: !linha.ativo }).eq('id', linha.id).eq('barbearia_id', barbeariaId)
    if (error) setErro(mensagemDeErro(error, 'atualizar'))
    else carregar()
  }

  async function excluir(linha) {
    if (!window.confirm(`Excluir "${tituloLinha(linha, extras)}" definitivamente? Esta ação não pode ser desfeita.`)) return
    const { error } = await supabase.from(tabela).delete().eq('id', linha.id).eq('barbearia_id', barbeariaId)
    if (error) setErro(mensagemDeErro(error, 'excluir'))
    else carregar()
  }

  async function gravar(linha, original) {
    const consulta = original
      ? supabase.from(tabela).update(linha).eq('id', original.id).eq('barbearia_id', barbeariaId)
      : supabase.from(tabela).insert({ ...linha, barbearia_id: barbeariaId })
    const { error } = await consulta
    return error ? mensagemDeErro(error) : null
  }

  const ctx = { recarregar: carregar, extras, avisar: setErro, informar: setAviso }
  const pode = (l) => (typeof podeExcluir === 'function' ? podeExcluir(l) : podeExcluir)

  return (
    <main className="conteudo">
      <div className="titulo-linha">
        <h1>{titulo}</h1>
        <button className="botao" onClick={() => setEditando('novo')}>+ {artigo === 'a' ? 'Nova' : 'Novo'} {singular}</button>
      </div>

      {mesPor && <NavegadorMes mes={mes} onChange={setMes} />}

      <div className="filtros">
        <input type="search" placeholder="Buscar" aria-label="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {comAtivo && (
          <label className="marcar">
            <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
            Mostrar inativos
          </label>
        )}
      </div>

      {erro && <p role="alert" className="erro">{erro}</p>}
      {aviso && <p role="status" className="info">{aviso}</p>}
      {linhas === null && <p className="mudo">Carregando...</p>}
      {linhas && visiveis.length === 0 && !erro && (
        <p className="mudo">{linhas.length === 0 ? vazio : 'Nenhum resultado para essa busca.'}</p>
      )}

      {rodape && linhas && visiveis.length > 0 && <div className="resumo">{rodape(visiveis, extras)}</div>}

      <ul className="lista">
        {visiveis.map((l) => (
          <li key={l.id} className={`item${l.ativo === false ? ' inativo' : ''}`}>
            <div className="item-info">
              <strong>{tituloLinha(l, extras)}{l.ativo === false && <span className="selo">Inativo</span>}</strong>
              <div className="meta">
                {colunas.map((c) => {
                  const v = c.formato ? c.formato(l[c.chave], l, opcoes, extras) : l[c.chave]
                  return v ? <span key={c.chave + c.titulo}>{c.titulo}: {v}</span> : null
                })}
              </div>
            </div>
            <div className="item-acoes">
              <button className="link" onClick={() => setEditando(l)}>Editar</button>
              {acoes && acoes(l, ctx).filter(Boolean).map((a) => (
                <button key={a.rotulo} className={`link${a.perigo ? ' perigo' : ''}`} onClick={a.aoClicar}>{a.rotulo}</button>
              ))}
              {comAtivo && <button className="link" onClick={() => alternarAtivo(l)}>{l.ativo ? 'Desativar' : 'Reativar'}</button>}
              {pode(l) && <button className="link perigo" onClick={() => excluir(l)}>Excluir</button>}
            </div>
          </li>
        ))}
      </ul>

      {editando && (
        <FormularioModal
          titulo={editando === 'novo' ? `${artigo === 'a' ? 'Nova' : 'Novo'} ${singular}` : `Editar ${singular}`}
          campos={campos}
          opcoes={opcoes}
          original={editando === 'novo' ? null : editando}
          aoSalvar={gravar}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar() }}
        />
      )}
    </main>
  )
}

export function NavegadorMes({ mes, onChange }) {
  return (
    <div className="nav-mes" role="group" aria-label="Mês">
      <button className="link" onClick={() => onChange(somarMeses(mes, -1))} aria-label="Mês anterior">‹</button>
      <strong>{nomeDoMesISO(mes)}</strong>
      <button className="link" onClick={() => onChange(somarMeses(mes, 1))} aria-label="Próximo mês">›</button>
      <button className="link" onClick={() => onChange(inicioDoMes(hojeISO()))}>Este mês</button>
    </div>
  )
}

/*
 * Janela com formulario. aoSalvar(linha, original) devolve null (ok) ou texto de erro.
 * Tambem usada por acoes especiais (mover estoque, vender, atendimento...).
 */
export function FormularioModal({ titulo, campos, opcoes: opcoesProntas, barbeariaId, original = null, aoSalvar, onFechar, onSalvo, rotuloSalvar = 'Salvar', validar }) {
  const [form, setForm] = useState(() => formularioInicial(campos, original))
  // listas de escolha (clientes, servicos...): usa as ja carregadas ou busca no banco
  const [carregadas, setCarregadas] = useState({})
  const opcoes = opcoesProntas ?? carregadas
  useEffect(() => {
    if (opcoesProntas || !barbeariaId) return
    let cancelado = false
    campos.filter((c) => c.opcoes).forEach(async (c) => {
      const { tabela: t, valor, rotulo } = c.opcoes
      let q = supabase.from(t).select(`${valor}, ${rotulo}`).eq('barbearia_id', barbeariaId)
      if (c.opcoes.filtro) q = c.opcoes.filtro(q)
      const { data } = await q.order(rotulo)
      if (!cancelado) setCarregadas((o) => ({ ...o, [c.chave]: data ?? [] }))
    })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbeariaId])
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const mudar = (chave, valor) => setForm((f) => ({ ...f, [chave]: valor }))

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    let linha
    try {
      linha = paraLinha(campos, form, original)
      if (validar) validar(linha)
    } catch (err) { setErro(err.message); return }
    setEnviando(true)
    const msg = await aoSalvar(linha, original)
    setEnviando(false)
    if (msg) setErro(msg)
    else onSalvo()
  }

  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <form onSubmit={salvar} className="form">
        {campos.map((c) => (
          <Campo key={c.chave} campo={c} valor={form[c.chave]} opcoes={opcoes[c.chave]} onChange={(v) => mudar(c.chave, v)} />
        ))}
        {erro && <p role="alert" className="erro">{erro}</p>}
        <div className="form-botoes">
          <button type="button" className="link" onClick={onFechar}>Cancelar</button>
          <button className="botao" disabled={enviando}>{enviando ? 'Salvando...' : rotuloSalvar}</button>
        </div>
      </form>
    </Modal>
  )
}

function Campo({ campo: c, valor, opcoes = [], onChange }) {
  const req = c.obrigatorio || undefined
  if (c.tipo === 'booleano' || c.tipo === 'lgpd') {
    return (
      <label className="marcar">
        <input type="checkbox" checked={Boolean(valor)} onChange={(e) => onChange(e.target.checked)} />
        {c.rotulo}
      </label>
    )
  }
  // itens da lista de escolha: fixos (c.lista) ou vindos do banco (c.opcoes)
  const itens = c.lista ?? opcoes.map((o) => ({ valor: o[c.opcoes.valor], rotulo: o[c.opcoes.rotulo] }))
  return (
    <label>
      {c.rotulo}{c.obrigatorio ? '' : ' (opcional)'}
      {c.tipo === 'texto-longo' ? (
        <textarea rows={3} value={valor} onChange={(e) => onChange(e.target.value)} />
      ) : c.tipo === 'selecao' ? (
        <select value={valor} onChange={(e) => onChange(e.target.value)} required={req}>
          <option value="">{c.vazio ?? (c.obrigatorio ? 'Escolha...' : 'Nenhum')}</option>
          {itens.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
      ) : c.tipo === 'data' ? (
        <input type="date" value={valor} onChange={(e) => onChange(e.target.value)} required={req} />
      ) : c.tipo === 'hora' ? (
        <input type="time" value={valor} onChange={(e) => onChange(e.target.value)} required={req} />
      ) : (
        <input
          type="text"
          inputMode={c.tipo === 'inteiro' ? 'numeric' : ['moeda', 'percentual'].includes(c.tipo) ? 'decimal' : c.tipo === 'telefone' ? 'tel' : 'text'}
          placeholder={c.dica}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          required={req}
          autoComplete="off"
        />
      )}
    </label>
  )
}
