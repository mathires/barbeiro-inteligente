import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Cabecalho, Kpi, NavegadorMes, Aviso } from '../components/ui.jsx'
import { moeda, hojeISO, inicioDoMes, somarMeses, nomeDoMesISO, pct as pctInt } from '../lib/formato.js'
import { FORMAS_PAGAMENTO } from '../lib/operacoes.js'
import {
  resumoDoMes, receitasPorForma, despesasPorCategoria, comissoes, ticketMedio, taxaDeFaltas, aniversariantes, receitaPorOrigem, mapaDeCalor,
} from '../lib/relatorios.js'

const pct1 = (n) => `${n.toFixed(1).replace('.', ',')}%`
const k1 = (v) => v.toFixed(1).replace('.', ',')
const mesCurto = (iso) => {
  const s = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const HORAS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const NOMES_DIA = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']

export default function Relatorios({ barbeariaId }) {
  const [mes, setMes] = useState(() => inicioDoMes(hojeISO()))
  const [d, setD] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelado = false
    setD(null); setErro('')
    const prox = somarMeses(mes, 1)
    const de = (t) => supabase.from(t).select('*').eq('barbearia_id', barbeariaId)
    Promise.all([
      de('receitas').gte('data', mes).lt('data', prox),
      de('despesas').gte('vencimento', mes).lt('vencimento', prox),
      de('categorias_despesa'),
      de('profissionais'),
      de('servicos'),
      de('clientes'),
      supabase.from('agendamentos').select('*').eq('barbearia_id', barbeariaId)
        .gte('inicio', new Date(`${mes}T00:00:00`).toISOString()).lt('inicio', new Date(`${prox}T00:00:00`).toISOString()),
      supabase.from('vw_saldo_mensal').select('*').eq('barbearia_id', barbeariaId).gte('mes', somarMeses(mes, -5)).lt('mes', prox).order('mes'),
    ]).then((r) => {
      if (cancelado) return
      if (r.some((x) => x.error)) { setErro('Não foi possível carregar os relatórios.'); return }
      const [receitas, despesas, categorias, profissionais, servicos, clientes, agendamentos, evolucao] = r.map((x) => x.data ?? [])
      setD({ receitas, despesas, categorias, profissionais, servicos, clientes, agendamentos, evolucao })
    })
    return () => { cancelado = true }
  }, [barbeariaId, mes])

  const rel = useMemo(() => {
    if (!d) return null
    const resumo = resumoDoMes(d.receitas, d.despesas)
    return {
      resumo,
      formas: receitasPorForma(d.receitas, FORMAS_PAGAMENTO),
      categorias: despesasPorCategoria(d.despesas, d.categorias),
      comissoes: comissoes(d.agendamentos, d.profissionais),
      origem: receitaPorOrigem(d.receitas, d.agendamentos, d.servicos),
      calor: mapaDeCalor(d.agendamentos, HORAS),
      ticket: ticketMedio(d.agendamentos),
      faltas: taxaDeFaltas(d.agendamentos),
      aniversarios: aniversariantes(d.clientes, Number(mes.slice(5, 7))),
      meses: Array.from({ length: 6 }, (_, i) => somarMeses(mes, i - 5)).map((m) => {
        const x = d.evolucao.find((e) => e.mes === m)
        return { mes: m, receitas: Number(x?.receitas ?? 0), despesas: Number(x?.despesas_total ?? 0) }
      }),
    }
  }, [d, mes])

  const atual = mes === inicioDoMes(hojeISO())
  const [ano, m] = mes.split('-')

  return (
    <div className="wrap">
      <Cabecalho titulo="Relatórios" sub={`${nomeDoMesISO(mes)}${atual ? `, até o dia ${Number(hojeISO().slice(8))}` : ''}`} />
      <NavegadorMes mes={mes} onChange={setMes} />
      {erro && <Aviso erro={erro} />}
      {!rel && !erro && <p className="muted">Carregando...</p>}
      {rel && (
        <>
          <div className="kpis">
            <Kpi tipo="pos" rotulo="Faturamento" valor={moeda(rel.resumo.receitas)} />
            <Kpi tipo="neg" rotulo="Despesas" valor={moeda(rel.resumo.despesas)} />
            <Kpi tipo={rel.resumo.saldoPrevisto >= 0 ? 'pos' : 'neg'} rotulo="Lucro do mês" valor={moeda(rel.resumo.saldoPrevisto)} nota="Receitas menos despesas lançadas" />
            <Kpi rotulo="Margem" valor={rel.resumo.receitas ? pct1((rel.resumo.saldoPrevisto / rel.resumo.receitas) * 100) : '0%'} nota="Lucro sobre faturamento" />
          </div>
          <div className="kpis">
            <Kpi rotulo="Saldo realizado" valor={moeda(rel.resumo.saldoRealizado)} nota="Receitas menos despesas pagas" />
            <Kpi tipo="warn" rotulo="Despesas a pagar" valor={moeda(rel.resumo.despesasAPagar)} />
            <Kpi rotulo="Ticket médio" valor={moeda(rel.ticket)} nota="Atendimentos concluídos" />
            <Kpi rotulo="Taxa de faltas" valor={pct1(rel.faltas)} nota="Faltas sobre concluídos + faltas" />
          </div>

          <section className="card">
            <div className="card-h"><h2>Receitas e despesas por mês</h2></div>
            <div className="card-b" style={{ display: 'grid', gap: 10 }}>
              <Grafico meses={rel.meses} atual={mes} />
              <div className="legend">
                <span style={{ '--c': 'var(--accent)' }}>Receitas</span>
                <span style={{ '--c': 'var(--neg)' }}>Despesas</span>
                <span className="chart-note" style={{ marginLeft: 'auto' }}>Valores em R$ mil.{atual ? ' *Mês em andamento.' : ''}</span>
              </div>
              <details>
                <summary className="lnk" style={{ cursor: 'pointer' }}>Ver os números em tabela</summary>
                <div className="rolagem"><table className="tabela">
                  <thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Saldo</th></tr></thead>
                  <tbody>
                    {rel.meses.map((x) => <tr key={x.mes}><td>{mesCurto(x.mes)}</td><td>{moeda(x.receitas)}</td><td>{moeda(x.despesas)}</td><td>{moeda(x.receitas - x.despesas)}</td></tr>)}
                  </tbody>
                </table></div>
              </details>
            </div>
          </section>

          <div className="two" style={{ alignItems: 'start' }}>
            <section className="card">
              <div className="card-h"><h2>Receita por serviço</h2></div>
              <Barras itens={rel.origem.map((o) => ({ chave: o.nome, nome: o.nome, valor: o.valor }))} vazio="Sem receitas neste mês." />
            </section>
            <section className="card">
              <div className="card-h"><h2>Desempenho por barbeiro</h2></div>
              <div className="card-b bars">
                {rel.comissoes.length === 0 && <p className="muted">Nenhum atendimento concluído no mês.</p>}
                {rel.comissoes.map((c) => (
                  <div className="bar-row" key={c.id}>
                    <div className="bar-top"><b>{c.nome}</b><span>{moeda(c.faturamento)}</span></div>
                    <div className="bar"><i style={{ width: `${(c.faturamento / rel.comissoes[0].faturamento) * 100}%` }} /></div>
                    <small>{c.atendimentos} {c.atendimentos === 1 ? 'atendimento' : 'atendimentos'} · ticket médio {moeda(c.faturamento / c.atendimentos)} · comissão {String(c.pct).replace('.', ',')}% = {moeda(c.comissao)}</small>
                  </div>
                ))}
                {rel.comissoes.length > 0 && <small>Base da comissão: atendimentos concluídos. Para contabilizar, lance o total em Despesas, na categoria Comissões.</small>}
              </div>
            </section>
          </div>

          <section className="card">
            <div className="card-h"><h2>Horários mais cheios</h2></div>
            <div className="card-b" style={{ display: 'grid', gap: 12 }}>
              <Calor calor={rel.calor} />
              <div className="scale"><span>Menos ocupado</span><i /><span>Mais ocupado</span></div>
              <p className="muted">
                {rel.calor.melhor
                  ? `O pico do mês é ${NOMES_DIA[rel.calor.melhor.dia]} às ${rel.calor.melhor.hora}h. Vale reservar esse horário para os clientes fiéis.`
                  : 'Quando houver atendimentos no mês, o horário mais cheio aparece aqui.'}
              </p>
            </div>
          </section>

          <div className="two" style={{ alignItems: 'start' }}>
            <section className="card">
              <div className="card-h"><h2>Forma de pagamento</h2></div>
              <Barras itens={rel.formas.map((f) => ({ chave: f.forma, nome: f.rotulo, valor: f.valor }))} vazio="Sem receitas neste mês." />
            </section>
            <section className="card">
              <div className="card-h"><h2>Despesas por categoria</h2></div>
              <Barras itens={rel.categorias.map((c) => ({ chave: c.id ?? c.nome, nome: c.nome, valor: c.valor }))} vazio="Sem despesas neste mês." />
            </section>
          </div>

          <section className="card">
            <div className="card-h"><h2>Aniversariantes do mês</h2></div>
            {rel.aniversarios.length === 0 ? <div className="card-b muted">Nenhum cliente com aniversário em {nomeDoMesISO(`${ano}-${m}-01`).split(' ')[0]}.</div> : (
              <ul className="list">
                {rel.aniversarios.map((c) => (
                  <li key={c.id}><div className="main"><b>{c.nome}</b><small>Dia {c.dia}{c.telefone ? ` · ${c.telefone}` : ''}</small></div></li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

// Barras horizontais: valor e percentual aparecem como texto (nao dependem so da cor)
function Barras({ itens, vazio }) {
  const total = itens.reduce((s, i) => s + i.valor, 0)
  const max = Math.max(0, ...itens.map((i) => i.valor))
  if (!total) return <div className="card-b muted">{vazio}</div>
  return (
    <div className="card-b bars">
      {itens.map((i) => (
        <div className="bar-row" key={i.chave}>
          <div className="bar-top"><b>{i.nome}</b><span>{moeda(i.valor)} · {pctInt(i.valor, total)}%</span></div>
          <div className="bar"><i style={{ width: `${max ? (i.valor / max) * 100 : 0}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

function Calor({ calor }) {
  const linhas = calor.valores.map((v, dia) => ({ v, dia })).filter((x) => x.dia < 6 || x.v.some((n) => n > 0))
  return (
    <div className="heat" role="img" aria-label="Mapa de calor dos atendimentos por dia da semana e hora">
      <span />
      {HORAS.map((h) => <span key={h} className="hl">{h}h</span>)}
      {linhas.map(({ v, dia }) => [
        <span key={`l${dia}`} className="dl">{DIAS[dia]}</span>,
        ...v.map((o, i) => <span key={`${dia}-${i}`} className="cell" style={{ '--o': o.toFixed(2) }} title={`${DIAS[dia]} ${HORAS[i]}h: ${Math.round(o * 100)}% do pico`} />),
      ])}
    </div>
  )
}

// Receitas x despesas dos ultimos 6 meses (SVG responsivo, em R$ mil)
function Grafico({ meses, atual }) {
  const ref = useRef(null)
  const [largura, setLargura] = useState(320)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const medir = () => setLargura(Math.max(280, el.clientWidth || 320))
    medir()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rec = meses.map((x) => x.receitas / 1000)
  const des = meses.map((x) => x.despesas / 1000)
  const topo = Math.max(0.001, ...rec, ...des)
  const passo = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].find((p) => topo / p <= 5) ?? 100
  const max = Math.ceil(topo / passo) * passo
  const h = 250, L = 38, R = 6, T = 14, B = 26
  const pw = largura - L - R, ph = h - T - B
  const y = (v) => T + ph - (v / max) * ph
  const gw = pw / meses.length, bw = Math.min(24, gw * 0.4), gap = 3
  const rotuloMil = (v) => (passo < 1 ? v.toFixed(1) : v.toFixed(0)).replace('.', ',')
  const ticks = []
  for (let t = 0; t <= max + 1e-9; t += passo) ticks.push(t)

  return (
    <div ref={ref} className="chart">
      <svg width={largura} height={h} viewBox={`0 0 ${largura} ${h}`} role="img" aria-label="Receitas e despesas dos últimos seis meses, em milhares de reais">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={largura - R} y1={y(t)} y2={y(t)} style={{ stroke: 'var(--line)' }} strokeWidth="1" />
            <text className="ct" x={L - 6} y={y(t) + 4} textAnchor="end">{rotuloMil(t)}</text>
          </g>
        ))}
        {meses.map((x, i) => {
          const cx = L + gw * i + gw / 2
          const parcial = x.mes === atual
          const x1 = cx - bw - gap / 2, x2 = cx + gap / 2
          return (
            <g key={x.mes} fillOpacity={parcial ? 0.7 : 1}>
              <rect x={x1} y={y(rec[i])} width={bw} height={y(0) - y(rec[i])} rx="3" style={{ fill: 'var(--accent)' }}><title>{`${mesCurto(x.mes)}: receitas ${moeda(x.receitas)}`}</title></rect>
              <rect x={x2} y={y(des[i])} width={bw} height={y(0) - y(des[i])} rx="3" style={{ fill: 'var(--neg)' }}><title>{`${mesCurto(x.mes)}: despesas ${moeda(x.despesas)}`}</title></rect>
              {bw >= 18 && rec[i] > 0 && <text className="cv" x={x1 + bw / 2} y={y(rec[i]) - 4} textAnchor="middle" fillOpacity="1">{k1(rec[i])}</text>}
              {bw >= 18 && des[i] > 0 && <text className="cv" x={x2 + bw / 2} y={y(des[i]) - 4} textAnchor="middle" fillOpacity="1">{k1(des[i])}</text>}
              <text className="ct" x={cx} y={h - 8} textAnchor="middle" fillOpacity="1">{mesCurto(x.mes)}{parcial ? '*' : ''}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
