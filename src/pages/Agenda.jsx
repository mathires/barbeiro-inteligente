import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { FormularioModal } from '../components/Formulario.jsx'
import Modal from '../components/Modal.jsx'
import Icone from '../components/Icone.jsx'
import { Cabecalho, BotaoNovo, Pill, Avatar, Dica, Chips, Aviso } from '../components/ui.jsx'
import { useToast } from '../hooks/useToast.jsx'
import { moeda, hojeISO } from '../lib/formato.js'
import { FORMAS_PAGAMENTO, concluirAtendimento, reabrirAtendimento } from '../lib/operacoes.js'
import {
  STATUS, ABRE, FECHA, acoesDoStatus, diasDaSemana, horaDeMinutos, horaLocal, janelaLivre, limitesDoDia, minutosDoDia,
  mudarStatus, partesLocais, rotuloDia, salvarAtendimento, somarDias,
} from '../lib/agenda.js'

const camposConcluir = [
  { chave: 'forma', rotulo: 'Forma de pagamento', tipo: 'selecao', obrigatorio: true, padrao: 'pix', lista: FORMAS_PAGAMENTO },
]
// status do banco -> classes visuais do protótipo
const VISUAL = { concluido: 'done', em_atendimento: 'now', confirmado: 'ok', aguardando: 'wait', cancelado: 'neg', faltou: 'warn' }
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const VIVO = (a) => !['cancelado', 'faltou'].includes(a.status)

export default function Agenda({ barbeariaId }) {
  const [dia, setDia] = useState(hojeISO())
  const [filtroProf, setFiltroProf] = useState('todos')
  const [semana, setSemana] = useState(null) // atendimentos da semana inteira (ate o domingo)
  const [base, setBase] = useState({ profissionais: [], servicos: [], clientes: [] })
  const [erro, setErro] = useState('')
  const [form, setForm] = useState(null) // null | 'novo' | atendimento
  const [concluindo, setConcluindo] = useState(null)
  const [toast, avisar] = useToast()

  const dias = useMemo(() => diasDaSemana(dia), [dia])
  const segunda = dias[0]

  // Cadastros usados nos nomes e nas listas do formulario
  useEffect(() => {
    let cancelado = false
    Promise.all(['profissionais', 'servicos', 'clientes'].map((t) =>
      supabase.from(t).select('*').eq('barbearia_id', barbeariaId).order('nome'))).then(([p, s, c]) => {
      if (!cancelado) setBase({ profissionais: p.data ?? [], servicos: s.data ?? [], clientes: c.data ?? [] })
    })
    return () => { cancelado = true }
  }, [barbeariaId])

  const carregar = useCallback(async () => {
    const [ini] = limitesDoDia(segunda)
    const [, fim] = limitesDoDia(somarDias(segunda, 6))
    const { data, error } = await supabase.from('agendamentos').select('*').eq('barbearia_id', barbeariaId)
      .gte('inicio', ini).lt('inicio', fim).order('inicio')
    if (error) { setErro('Não foi possível carregar a agenda.'); setSemana([]) } else { setErro(''); setSemana(data) }
  }, [barbeariaId, segunda])

  useEffect(() => { setSemana(null); carregar() }, [carregar])

  const hoje = hojeISO()
  const ehHoje = dia === hoje
  const nome = (lista, id) => lista.find((x) => x.id === id)?.nome
  const doDia = useMemo(() => (semana ?? []).filter((a) => partesLocais(a.inicio).data === dia), [semana, dia])
  const lista = doDia.filter((a) => filtroProf === 'todos' || a.profissional_id === filtroProf)
  const profsAtivos = base.profissionais.filter((p) => p.ativo)

  const concluidos = doDia.filter((a) => a.status === 'concluido')
  const aReceber = doDia.filter((a) => VIVO(a) && a.status !== 'concluido')
  const soma = (l) => l.reduce((s, a) => s + Number(a.valor), 0)

  async function acao(a, at) {
    setErro('')
    if (a.especial === 'concluir') { setConcluindo(at); return }
    const msg = a.especial === 'reabrir'
      ? await reabrirAtendimento(supabase, { barbeariaId, atendimento: at })
      : await mudarStatus(supabase, { barbeariaId, atendimento: at, novo: a.novo })
    if (msg) setErro(msg)
    else if (a.novo === 'cancelado') avisar('Atendimento cancelado.')
    carregar()
  }

  const descricaoReceita = (at) => `${nome(base.servicos, at.servico_id) ?? 'Atendimento'} - ${nome(base.clientes, at.cliente_id) ?? 'cliente avulso'}`

  // Linha do tempo com o marcador "Agora" (so no dia de hoje)
  const agoraMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })()
  const itens = []
  let marcou = false
  const marcador = <li key="agora" className="nowline"><span>Agora</span><i /></li>
  lista.forEach((a) => {
    if (ehHoje && !marcou && minutosDoDia(a.inicio) > agoraMin) { itens.push(marcador); marcou = true }
    itens.push(<Linha key={a.id} a={a} ehHoje={ehHoje} base={base} nome={nome} acao={acao} editar={() => setForm(a)} />)
  })
  if (ehHoje && !marcou && lista.length > 0) itens.push(marcador)

  // Janelas livres por profissional ativo
  const de = ehHoje ? Math.max(ABRE, Math.ceil(agoraMin / 5) * 5) : ABRE
  const janelas = profsAtivos.map((p) => ({
    p, w: janelaLivre(doDia, p.id, de), n: doDia.filter((a) => a.profissional_id === p.id && VIVO(a)).length,
  }))
  const melhor = janelas.filter((x) => x.w).sort((x, y) => (y.w[1] - y.w[0]) - (x.w[1] - x.w[0]))[0]
  const diaSemana = new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' })

  return (
    <div className="wrap">
      <Cabecalho titulo="Agenda" sub={`${rotuloDia(dia)} de ${dia.slice(0, 4)}`} acoes={<BotaoNovo rotulo="Novo agendamento" onClick={() => setForm('novo')} />} />

      <div className="toolbar" role="group" aria-label="Dia">
        <button className="icon-btn" onClick={() => setDia(somarDias(dia, -1))} aria-label="Dia anterior"><Icone nome="prev" /></button>
        <button className="icon-btn" onClick={() => setDia(somarDias(dia, 1))} aria-label="Próximo dia"><Icone nome="next" /></button>
        <button className="btn ghost sm" onClick={() => setDia(hoje)}>Hoje</button>
        <input className="inp" style={{ width: 'auto' }} type="date" aria-label="Ir para a data" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} />
      </div>

      <div className="dstrips" role="group" aria-label="Dias da semana">
        {dias.map((d, i) => {
          const n = (semana ?? []).filter((a) => partesLocais(a.inicio).data === d && VIVO(a)).length
          return (
            <button key={d} className="dstrip" aria-pressed={d === dia} onClick={() => setDia(d)} aria-label={`${DIAS[i]} ${Number(d.slice(8))}, ${n} agendamentos`}>
              <span>{DIAS[i]}</span><b>{Number(d.slice(8))}</b><em>{n} ag.</em>
            </button>
          )
        })}
      </div>

      <div className="stats3">
        <div className="stat"><span>Concluídos</span><b>{concluidos.length}/{doDia.filter(VIVO).length}</b></div>
        <div className="stat"><span>Recebido</span><b>{moeda(soma(concluidos))}</b></div>
        <div className="stat"><span>A receber</span><b>{moeda(soma(aReceber))}</b></div>
      </div>

      <Chips rotulo="Filtrar por profissional" valor={filtroProf} onChange={setFiltroProf}
        opcoes={[{ valor: 'todos', rotulo: 'Todos' }, ...profsAtivos.map((p) => ({ valor: p.id, rotulo: p.nome }))]} />

      <Aviso erro={erro} />
      {profsAtivos.length === 0 && base.servicos.filter((s) => s.ativo).length === 0 && (
        <p role="status" className="tip">Antes de agendar, cadastre ao menos um profissional e um serviço.</p>
      )}

      <div className="agenda">
        <ul className="tl">
          {semana === null && <li className="card card-b muted">Carregando...</li>}
          {semana && lista.length === 0 && !erro && <li className="card card-b muted">Nenhum atendimento neste dia.</li>}
          {itens}
        </ul>
        <aside style={{ display: 'grid', gap: 16 }}>
          <section className="card">
            <div className="card-h"><h2>Janelas livres</h2></div>
            <ul className="free">
              {janelas.length === 0 && <li className="muted">Cadastre os profissionais para ver as janelas livres.</li>}
              {janelas.map((x) => (
                <li key={x.p.id}>
                  <Avatar nome={x.p.nome} />
                  <div><b>{x.p.nome}</b><small>{x.n} {x.n === 1 ? 'atendimento' : 'atendimentos'}</small></div>
                  <span className="win">{x.w ? `${horaDeMinutos(x.w[0])} - ${horaDeMinutos(x.w[1])}` : 'Agenda cheia'}</span>
                </li>
              ))}
            </ul>
            <p className="card-b" style={{ paddingTop: 0 }}><small>Expediente considerado: {horaDeMinutos(ABRE)} às {horaDeMinutos(FECHA)}.</small></p>
          </section>
          {melhor && (
            <Dica titulo="Sugestão">
              <p>{melhor.p.nome} fica livre das {horaDeMinutos(melhor.w[0])} às {horaDeMinutos(melhor.w[1])}. Chame no WhatsApp os clientes que costumam vir às {diaSemana}s e preencha esse intervalo.</p>
              <a className="btn primary sm" style={{ justifySelf: 'start' }} href="#/clientes">Ver clientes</a>
            </Dica>
          )}
        </aside>
      </div>

      {form && (
        <AtendimentoModal
          barbeariaId={barbeariaId} base={base} dia={dia}
          original={form === 'novo' ? null : form}
          onFechar={() => setForm(null)}
          onSalvo={() => { setForm(null); avisar('Agendamento salvo.'); carregar() }}
        />
      )}
      {concluindo && (
        <FormularioModal
          titulo="Concluir atendimento" campos={camposConcluir} rotuloSalvar="Concluir e lançar receita"
          aoSalvar={(l) => concluirAtendimento(supabase, {
            barbeariaId, atendimento: concluindo, descricao: descricaoReceita(concluindo),
            forma: l.forma, data: partesLocais(concluindo.inicio).data,
          })}
          onFechar={() => setConcluindo(null)}
          onSalvo={() => { avisar(`Atendimento concluído. ${moeda(concluindo.valor)} lançado em Receitas.`); setConcluindo(null); carregar() }}
        />
      )}
      {toast}
    </div>
  )
}

function Linha({ a, ehHoje, base, nome, acao, editar }) {
  const cliente = nome(base.clientes, a.cliente_id) ?? 'Cliente avulso'
  const prof = nome(base.profissionais, a.profissional_id) ?? '-'
  const minutos = Math.round((new Date(a.fim) - new Date(a.inicio)) / 60000)
  const visual = VISUAL[a.status]
  return (
    <li className="slot">
      <div className="t"><b>{horaLocal(a.inicio)}</b><span>{horaLocal(a.fim)}</span></div>
      <div className={`ap ${visual}${['neg', 'warn'].includes(visual) ? ' off' : ''}`}>
        <div className="ap-main">
          <strong>{cliente}</strong>
          <span className="ap-sub">{nome(base.servicos, a.servico_id) ?? 'Serviço'} · {minutos} min{a.observacoes ? ` · ${a.observacoes}` : ''}</span>
        </div>
        <span className="ap-price">{moeda(a.valor)}</span>
        <div className="ap-who"><Avatar nome={prof} />{prof}</div>
        <Pill tipo={visual}>{STATUS[a.status]}</Pill>
        <div className="ap-act">
          {a.status !== 'concluido' && <button className="btn sm ghost" onClick={editar} aria-label={`Editar atendimento de ${cliente}`}>Editar</button>}
          {acoesDoStatus(a.status).map((x) => (
            <button key={x.rotulo} className="btn sm ghost" onClick={() => acao(x, a)} aria-label={`${x.rotulo} atendimento de ${cliente}`}>
              {x.rotulo === 'Concluir' && <Icone nome="check" tam={16} />}{x.rotulo}
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}

function AtendimentoModal({ barbeariaId, base, dia, original, onFechar, onSalvo }) {
  const ini = original ? partesLocais(original.inicio) : { data: dia, hora: '09:00' }
  const minutos = original ? Math.round((new Date(original.fim) - new Date(original.inicio)) / 60000) : ''
  const [f, setF] = useState({
    cliente_id: original?.cliente_id ?? '', profissional_id: original?.profissional_id ?? '', servico_id: original?.servico_id ?? '',
    data: ini.data, hora: ini.hora, duracao_min: String(minutos), valor: original ? String(original.valor).replace('.', ',') : '',
    observacoes: original?.observacoes ?? '',
  })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const mudar = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  // Ao escolher o servico, sugere duracao e valor (o usuario pode alterar depois)
  function escolherServico(e) {
    const s = base.servicos.find((x) => x.id === e.target.value)
    setF((x) => ({
      ...x, servico_id: e.target.value,
      ...(s ? { duracao_min: String(s.duracao_min), valor: String(s.preco).replace('.', ',') } : {}),
    }))
  }

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const msg = await salvarAtendimento(supabase, { barbeariaId, form: f, original })
    setEnviando(false)
    if (msg) setErro(msg)
    else onSalvo()
  }

  const profs = base.profissionais.filter((p) => p.ativo || p.id === original?.profissional_id)
  const servs = base.servicos.filter((s) => s.ativo || s.id === original?.servico_id)

  return (
    <Modal titulo={original ? 'Editar atendimento' : 'Novo agendamento'} onFechar={onFechar}>
      <form className="frm" onSubmit={salvar} noValidate>
        <div className="fld"><label htmlFor="at-cliente">Cliente (opcional)</label>
          <select id="at-cliente" className="inp" value={f.cliente_id} onChange={mudar('cliente_id')}>
            <option value="">Cliente avulso</option>
            {base.clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select></div>
        <div className="fld"><label htmlFor="at-prof">Profissional</label>
          <select id="at-prof" className="inp" value={f.profissional_id} onChange={mudar('profissional_id')}>
            <option value="">Escolha...</option>
            {profs.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select></div>
        <div className="fld"><label htmlFor="at-serv">Serviço</label>
          <select id="at-serv" className="inp" value={f.servico_id} onChange={escolherServico}>
            <option value="">Escolha...</option>
            {servs.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select></div>
        <div className="duas">
          <div className="fld"><label htmlFor="at-data">Data</label><input id="at-data" className="inp" type="date" value={f.data} onChange={mudar('data')} /></div>
          <div className="fld"><label htmlFor="at-hora">Hora</label><input id="at-hora" className="inp" type="time" value={f.hora} onChange={mudar('hora')} /></div>
        </div>
        <div className="duas">
          <div className="fld"><label htmlFor="at-dur">Duração (min)</label><input id="at-dur" className="inp" inputMode="numeric" value={f.duracao_min} onChange={mudar('duracao_min')} /></div>
          <div className="fld"><label htmlFor="at-valor">Valor (R$)</label><input id="at-valor" className="inp" inputMode="decimal" value={f.valor} onChange={mudar('valor')} /></div>
        </div>
        <div className="fld"><label htmlFor="at-obs">Observações (opcional)</label><textarea id="at-obs" className="inp ta" rows={2} value={f.observacoes} onChange={mudar('observacoes')} /></div>
        {erro && <p role="alert" className="frm-err">{erro}</p>}
        <div className="frm-actions">
          <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
          <button className="btn primary" disabled={enviando}>{enviando ? 'Salvando...' : 'Agendar'}</button>
        </div>
      </form>
    </Modal>
  )
}
