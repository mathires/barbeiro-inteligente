import { useMemo } from 'react'
import { Cabecalho, BotaoNovo, Avatar, Aviso } from '../components/ui.jsx'
import ModalCadastro from '../components/ModalCadastro.jsx'
import { useCadastro } from '../hooks/useCadastro.js'
import { concluidosDoMes } from '../lib/mes.js'
import { moeda } from '../lib/formato.js'

const campos = [
  { chave: 'nome', rotulo: 'Nome do profissional', tipo: 'texto', obrigatorio: true },
  { chave: 'comissao_pct', rotulo: 'Comissão (%)', tipo: 'percentual', obrigatorio: true, min: 0, max: 100, padrao: '0', dica: '40' },
  { chave: 'ativo', rotulo: 'Profissional ativo (aparece na agenda)', tipo: 'booleano', padrao: true },
]

export default function Profissionais({ barbeariaId }) {
  const cad = useCadastro({ tabela: 'profissionais', barbeariaId, campos, ordem: 'nome', carregarExtras: concluidosDoMes })
  const uso = useMemo(() => {
    const m = new Map()
    ;(cad.extras ?? []).forEach((a) => {
      const x = m.get(a.profissional_id) ?? { qtd: 0, valor: 0 }
      m.set(a.profissional_id, { qtd: x.qtd + 1, valor: x.valor + Number(a.valor) })
    })
    return m
  }, [cad.extras])

  return (
    <div className="wrap">
      <Cabecalho titulo="Profissionais" sub="Barbeiros que atendem na agenda (não precisam de login)" acoes={<BotaoNovo rotulo="Novo profissional" onClick={cad.abrirNovo} />} />
      <Aviso erro={cad.erro} info={cad.aviso} />
      {cad.linhas === null && <p className="muted">Carregando...</p>}
      {cad.linhas && cad.linhas.length === 0 && (
        <p className="muted">Cadastre os barbeiros que atendem na sua barbearia (inclusive você, se atender). Eles não precisam de login.</p>
      )}
      <div className="svcs">
        {(cad.linhas ?? []).map((p) => {
          const u = uso.get(p.id) ?? { qtd: 0, valor: 0 }
          const pct = Number(p.comissao_pct)
          return (
            <article key={p.id} className={`svc${p.ativo ? '' : ' off'}`}>
              <div className="svc-top">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Avatar nome={p.nome} grande />
                  <div><h3>{p.nome}</h3><small>Comissão de {String(pct).replace('.', ',')}%</small></div>
                </div>
                <label className="sw" title="Disponível na agenda">
                  <input type="checkbox" checked={Boolean(p.ativo)} onChange={() => cad.atualizar(p, { ativo: !p.ativo })} aria-label={`Profissional ativo: ${p.nome}`} />
                  <span />
                </label>
              </div>
              <div className="price">{moeda(u.valor)}</div>
              <div className="svc-foot"><span>{u.qtd} atendimento{u.qtd === 1 ? '' : 's'} no mês</span><span>{moeda((u.valor * pct) / 100)} de comissão</span></div>
              <button className="lnk" style={{ justifySelf: 'start' }} onClick={() => cad.setEditando(p)} aria-label={`Editar ${p.nome}`}>Editar</button>
            </article>
          )
        })}
      </div>
      <ModalCadastro cad={cad} campos={campos} singular="profissional" />
    </div>
  )
}
