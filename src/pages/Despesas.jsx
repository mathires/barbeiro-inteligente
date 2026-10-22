import { useMemo } from 'react'
import { Cabecalho, BotaoNovo, Kpi, Pill, NavegadorMes, Aviso } from '../components/ui.jsx'
import ModalCadastro from '../components/ModalCadastro.jsx'
import { useCadastro } from '../hooks/useCadastro.js'
import { supabase } from '../lib/supabase.js'
import { moeda, dataBR, hojeISO, somarMeses, nomeDoMesISO, diasAte, pct } from '../lib/formato.js'
import { mensagemDeErro } from '../lib/campos.js'

const campos = [
  { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto', obrigatorio: true, dica: 'Ex.: Aluguel do ponto' },
  { chave: 'categoria_id', rotulo: 'Categoria', tipo: 'selecao', obrigatorio: true, opcoes: { tabela: 'categorias_despesa', valor: 'id', rotulo: 'nome' } },
  { chave: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', obrigatorio: true, min: 0.01 },
  { chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data', obrigatorio: true, padrao: hojeISO },
  { chave: 'pago_em', rotulo: 'Data do pagamento (deixe vazio se ainda não pagou)', tipo: 'data' },
]
const soma = (l) => l.reduce((s, d) => s + Number(d.valor), 0)
const dm = (iso) => dataBR(iso).slice(0, 5)

export default function Despesas({ barbeariaId }) {
  const cad = useCadastro({ tabela: 'despesas', barbeariaId, campos, ordem: 'vencimento', mesPor: 'vencimento' })
  const linhas = cad.linhas ?? []
  const hoje = hojeISO()

  const abertas = useMemo(() => linhas.filter((d) => !d.pago_em).sort((a, b) => a.vencimento.localeCompare(b.vencimento)), [linhas])
  const pagas = useMemo(() => linhas.filter((d) => d.pago_em).sort((a, b) => b.vencimento.localeCompare(a.vencimento)), [linhas])
  const total = soma(linhas), vPagas = soma(pagas), vAbertas = soma(abertas)
  const categorias = useMemo(() => {
    const m = new Map()
    linhas.forEach((d) => m.set(d.categoria_id, (m.get(d.categoria_id) ?? 0) + Number(d.valor)))
    return [...m.entries()]
      .map(([id, v]) => ({ id, v, nome: cad.opcoes.categoria_id?.find((c) => c.id === id)?.nome ?? 'Sem categoria' }))
      .sort((a, b) => b.v - a.v)
  }, [linhas, cad.opcoes])
  const nomeCategoria = (id) => cad.opcoes.categoria_id?.find((c) => c.id === id)?.nome ?? 'Sem categoria'

  async function repetir(d) {
    const venc = somarMeses(d.vencimento, 1)
    const { error } = await supabase.from('despesas').insert({
      barbearia_id: barbeariaId, categoria_id: d.categoria_id, descricao: d.descricao, valor: d.valor, vencimento: venc, pago_em: null,
    })
    if (error) cad.setErro(mensagemDeErro(error))
    else cad.setAviso(`Criada "${d.descricao}" com vencimento em ${dataBR(venc)}.`)
  }

  const linha = (d) => {
    const du = diasAte(d.vencimento, hoje)
    const quando = d.pago_em
      ? `pago em ${dm(d.pago_em)}`
      : `vence ${dm(d.vencimento)}${du > 0 ? ` (em ${du}${du === 1 ? ' dia' : ' dias'})` : du === 0 ? ' (hoje)' : ' (atrasada)'}`
    return (
      <li key={d.id}>
        <div className="main"><b>{d.descricao}</b><small>{nomeCategoria(d.categoria_id)} · {quando}</small></div>
        <div className="tail">
          <span className="amt neg">- {moeda(d.valor)}</span>
          {d.pago_em
            ? <Pill tipo="pos">Pago</Pill>
            : <button className="btn sm ghost" onClick={() => cad.atualizar(d, { pago_em: hoje })} aria-label={`Marcar como pago: ${d.descricao}`}>Marcar como pago</button>}
          <span className="row-acoes">
            <button className="lnk" onClick={() => cad.setEditando(d)} aria-label={`Editar ${d.descricao}`}>Editar</button>
            {d.pago_em && <button className="lnk" onClick={() => cad.atualizar(d, { pago_em: null })} aria-label={`Desfazer pagamento: ${d.descricao}`}>Desfazer</button>}
            <button className="lnk" onClick={() => repetir(d)} aria-label={`Repetir no mês seguinte: ${d.descricao}`}>Repetir</button>
            <button className="lnk perigo" onClick={() => cad.excluir(d, d.descricao)} aria-label={`Excluir ${d.descricao}`}>Excluir</button>
          </span>
        </div>
      </li>
    )
  }

  const prox = abertas[0]
  return (
    <div className="wrap">
      <Cabecalho titulo="Despesas" sub={`Saídas de ${nomeDoMesISO(cad.mes)}`} acoes={<BotaoNovo rotulo="Nova despesa" onClick={cad.abrirNovo} />} />
      <NavegadorMes mes={cad.mes} onChange={cad.setMes} />
      <Aviso erro={cad.erro} info={cad.aviso} />

      <div className="kpis">
        <Kpi tipo="neg" rotulo="Despesas do mês" valor={moeda(total)} nota={`${linhas.length} lançamento${linhas.length === 1 ? '' : 's'}`} />
        <Kpi rotulo="Pagas" valor={moeda(vPagas)} nota={`${pct(vPagas, total)}% do total`} />
        <Kpi tipo="warn" rotulo="A pagar" valor={moeda(vAbertas)} nota={prox ? `Próxima: ${prox.descricao}, ${dm(prox.vencimento)}` : 'Nada em aberto'} />
      </div>

      <div className="two" style={{ alignItems: 'start' }}>
        <section className="card" style={{ overflow: 'hidden' }}>
          {cad.linhas === null && <div className="card-b muted">Carregando...</div>}
          <div className="grp"><span>A vencer</span><span>{moeda(vAbertas)}</span></div>
          <ul className="list">{abertas.map(linha)}{abertas.length === 0 && cad.linhas && <li className="muted">Nenhuma conta em aberto.</li>}</ul>
          <div className="grp"><span>Pagas</span><span>{moeda(vPagas)}</span></div>
          <ul className="list">{pagas.map(linha)}{pagas.length === 0 && cad.linhas && <li className="muted">Nenhuma conta paga.</li>}</ul>
        </section>
        <section className="card">
          <div className="card-h"><h2>Para onde o dinheiro vai</h2></div>
          <div className="card-b bars">
            {categorias.length === 0 && <p className="muted">Nenhuma despesa neste mês.</p>}
            {categorias.map((c) => (
              <div className="bar-row" key={c.id}>
                <div className="bar-top"><b>{c.nome}</b><span>{moeda(c.v)} · {pct(c.v, total)}%</span></div>
                <div className="bar"><i style={{ width: `${(c.v / categorias[0].v) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <ModalCadastro cad={cad} campos={campos} singular="despesa" artigo="a" />
    </div>
  )
}
