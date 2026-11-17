import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { montarFrase, sortearFrase } from '../lib/frases.js'
import { moeda, primeiroDiaDoMes, hojeISO, dataBR, nomeDoMes, pct } from '../lib/formato.js'
import { horaLocal, limitesDoDia, somarDias, rotuloDia } from '../lib/agenda.js'
import { contasAPagar } from '../lib/relatorios.js'
import Icone from '../components/Icone.jsx'
import { gravarCache, lerCache } from '../lib/cache.js'

const ZERO = { receitas: 0, despesas_total: 0, despesas_pagas: 0, saldo_previsto: 0, saldo_realizado: 0 }

export default function Inicio({ nome, ativa }) {
  // A frase e sorteada ao entrar; o botao "Outra frase" sorteia uma diferente
  const [indice, setIndice] = useState(() => sortearFrase())
  const [saldo, setSaldo] = useState(() => lerCache(`ini-saldo|${ativa.id}`) ?? null)
  const [painel, setPainel] = useState(() => lerCache(`ini-painel|${ativa.id}`) ?? null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelado = false
    setSaldo(lerCache(`ini-saldo|${ativa.id}`) ?? null); setPainel(lerCache(`ini-painel|${ativa.id}`) ?? null); setErro('')
    const hoje = hojeISO()
    const [ini, fim] = limitesDoDia(hoje)
    const id = ativa.id

    supabase.from('vw_saldo_mensal')
      .select('receitas, despesas_total, despesas_pagas, saldo_previsto, saldo_realizado')
      .eq('barbearia_id', id).eq('mes', primeiroDiaDoMes()).maybeSingle()
      .then(({ data, error }) => {
        if (cancelado) return
        if (error) setErro('Não foi possível carregar o saldo do mês.')
        else setSaldo(gravarCache(`ini-saldo|${id}`, data ?? ZERO)) // sem lancamentos no mes = tudo zerado
      })

    Promise.all([
      supabase.from('agendamentos').select('*').eq('barbearia_id', id).gte('inicio', ini).lt('inicio', fim).order('inicio'),
      supabase.from('clientes').select('id, nome').eq('barbearia_id', id),
      supabase.from('despesas').select('*').eq('barbearia_id', id).is('pago_em', null).lte('vencimento', somarDias(hoje, 7)).order('vencimento'),
      supabase.from('vw_produtos_estoque').select('id, nome, estoque_atual, estoque_minimo').eq('barbearia_id', id).eq('repor', true).order('nome'),
    ]).then(([a, c, d, p]) => {
      if (cancelado) return
      setPainel(gravarCache(`ini-painel|${id}`, {
        agenda: a.data ?? [], clientes: c.data ?? [], contas: contasAPagar(d.data ?? [], hoje, somarDias(hoje, 7)), repor: p.data ?? [],
      }))
    })
    return () => { cancelado = true }
  }, [ativa.id])

  const agora = new Date().toISOString()
  const hoje = hojeISO()
  const vivos = (painel?.agenda ?? []).filter((a) => !['cancelado', 'faltou'].includes(a.status))
  const faltam = vivos.filter((a) => a.status !== 'concluido')
  const proximo = faltam.find((a) => a.status === 'em_atendimento' || a.fim > agora) ?? faltam[0]
  const nomeCliente = (id) => painel?.clientes.find((c) => c.id === id)?.nome ?? 'Cliente avulso'
  const contas = painel ? [...painel.contas.vencidas, ...painel.contas.proximas] : []

  const rec = Number(saldo?.receitas ?? 0)
  const desp = Number(saldo?.despesas_total ?? 0)
  const pagas = Number(saldo?.despesas_pagas ?? 0)
  const prev = Number(saldo?.saldo_previsto ?? 0)

  return (
    <div className="wrap">
      <section className="hero">
        <div className="hero-top">
          <small>{rotuloDia(hoje)} · {ativa.nome}</small>
          <button className="btn ghost sm" onClick={() => setIndice((i) => sortearFrase(i))}><Icone nome="spark" tam={16} />Outra frase</button>
        </div>
        <h1 aria-live="polite">{montarFrase(indice, nome)}</h1>
        <span className="pole anim" aria-hidden="true" />
      </section>

      <section className="card bal" aria-label={`Saldo de ${nomeDoMes()}`}>
        {erro && <p role="alert" className="frm-err">{erro}</p>}
        {!erro && !saldo && <p className="mudo">Carregando...</p>}
        {saldo && (
          <>
            <div>
              <span className="eyebrow">Saldo do mês</span>
              <div className={`bal-big ${prev >= 0 ? 'pos' : 'neg'}`}>{moeda(prev)}</div>
              <p className="muted">Receitas menos todas as despesas lançadas em {nomeDoMes()}, incluindo as contas ainda a vencer.</p>
              <div className="meter" style={{ marginTop: 14 }} role="img" aria-label={`Despesas representam ${pct(desp, rec)}% das receitas`}>
                <i style={{ width: `${Math.min(100, pct(desp, rec))}%`, background: 'var(--accent)' }} />
              </div>
              <small>As despesas consomem {pct(desp, rec)}% das receitas</small>
            </div>
            <div className="bal-grid">
              <div><span>Receitas</span><b className="pos">{moeda(rec)}</b></div>
              <div><span>Despesas pagas</span><b className="neg">{moeda(pagas)}</b></div>
              <div><span>A pagar</span><b className="warn">{moeda(desp - pagas)}</b><small>Contas lançadas e ainda abertas</small></div>
              <div><span>Saldo realizado</span><b>{moeda(saldo.saldo_realizado)}</b><small>Receitas menos despesas pagas</small></div>
            </div>
          </>
        )}
      </section>

      <div className="minis">
        <a className="mini" href="#/agenda">
          <span>Agenda de hoje</span>
          <b>{painel ? `${faltam.length} ${faltam.length === 1 ? 'atendimento' : 'atendimentos'}` : '...'}</b>
          <small>
            {!painel ? 'Carregando...' : proximo
              ? `${proximo.status === 'em_atendimento' ? 'Agora' : 'Próximo'}: ${horaLocal(proximo.inicio)} · ${nomeCliente(proximo.cliente_id)} · a receber ${moeda(faltam.reduce((s, a) => s + Number(a.valor), 0))}`
              : vivos.length ? 'Agenda do dia concluída' : 'Nenhum atendimento marcado para hoje'}
          </small>
        </a>
        <a className="mini" href="#/despesas">
          <span>Contas dos próximos 7 dias</span>
          <b>{painel ? moeda(painel.contas.total) : '...'}</b>
          <small>
            {!painel ? 'Carregando...' : contas.length === 0 ? 'Nenhuma conta a vencer'
              : `${contas.length} ${contas.length === 1 ? 'conta' : 'contas'}${painel.contas.vencidas.length ? ` (${painel.contas.vencidas.length} vencida${painel.contas.vencidas.length === 1 ? '' : 's'})` : ''} · próxima: ${contas[0].descricao}, ${dataBR(contas[0].vencimento)}`}
          </small>
        </a>
        <a className="mini" href="#/produtos">
          <span>Estoque</span>
          <b>{painel ? `${painel.repor.length} ${painel.repor.length === 1 ? 'item' : 'itens'}` : '...'}</b>
          <small>{!painel ? 'Carregando...' : painel.repor.length ? 'Abaixo do mínimo, hora de repor' : 'Tudo em dia'}</small>
        </a>
      </div>
    </div>
  )
}
