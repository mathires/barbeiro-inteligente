import { useEffect, useId, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { formularioInicial, paraLinha } from '../lib/campos.js'
import Modal from './Modal.jsx'

/*
 * Janela com formulario montado a partir da lista de campos.
 * aoSalvar(linha, original) devolve null (ok) ou o texto do erro.
 * Usada pelos cadastros e por acoes especiais (mover estoque, vender, concluir atendimento).
 */
export function FormularioModal({ titulo, campos, opcoes: opcoesProntas, barbeariaId, original = null, aoSalvar, onFechar, onSalvo, rotuloSalvar = 'Salvar', validar }) {
  const [form, setForm] = useState(() => formularioInicial(campos, original))
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  // listas de escolha (clientes, servicos...): usa as ja carregadas ou busca no banco
  const [carregadas, setCarregadas] = useState({})
  const opcoes = opcoesProntas ?? carregadas
  const prefixo = useId()

  useEffect(() => {
    if (opcoesProntas || !barbeariaId) return
    let cancelado = false
    campos.filter((c) => c.opcoes).forEach(async (c) => {
      const { tabela: t, valor, rotulo } = c.opcoes
      const { data } = await supabase.from(t).select(`${valor}, ${rotulo}`).eq('barbearia_id', barbeariaId).order(rotulo)
      if (!cancelado) setCarregadas((o) => ({ ...o, [c.chave]: data ?? [] }))
    })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbeariaId])

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
      <form onSubmit={salvar} className="frm" noValidate>
        {campos.map((c) => (
          <Campo key={c.chave} id={`${prefixo}-${c.chave}`} campo={c} valor={form[c.chave]} opcoes={opcoes[c.chave]} onChange={(v) => mudar(c.chave, v)} />
        ))}
        {erro && <p role="alert" className="frm-err">{erro}</p>}
        <div className="frm-actions">
          <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
          <button className="btn primary" disabled={enviando}>{enviando ? 'Salvando...' : rotuloSalvar}</button>
        </div>
      </form>
    </Modal>
  )
}

export function Campo({ id, campo: c, valor, opcoes = [], onChange }) {
  const req = c.obrigatorio || undefined
  if (c.tipo === 'booleano' || c.tipo === 'lgpd') {
    return (
      <div className="fld fld-sw">
        <label htmlFor={id}>{c.rotulo}</label>
        <label className="sw">
          <input id={id} type="checkbox" checked={Boolean(valor)} onChange={(e) => onChange(e.target.checked)} />
          <span />
        </label>
      </div>
    )
  }
  // itens da lista de escolha: fixos (c.lista) ou vindos do banco (c.opcoes)
  const itens = c.lista ?? opcoes.map((o) => ({ valor: o[c.opcoes.valor], rotulo: o[c.opcoes.rotulo] }))
  const rotulo = c.obrigatorio ? c.rotulo : `${c.rotulo} (opcional)`
  return (
    <div className="fld">
      <label htmlFor={id}>{rotulo}</label>
      {c.tipo === 'texto-longo' ? (
        <textarea id={id} className="inp ta" rows={3} value={valor} onChange={(e) => onChange(e.target.value)} />
      ) : c.tipo === 'selecao' ? (
        <select id={id} className="inp" value={valor} onChange={(e) => onChange(e.target.value)} required={req}>
          <option value="">{c.vazio ?? (c.obrigatorio ? 'Escolha...' : 'Nenhum')}</option>
          {itens.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
      ) : c.tipo === 'data' ? (
        <input id={id} className="inp" type="date" value={valor} onChange={(e) => onChange(e.target.value)} required={req} />
      ) : c.tipo === 'hora' ? (
        <input id={id} className="inp" type="time" value={valor} onChange={(e) => onChange(e.target.value)} required={req} />
      ) : (
        <input
          id={id} className="inp" type="text"
          inputMode={c.tipo === 'inteiro' ? 'numeric' : ['moeda', 'percentual'].includes(c.tipo) ? 'decimal' : c.tipo === 'telefone' ? 'tel' : 'text'}
          placeholder={c.dica} value={valor} onChange={(e) => onChange(e.target.value)} required={req} autoComplete="off"
        />
      )}
    </div>
  )
}
