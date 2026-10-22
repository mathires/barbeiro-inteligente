import { useMemo, useState } from 'react'
import { Cabecalho, BotaoNovo, Kpi, Chips, NavegadorMes, Aviso } from '../components/ui.jsx'
import ModalCadastro from '../components/ModalCadastro.jsx'
import { useCadastro } from '../hooks/useCadastro.js'
import { moeda, hojeISO, nomeDoMesISO, rotuloDoDia, pct } from '../lib/formato.js'
import { FORMAS_PAGAMENTO, rotuloForma } from '../lib/operacoes.js'

const campos = [
  { chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, padrao: hojeISO },
  { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true, dica: 'Ex.: Corte + barba' },
  { chave: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', obrigatorio: true, min: 0.01, dica: '60,00' },
  { chave: 'forma_pagamento', rotulo: 'Forma de pagamento', tipo: 'selecao', obrigatorio: true, lista: FORMAS_PAGAMENTO },
  { chave: 'cliente_id', rotulo: 'Cliente', tipo: 'selecao', vazio: 'Sem cliente', opcoes: { tabela: 'clientes', valor: 'id', rotulo: 'nome' } },
]
const COR = { pix: 'var(--s1)', cartao: 'var(--s2)', dinheiro: 'var(--s3)' }
const soma = (l) => l.reduce((s, r) => s + Number(r.valor), 0)

export default function Receitas({ barbeariaId }) {
  const cad = useCadastro({ tabela: 'receitas', barbeariaId, campos, ordem: { coluna: 'data', asc: false }, mesPor: 'data' })
  const [forma, setForma] = useState('todas')
  const linhas = cad.linhas ?? []
  const hoje = hojeISO()

  const visiveis = useMemo(() => linhas.filter((r) => forma === 'todas' || r.forma_pagamento === forma), [linhas, forma])
  const grupos = useMemo(() => {
    const g = new Map()
    visiveis.forEach((r) => g.set(r.data, [...(g.get(r.data) ?? []), r]))
    return [...g.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [visiveis])

  const total = soma(linhas)
  const daAgenda = linhas.filter((r) => r.agendamento_id)
  const ticket = daAgenda.length ? soma(daAgenda) / daAgenda.length : 0
  const mix = FORMAS_PAGAMENTO.map((f) => ({ ...f, v: soma(linhas.filter((r) => r.forma_pagamento === f.valor)) }))
  const nomeCliente = (id) => cad.opcoes.cliente_id?.find((c) => c.id === id)?.nome

  return (
    <div className="wrap">
      <Cabecalho titulo="Receitas" sub={`Entradas de ${nomeDoMesISO(cad.mes)}`} acoes={<BotaoNovo rotulo="Nova receita" onClick={cad.abrirNovo} />} />
      <NavegadorMes mes={cad.mes} onChange={cad.setMes} />
      <Aviso erro={cad.erro} info={cad.aviso} />

      <div className="kpis">
        <Kpi tipo="pos" rotulo="Receita do mês" valor={moeda(total)} nota={`${linhas.length} lançamento${linhas.length === 1 ? '' : 's'}`} />
        <Kpi rotulo="Hoje" valor={moeda(soma(linhas.filter((r) => r.data === hoje)))} nota="Recebido até agora" />
        <Kpi rotulo="Ticket médio" valor={moeda(ticket)} nota="Por atendimento da agenda" />
        <Kpi rotulo="Atendimentos" valor={daAgenda.length} nota="Concluídos no mês" />
      </div>

      <section className="card">
        <div className="card-b" style={{ display: 'grid', gap: 12 }}>
          <h2 style={{ font: '700 14px var(--font-body)', color: 'var(--ink-2)' }}>Formas de pagamento nos lançamentos do mês</h2>
          <div className="mix" role="img" aria-label="Divisão por forma de pagamento">
            {total > 0
              ? mix.filter((m) => m.v > 0).map((m) => <i key={m.valor} style={{ flex: m.v, background: COR[m.valor] }} />)
              : <i style={{ flex: 1, background: 'var(--surface-2)' }} />}
          </div>
          <div className="legend">
            {mix.map((m) => <span key={m.valor} style={{ '--c': COR[m.valor] }}>{m.rotulo} {pct(m.v, total)}%</span>)}
          </div>
        </div>
      </section>

      <Chips rotulo="Filtrar por forma de pagamento" valor={forma} onChange={setForma}
        opcoes={[{ valor: 'todas', rotulo: 'Todos' }, ...FORMAS_PAGAMENTO.map((f) => ({ valor: f.valor, rotulo: f.rotulo }))]} />

      <section className="card" style={{ overflow: 'hidden' }}>
        {cad.linhas === null && <div className="card-b muted">Carregando...</div>}
        {cad.linhas && grupos.length === 0 && (
          <div className="card-b muted">{linhas.length === 0 ? 'Nenhuma receita neste mês. Atendimentos concluídos na agenda aparecem aqui sozinhos.' : 'Nenhuma receita com esta forma de pagamento.'}</div>
        )}
        {grupos.map(([dia, itens]) => (
          <div key={dia}>
            <div className="grp"><span>{rotuloDoDia(dia, hoje)}</span><span>{moeda(soma(itens))}</span></div>
            <ul className="list">
              {itens.map((r) => (
                <li key={r.id}>
                  <div className="main">
                    <b>{r.descricao}</b>
                    <small>{[rotuloForma(r.forma_pagamento), nomeCliente(r.cliente_id), r.agendamento_id && 'atendimento da agenda'].filter(Boolean).join(' · ')}</small>
                  </div>
                  <div className="tail">
                    <span className="amt pos">+ {moeda(r.valor)}</span>
                    <span className="row-acoes">
                      <button className="lnk" onClick={() => cad.setEditando(r)} aria-label={`Editar ${r.descricao}`}>Editar</button>
                      {!r.agendamento_id && <button className="lnk perigo" onClick={() => cad.excluir(r, r.descricao)} aria-label={`Excluir ${r.descricao}`}>Excluir</button>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <ModalCadastro cad={cad} campos={campos} singular="receita" artigo="a" />
    </div>
  )
}
