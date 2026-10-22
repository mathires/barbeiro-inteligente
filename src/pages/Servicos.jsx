import { useMemo } from 'react'
import { Cabecalho, BotaoNovo, Aviso } from '../components/ui.jsx'
import ModalCadastro from '../components/ModalCadastro.jsx'
import { useCadastro } from '../hooks/useCadastro.js'
import { concluidosDoMes } from '../lib/mes.js'
import { moeda } from '../lib/formato.js'

const campos = [
  { chave: 'nome', rotulo: 'Nome do serviço', tipo: 'texto', obrigatorio: true, dica: 'Ex.: Corte masculino' },
  { chave: 'duracao_min', rotulo: 'Duração (minutos)', tipo: 'inteiro', obrigatorio: true, min: 5, max: 600, dica: '30' },
  { chave: 'preco', rotulo: 'Preço (R$)', tipo: 'moeda', obrigatorio: true, min: 0, dica: '45,00' },
  { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto-longo' },
  { chave: 'ativo', rotulo: 'Serviço ativo (aparece na agenda)', tipo: 'booleano', padrao: true },
]

export default function Servicos({ barbeariaId }) {
  const cad = useCadastro({ tabela: 'servicos', barbeariaId, campos, ordem: 'nome', carregarExtras: concluidosDoMes })
  const uso = useMemo(() => {
    const m = new Map()
    ;(cad.extras ?? []).forEach((a) => {
      const x = m.get(a.servico_id) ?? { qtd: 0, valor: 0 }
      m.set(a.servico_id, { qtd: x.qtd + 1, valor: x.valor + Number(a.valor) })
    })
    return m
  }, [cad.extras])

  return (
    <div className="wrap">
      <Cabecalho titulo="Serviços" sub="Tabela de preços e tempo de cada atendimento" acoes={<BotaoNovo rotulo="Novo serviço" onClick={cad.abrirNovo} />} />
      <Aviso erro={cad.erro} info={cad.aviso} />
      {cad.linhas === null && <p className="muted">Carregando...</p>}
      {cad.linhas && cad.linhas.length === 0 && <p className="muted">Cadastre seus serviços (corte, barba, sobrancelha...) com preço e duração.</p>}
      <div className="svcs">
        {(cad.linhas ?? []).map((s) => {
          const u = uso.get(s.id) ?? { qtd: 0, valor: 0 }
          return (
            <article key={s.id} className={`svc${s.ativo ? '' : ' off'}`}>
              <div className="svc-top">
                <div><h3>{s.nome}</h3><small>{s.duracao_min} minutos</small></div>
                <label className="sw" title="Disponível na agenda">
                  <input type="checkbox" checked={Boolean(s.ativo)} onChange={() => cad.atualizar(s, { ativo: !s.ativo })} aria-label={`Serviço ativo: ${s.nome}`} />
                  <span />
                </label>
              </div>
              <div className="price">{moeda(s.preco)}</div>
              {s.descricao && <p>{s.descricao}</p>}
              <div className="svc-foot"><span>{u.qtd} no mês</span><span>{moeda(u.valor)}</span></div>
              <button className="lnk" style={{ justifySelf: 'start' }} onClick={() => cad.setEditando(s)} aria-label={`Editar ${s.nome}`}>Editar</button>
            </article>
          )
        })}
      </div>
      <ModalCadastro cad={cad} campos={campos} singular="serviço" />
    </div>
  )
}
