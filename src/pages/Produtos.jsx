import { useCallback, useMemo, useState } from 'react'
import { Cabecalho, BotaoNovo, Kpi, Pill, Dica, Chips, Aviso } from '../components/ui.jsx'
import ModalCadastro from '../components/ModalCadastro.jsx'
import { FormularioModal } from '../components/Formulario.jsx'
import { useCadastro } from '../hooks/useCadastro.js'
import { useToast } from '../hooks/useToast.jsx'
import { supabase } from '../lib/supabase.js'
import { moeda, hojeISO } from '../lib/formato.js'
import { moverEstoque, venderProduto, FORMAS_PAGAMENTO } from '../lib/operacoes.js'

const campos = [
  { chave: 'nome', rotulo: 'Nome do produto', tipo: 'texto', obrigatorio: true, dica: 'Ex.: Pomada modeladora' },
  { chave: 'custo', rotulo: 'Custo (R$)', tipo: 'moeda', obrigatorio: true, min: 0 },
  { chave: 'preco_venda', rotulo: 'Preço de venda (R$) - deixe vazio se for só de uso interno', tipo: 'moeda', min: 0 },
  { chave: 'estoque_minimo', rotulo: 'Estoque mínimo (avisa quando precisar repor)', tipo: 'inteiro', obrigatorio: true, min: 0, padrao: '0' },
  { chave: 'ativo', rotulo: 'Produto ativo', tipo: 'booleano', padrao: true },
]

const camposMover = [
  { chave: 'tipo', rotulo: 'Tipo de movimento', tipo: 'selecao', obrigatorio: true, padrao: 'entrada', lista: [
    { valor: 'entrada', rotulo: 'Entrada (compra / reposição)' },
    { valor: 'saida', rotulo: 'Saída (uso interno / perda)' },
    { valor: 'ajuste', rotulo: 'Ajuste de inventário (use - para diminuir)' },
  ] },
  { chave: 'quantidade', rotulo: 'Quantidade', tipo: 'inteiro', obrigatorio: true },
  { chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, padrao: hojeISO },
  { chave: 'observacao', rotulo: 'Observação', tipo: 'texto' },
]

const camposVender = (p) => [
  { chave: 'quantidade', rotulo: 'Quantidade', tipo: 'inteiro', obrigatorio: true, min: 1, padrao: '1' },
  { chave: 'valor_unit', rotulo: 'Valor unitário (R$)', tipo: 'moeda', obrigatorio: true, min: 0.01, padrao: p.preco_venda == null ? '' : String(p.preco_venda).replace('.', ',') },
  { chave: 'forma', rotulo: 'Forma de pagamento', tipo: 'selecao', obrigatorio: true, lista: FORMAS_PAGAMENTO },
  { chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, padrao: hojeISO },
  { chave: 'cliente_id', rotulo: 'Cliente', tipo: 'selecao', vazio: 'Sem cliente', opcoes: { tabela: 'clientes', valor: 'id', rotulo: 'nome' } },
]

// estoque atual de cada produto, calculado pela view do banco
async function carregarEstoque(barbeariaId) {
  const { data } = await supabase.from('vw_produtos_estoque').select('id, estoque_atual, repor').eq('barbearia_id', barbeariaId)
  return Object.fromEntries((data ?? []).map((p) => [p.id, p]))
}

export default function Produtos({ barbeariaId }) {
  const cad = useCadastro({ tabela: 'produtos', barbeariaId, campos, ordem: 'nome', carregarExtras: carregarEstoque })
  const [janela, setJanela] = useState(null) // { tipo: 'mover'|'vender', produto }
  const [mostrar, setMostrar] = useState('ativos')
  const [toast, avisar] = useToast()

  const estoque = (p) => cad.extras?.[p.id]?.estoque_atual ?? 0
  const repor = (p) => Boolean(cad.extras?.[p.id]?.repor)
  const todos = cad.linhas ?? []
  const ativos = todos.filter((p) => p.ativo)
  const lista = mostrar === 'ativos' ? ativos : todos
  const baixos = ativos.filter(repor)
  const valorEstoque = useMemo(() => ativos.reduce((s, p) => s + estoque(p) * Number(p.custo), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ativos, cad.extras])

  const salvarMover = useCallback((p) => (l) => moverEstoque(supabase, {
    barbeariaId, produto: p, tipo: l.tipo, quantidade: l.quantidade, data: l.data, observacao: l.observacao,
  }), [barbeariaId])
  const salvarVenda = useCallback((p) => (l) => venderProduto(supabase, {
    barbeariaId, produto: p, quantidade: l.quantidade, valorUnitario: l.valor_unit, forma: l.forma, data: l.data, clienteId: l.cliente_id,
  }), [barbeariaId])

  return (
    <div className="wrap">
      <Cabecalho titulo="Produtos" sub="Estoque de revenda e insumos" acoes={<BotaoNovo rotulo="Novo produto" onClick={cad.abrirNovo} />} />
      <Aviso erro={cad.erro} info={cad.aviso} />

      {baixos.length > 0 && (
        <Dica titulo="Reposição" tipo="warn">
          <p>{baixos.length} {baixos.length === 1 ? 'item está' : 'itens estão'} abaixo do estoque mínimo: {baixos.map((p) => p.nome).join(', ')}.</p>
        </Dica>
      )}

      <div className="kpis">
        <Kpi rotulo="Itens cadastrados" valor={ativos.length} />
        <Kpi tipo="warn" rotulo="Abaixo do mínimo" valor={baixos.length} />
        <Kpi rotulo="Estoque a preço de custo" valor={moeda(valorEstoque)} />
      </div>

      <Chips rotulo="Mostrar produtos" valor={mostrar} onChange={setMostrar}
        opcoes={[{ valor: 'ativos', rotulo: 'Ativos' }, { valor: 'todos', rotulo: 'Todos (com inativos)' }]} />

      <section className="card" style={{ overflow: 'hidden' }}>
        <ul className="list">
          {cad.linhas === null && <li className="muted">Carregando...</li>}
          {cad.linhas && lista.length === 0 && <li className="muted">Cadastre os produtos que você usa ou vende (pomadas, shampoos, lâminas...).</li>}
          {lista.map((p) => {
            const baixo = repor(p), n = estoque(p), min = Number(p.estoque_minimo)
            const largura = min > 0 ? Math.min(100, (n / (min * 2)) * 100) : (n > 0 ? 100 : 0)
            const margem = p.preco_venda ? `${Math.round(((p.preco_venda - p.custo) / p.preco_venda) * 100)}%` : null
            return (
              <li key={p.id} style={p.ativo ? undefined : { opacity: 0.6 }}>
                <div className="main">
                  <b>{p.nome}{!p.ativo && ' (inativo)'}</b>
                  <small>Custo {moeda(p.custo)} · {p.preco_venda ? `Venda ${moeda(p.preco_venda)} · Margem ${margem}` : 'Uso interno'}</small>
                  <div className={`meter${baixo ? ' low' : ''}`} style={{ marginTop: 6, maxWidth: 260 }}><i style={{ width: `${largura}%` }} /></div>
                </div>
                <div className="tail">
                  <span className="amt">{n} un</span>
                  <small>mínimo {min}</small>
                  {baixo
                    ? <button className="btn sm primary" onClick={() => setJanela({ tipo: 'mover', produto: p })} aria-label={`Repor ${p.nome}`}>Repor</button>
                    : <Pill tipo="pos">Em dia</Pill>}
                  <span className="row-acoes">
                    {p.preco_venda != null && p.ativo && <button className="lnk" onClick={() => setJanela({ tipo: 'vender', produto: p })} aria-label={`Vender ${p.nome}`}>Vender</button>}
                    <button className="lnk" onClick={() => setJanela({ tipo: 'mover', produto: p })} aria-label={`Movimentar estoque de ${p.nome}`}>Movimentar</button>
                    <button className="lnk" onClick={() => cad.setEditando(p)} aria-label={`Editar ${p.nome}`}>Editar</button>
                    <button className="lnk" onClick={() => cad.atualizar(p, { ativo: !p.ativo })} aria-label={`${p.ativo ? 'Desativar' : 'Reativar'} ${p.nome}`}>{p.ativo ? 'Desativar' : 'Reativar'}</button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <ModalCadastro cad={cad} campos={campos} singular="produto" />
      {janela?.tipo === 'mover' && (
        <FormularioModal
          titulo={`Movimentar estoque - ${janela.produto.nome}`} campos={camposMover}
          aoSalvar={salvarMover(janela.produto)} rotuloSalvar="Registrar"
          onFechar={() => setJanela(null)}
          onSalvo={() => { avisar('Movimento de estoque registrado.'); setJanela(null); cad.carregar() }}
        />
      )}
      {janela?.tipo === 'vender' && (
        <FormularioModal
          titulo={`Vender - ${janela.produto.nome}`} campos={camposVender(janela.produto)}
          barbeariaId={barbeariaId} aoSalvar={salvarVenda(janela.produto)} rotuloSalvar="Registrar venda"
          onFechar={() => setJanela(null)}
          onSalvo={() => { avisar('Venda registrada e lançada em Receitas.'); setJanela(null); cad.carregar() }}
        />
      )}
      {toast}
    </div>
  )
}
