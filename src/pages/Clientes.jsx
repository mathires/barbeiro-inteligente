import { useDeferredValue, useMemo, useState } from 'react'
import { Cabecalho, BotaoNovo, Pill, Avatar, Dica, Chips, Busca, Aviso } from '../components/ui.jsx'
import ModalCadastro from '../components/ModalCadastro.jsx'
import { useCadastro } from '../hooks/useCadastro.js'
import { supabase } from '../lib/supabase.js'
import { moeda, hojeISO } from '../lib/formato.js'
import { resumoDeVisitas, classificar, diasDesde, textoUltima, linkWhatsApp, DIAS_PARA_SUMIR, VISITAS_PARA_FIEL } from '../lib/clientes.js'

const campos = [
  { chave: 'nome', rotulo: 'Nome do cliente', tipo: 'texto', obrigatorio: true },
  { chave: 'telefone', rotulo: 'Telefone / WhatsApp', tipo: 'telefone', dica: '(21) 99999-9999' },
  { chave: 'aniversario', rotulo: 'Aniversário', tipo: 'data' },
  { chave: 'servico_preferido_id', rotulo: 'Serviço preferido', tipo: 'selecao', vazio: 'Nenhum', opcoes: { tabela: 'servicos', valor: 'id', rotulo: 'nome' } },
  { chave: 'observacoes', rotulo: 'Observações', tipo: 'texto-longo' },
  { chave: 'consentimento_lgpd_em', rotulo: 'Cliente autorizou o uso dos seus dados (LGPD)', tipo: 'lgpd' },
]

// visitas = atendimentos CONCLUIDOS de cada cliente (a "ultima visita" vem da data do atendimento)
async function carregarVisitas(barbeariaId) {
  const { data } = await supabase.from('agendamentos').select('cliente_id, inicio').eq('barbearia_id', barbeariaId).eq('status', 'concluido')
  return resumoDeVisitas(data ?? [])
}

export default function Clientes({ barbeariaId }) {
  const cad = useCadastro({ tabela: 'clientes', barbeariaId, campos, ordem: 'nome', carregarExtras: carregarVisitas })
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const hoje = hojeISO()

  const clientes = useMemo(() => (cad.linhas ?? []).map((c) => {
    const v = cad.extras?.get(c.id)
    const visitas = v?.visitas ?? 0
    const dias = v?.ultima ? diasDesde(v.ultima, hoje) : null
    return { ...c, visitas, dias, etiqueta: classificar(visitas, dias ?? 0) }
  }), [cad.linhas, cad.extras, hoje])

  const sumidos = clientes.filter((c) => c.etiqueta === 'sumido').length
  const fieis = clientes.filter((c) => c.visitas >= VISITAS_PARA_FIEL).length
  // A caixa de busca responde na hora; a lista acompanha logo atras (sem travar a digitacao)
  const termo = useDeferredValue(busca.trim().toLowerCase())
  const visiveis = useMemo(() => clientes.filter((c) =>
    (!termo || c.nome.toLowerCase().includes(termo)) &&
    (filtro === 'todos' || (filtro === 'fieis' && c.visitas >= VISITAS_PARA_FIEL) || (filtro === 'sumidos' && c.etiqueta === 'sumido'))), [clientes, termo, filtro])

  const servico = (id) => cad.opcoes.servico_preferido_id?.find((s) => s.id === id)?.nome

  return (
    <div className="wrap">
      <Cabecalho titulo="Clientes" sub={`${clientes.length} ${clientes.length === 1 ? 'cliente cadastrado' : 'clientes cadastrados'}`}
        acoes={<BotaoNovo rotulo="Novo cliente" onClick={cad.abrirNovo} />} />
      <Aviso erro={cad.erro} info={cad.aviso} />

      {sumidos > 0 && (
        <Dica titulo="Oportunidade" tipo="warn">
          <p>{sumidos} {sumidos === 1 ? 'cliente não volta' : 'clientes não voltam'} há mais de {DIAS_PARA_SUMIR} dias. Uma mensagem de retorno com horário reservado costuma trazer parte deles de volta.</p>
          <button className="btn primary sm" style={{ justifySelf: 'start' }} onClick={() => setFiltro('sumidos')}>Ver clientes sumidos</button>
        </Dica>
      )}

      <div className="toolbar">
        <Busca valor={busca} onChange={setBusca} rotulo="Buscar cliente pelo nome" />
        <Chips rotulo="Filtrar clientes" valor={filtro} onChange={setFiltro} opcoes={[
          { valor: 'todos', rotulo: `Todos · ${clientes.length}` },
          { valor: 'fieis', rotulo: `Fiéis · ${fieis}` },
          { valor: 'sumidos', rotulo: `Sumidos · ${sumidos}` },
        ]} />
      </div>

      <section className="card" style={{ overflow: 'hidden' }}>
        <ul className="list">
          {cad.linhas === null && <li className="muted">Carregando...</li>}
          {cad.linhas && visiveis.length === 0 && (
            <li className="muted">{clientes.length === 0 ? 'Nenhum cliente ainda. Cadastre o primeiro para começar a montar sua base.' : 'Nenhum cliente encontrado.'}</li>
          )}
          {visiveis.map((c) => {
            const zap = linkWhatsApp(c.telefone)
            return (
              <li key={c.id}>
                <Avatar nome={c.nome} grande />
                <div className="main">
                  <b>{c.nome}</b>
                  <small>
                    {c.visitas} {c.visitas === 1 ? 'visita' : 'visitas'}{c.dias != null ? ` · última ${textoUltima(c.dias)}` : ' · ainda sem visitas'}
                    {servico(c.servico_preferido_id) ? ` · prefere ${servico(c.servico_preferido_id)}` : ''}
                  </small>
                  {c.telefone && <small>{c.telefone}</small>}
                </div>
                <div className="tail">
                  {c.etiqueta === 'sumido' && <Pill tipo="warn">Sumido</Pill>}
                  {c.etiqueta === 'fiel' && <Pill tipo="pos">Fiel</Pill>}
                  {c.etiqueta === 'novo' && <Pill tipo="now">Novo</Pill>}
                  <span className="row-acoes">
                    {zap && <a className="lnk" href={zap} target="_blank" rel="noreferrer" aria-label={`Chamar ${c.nome} no WhatsApp`}>WhatsApp</a>}
                    <button className="lnk" onClick={() => cad.setEditando(c)} aria-label={`Editar ${c.nome}`}>Editar</button>
                    <button className="lnk perigo" onClick={() => cad.excluir(c, c.nome)} aria-label={`Excluir ${c.nome}`}>Excluir</button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <ModalCadastro cad={cad} campos={campos} singular="cliente" />
    </div>
  )
}
