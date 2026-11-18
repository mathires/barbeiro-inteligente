import { useCallback, useEffect, useRef, useState } from 'react'
import '../publico.css'
import { moeda, hojeISO } from '../lib/formato.js'
import { somarDias } from '../lib/agenda.js'
import {
  SERVICOS_EXEMPLO, PROFISSIONAIS_EXEMPLO, QUALQUER, horariosDoDia, diasDeAtendimento, proximoHorarioLivre,
  profissionalDoHorario, rotuloCurto, rotuloLongo, diaDoMes, validarContato, linkGoogleAgenda, formatarTelefone,
} from '../lib/publico.js'
import {
  diasAbertos, horariosReais, hojeNoFuso, instanteNoFuso, descricaoExpediente, partesNoFuso, ERROS_QUE_PEDEM_OUTRO_HORARIO,
} from '../lib/agendaPublica.js'
import { digitosTelefone } from '../lib/publico.js'
import { lerBarbearia, lerOcupacao, chamarFuncao, CHAVE_TURNSTILE } from '../lib/publicoApi.js'
import Turnstile from '../components/Turnstile.jsx'

// Pagina publica de agendamento (sem login).
//  - #/agendar            -> PREVIA: dados de exemplo (lib/publico.js), nao grava nada.
//  - #/agendar/<slug>     -> REAL: servicos, barbeiros e horarios vem do banco; grava pela Edge Function "agendar".
const BARBEARIA_EXEMPLO = { nome: 'Barbearia Poste Vermelho', bairro: 'Recreio dos Bandeirantes' }
const ETAPAS = ['Serviço', 'Barbeiro', 'Horário', 'Confirmar']
const reduzido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const PAUSA_ESCOLHA_MS = 240 // tempo para o cliente ver o item marcado antes de passar sozinho para a proxima etapa

// Marca o elemento com "in" quando ele entra na tela (revelacao suave ao rolar)
function useRevela() {
  const ref = useRef(null)
  const [visivel, setVisivel] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || visivel) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisivel(true); io.disconnect() } }, { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [visivel])
  return [ref, visivel ? ' in' : '']
}

export default function AgendarPublico({ slug = null }) {
  if (slug === null) return <Agendador />
  return <AgendarReal slug={slug} />
}

// Casca simples para os avisos (carregando, link invalido, sem conexao)
function Estado({ titulo, texto, acao, onAcao }) {
  return (
    <div className="pub">
      <div className="pub-fita" aria-hidden="true"><i /></div>
      <main className="pub-wrap pub-estado" role="status">
        <h1>{titulo}</h1>
        {texto && <p>{texto}</p>}
        {acao && <button type="button" className="pub-btn" onClick={onAcao}>{acao}</button>}
      </main>
    </div>
  )
}

// Busca a barbearia pelo endereco (slug) e so entao mostra o formulario
function AgendarReal({ slug }) {
  const [estado, setEstado] = useState({ fase: 'carregando' })
  const carregar = useCallback(() => {
    let vivo = true
    setEstado({ fase: 'carregando' })
    lerBarbearia(slug).then((r) => {
      if (!vivo) return
      if (!r.ok) setEstado({ fase: 'erro', mensagem: r.mensagem })
      else if (!r.dados) setEstado({ fase: 'indisponivel' })
      else setEstado({ fase: 'ok', config: r.dados })
    })
    return () => { vivo = false }
  }, [slug])
  useEffect(() => carregar(), [carregar])

  if (estado.fase === 'carregando') return <Estado titulo="Carregando..." />
  if (estado.fase === 'erro') return <Estado titulo="Sem conexão" texto={estado.mensagem} acao="Tentar de novo" onAcao={carregar} />
  if (estado.fase === 'indisponivel') {
    return <Estado titulo="Agendamento indisponível" texto="Este endereço não está recebendo agendamentos online agora. Fale com a barbearia pelo WhatsApp." />
  }
  return <Agendador key={slug} real={estado.config} slug={slug} />
}

const BARBEIRO_QUALQUER = { id: QUALQUER, nome: 'Quem estiver livre', apoio: 'Horário mais cedo', inicial: '★' }

function Agendador({ real = null, slug = null }) {
  const barbearia = real ? { nome: real.nome, bairro: real.bairro ?? '' } : BARBEARIA_EXEMPLO
  const servicos = real ? real.servicos : SERVICOS_EXEMPLO
  const profissionais = real
    ? [
      ...(real.profissionais.length > 1 ? [BARBEIRO_QUALQUER] : []),
      ...real.profissionais.map((p) => ({ ...p, inicial: p.nome.trim().charAt(0).toUpperCase(), apoio: '' })),
    ]
    : PROFISSIONAIS_EXEMPLO
  const fuso = real?.fuso

  const [agora, setAgora] = useState(() => new Date())
  const [etapa, setEtapa] = useState(0)
  const [sentido, setSentido] = useState(1) // 1 avanca, -1 volta
  const [saindo, setSaindo] = useState(false)
  const [servico, setServico] = useState(null)
  const [prof, setProf] = useState(null)
  const [dia, setDia] = useState(null)
  const [hora, setHora] = useState(null)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [erro, setErro] = useState(null) // { campo, mensagem }
  const [marcado, setMarcado] = useState(null) // retrato do agendamento confirmado
  const [fixo, setFixo] = useState(false)
  // So no modo real
  const [qtdDias, setQtdDias] = useState(7)
  const [ocup, setOcup] = useState({}) // dia -> { estado: 'carregando' | 'ok' | 'erro', itens }
  const [proximoReal, setProximoReal] = useState(undefined) // undefined = verificando; null = sem vaga; 'erro'
  const [consentimento, setConsentimento] = useState(false)
  const [token, setToken] = useState(null)
  const [reinicioTs, setReinicioTs] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [cancelamento, setCancelamento] = useState(null) // null | 'confirmar' | 'enviando' | 'feito' | { mensagem }
  const [linkCopiado, setLinkCopiado] = useState(false)

  const secao = useRef(null)
  const cartao = useRef(null)
  const titulo = useRef(null)
  const campoNome = useRef(null)
  const campoTel = useRef(null)
  const timers = useRef([])
  const primeira = useRef(true)
  const [refPerk1, perk1] = useRevela()
  const [refPerk2, perk2] = useRevela()
  const [refPerk3, perk3] = useRevela()
  const [refTitulo, tituloVisivel] = useRevela()

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  // O token do Turnstile pertence ao widget da etapa de confirmacao; ao sair dela, descarta
  useEffect(() => { if (etapa !== 3) setToken(null) }, [etapa])
  const depois = (ms, fn) => { timers.current.push(setTimeout(fn, ms)) }

  // Foco no titulo da etapa nova (leitor de tela anuncia a mudanca); nao na primeira pintura.
  // No celular, se o topo do cartao ficou para cima da tela (ex.: depois de rolar a lista de horarios),
  // traz o cartao de volta para a etapa nova comecar a vista.
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return }
    titulo.current?.focus({ preventScroll: true })
    const c = cartao.current
    if (c && c.getBoundingClientRect().top < 0) c.scrollIntoView?.({ block: 'start', behavior: reduzido() ? 'auto' : 'smooth' })
  }, [etapa])

  // "Voltar" do celular volta UMA etapa em vez de sair do site e perder o que foi escolhido.
  // Enquanto o cliente esta entre as etapas 1 e 3, existe uma entrada extra no historico (mesmo endereco).
  // O voltar consome essa entrada; ao chegar numa etapa ainda no meio, ela e recolocada.
  // No bilhete (etapa 4) o voltar segue o normal (sai do site, ex.: volta para o WhatsApp).
  const etapaAtual = useRef(etapa)
  const irAtual = useRef(null)
  const temGuarda = useRef(false)
  const ignorarVolta = useRef(false)
  useEffect(() => { etapaAtual.current = etapa })
  useEffect(() => {
    const aoVoltar = () => {
      temGuarda.current = false
      if (ignorarVolta.current) { ignorarVolta.current = false; return }
      const e = etapaAtual.current
      if (e > 0 && e < 4) irAtual.current?.(e - 1)
    }
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])
  useEffect(() => {
    if (etapa > 0 && etapa < 4 && !temGuarda.current) {
      window.history.pushState({ ...(window.history.state ?? {}), pubEtapa: true }, '')
      temGuarda.current = true
    } else if (etapa === 0 && temGuarda.current) {
      // voltou ao inicio pelos botoes da tela: retira a entrada extra para o proximo voltar sair normalmente
      temGuarda.current = false
      ignorarVolta.current = true
      window.history.back()
    }
  }, [etapa])

  // Botao fixo no celular: aparece depois da hero e some quando o agendamento esta na tela
  useEffect(() => {
    const aoRolar = () => {
      const r = secao.current?.getBoundingClientRect()
      const dentro = r ? r.top < window.innerHeight * 0.6 && r.bottom > 0 : false
      setFixo(window.scrollY > 320 && !dentro)
    }
    window.addEventListener('scroll', aoRolar, { passive: true })
    aoRolar()
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

  const irParaAgendar = () => secao.current?.scrollIntoView({ behavior: reduzido() ? 'auto' : 'smooth' })
  const irParaVantagens = () => document.getElementById('pub-vantagens')?.scrollIntoView({ behavior: reduzido() ? 'auto' : 'smooth' })

  // Proximo horario livre: na previa vem do exemplo; no modo real, de uma consulta aos 3 primeiros dias abertos
  useEffect(() => {
    if (!real) return
    let vivo = true
    const agoraLocal = new Date()
    const candidatos = diasAbertos(real, agoraLocal, 3)
    const menor = real.servicos.reduce((a, x) => (!a || x.duracao_min < a.duracao_min ? x : a), null)
    if (!menor || real.profissionais.length === 0 || candidatos.length === 0) { setProximoReal(null); return }
    Promise.all(candidatos.map((d) => lerOcupacao(slug, d))).then((rs) => {
      if (!vivo) return
      if (rs.every((r) => !r.ok)) { setProximoReal('erro'); return }
      for (let i = 0; i < candidatos.length; i++) {
        if (!rs[i].ok) continue
        const h = horariosReais({
          config: real, servico: menor, profissionais: real.profissionais, profissionalId: QUALQUER,
          dia: candidatos[i], ocupacao: rs[i].dados, agora: agoraLocal,
        }).find((x) => x.livre)
        if (h) { setProximoReal({ dia: candidatos[i], hora: h.hora }); return }
      }
      setProximoReal(null)
    })
    return () => { vivo = false }
  }, [real, slug])

  const proximo = real ? (proximoReal && proximoReal !== 'erro' ? proximoReal : null) : proximoHorarioLivre(agora)
  const textoProximo = (() => {
    if (real && proximoReal === undefined) return 'Verificando horários...'
    if (real && proximoReal === 'erro') return 'Escolha seu horário abaixo'
    if (!proximo) return 'Sem horários livres nos próximos dias'
    const hoje = real ? hojeNoFuso(agora, fuso) : hojeISO(agora)
    const quando = proximo.dia === hoje ? 'hoje' : proximo.dia === somarDias(hoje, 1) ? 'amanhã' : `${rotuloCurto(proximo.dia, agora)} ${diaDoMes(proximo.dia)}`
    return `Próximo horário livre: ${quando}, ${proximo.hora}`
  })()

  const todosDias = real ? diasAbertos(real, agora, 60) : null
  const dias = real ? todosDias.slice(0, qtdDias) : diasDeAtendimento(agora)
  const temMaisDias = real ? todosDias.length > qtdDias : false
  const ocupDia = real && dia ? ocup[dia] : null
  const horas = (() => {
    if (!dia || !prof) return []
    if (!real) return horariosDoDia(dia, prof.id, agora)
    if (!ocupDia || ocupDia.estado !== 'ok') return []
    return horariosReais({
      config: real, servico, profissionais: real.profissionais, profissionalId: prof.id, dia, ocupacao: ocupDia.itens, agora,
    })
  })()
  const algumLivre = horas.some((h) => h.livre)

  const ir = (para) => {
    if (para === etapa) return
    const s = para > etapa ? 1 : -1
    setSentido(s)
    if (reduzido()) { setEtapa(para); return }
    setSaindo(true)
    depois(170, () => { setEtapa(para); setSaindo(false) })
  }
  useEffect(() => { irAtual.current = ir })

  const escolherServico = (s) => { setServico(s); depois(reduzido() ? 0 : PAUSA_ESCOLHA_MS, () => ir(1)) }
  const escolherProf = (p) => {
    if (prof && prof.id !== p.id) setHora(null)
    setProf(p)
    depois(reduzido() ? 0 : PAUSA_ESCOLHA_MS, () => ir(2))
  }
  const buscarOcupacao = useCallback((d) => {
    setOcup((o) => ({ ...o, [d]: { estado: 'carregando', itens: [] } }))
    return lerOcupacao(slug, d).then((r) => {
      setOcup((o) => ({ ...o, [d]: r.ok ? { estado: 'ok', itens: r.dados } : { estado: 'erro', itens: [] } }))
    })
  }, [slug])
  const escolherDia = (d) => {
    setDia(d); setHora(null); setAviso('')
    if (real) { setAgora(new Date()); buscarOcupacao(d) }
  }

  const podeAvancar = [!!servico, !!prof, !!hora, !enviando][etapa]
  const avancar = () => (etapa < 3 ? ir(etapa + 1) : real ? confirmarReal() : confirmar())

  const quemAtende = () => (prof.id === QUALQUER ? profissionalDoHorario(dia, QUALQUER, hora) : prof.id)
  const nomeDoBarbeiro = (id) => PROFISSIONAIS_EXEMPLO.find((p) => p.id === id)?.nome ?? ''
  // No modo real, "quem estiver livre" so e decidido pelo banco na hora de gravar
  const barbeiroNoResumo = () => (real ? prof.nome : prof.id === QUALQUER ? nomeDoBarbeiro(quemAtende()) : prof.nome)

  function confirmar() {
    const r = validarContato({ nome, telefone })
    if (!r.ok) {
      setErro(r)
      ;(r.campo === 'nome' ? campoNome : campoTel).current?.focus()
      return
    }
    setErro(null)
    setMarcado({ servico, dia, hora, barbeiro: nomeDoBarbeiro(quemAtende()), primeiroNome: nome.trim().split(' ')[0] })
    ir(4)
  }

  async function confirmarReal() {
    const r = validarContato({ nome, telefone })
    if (!r.ok) {
      setErro(r)
      ;(r.campo === 'nome' ? campoNome : campoTel).current?.focus()
      return
    }
    if (!consentimento) {
      setErro({ campo: 'consentimento', mensagem: 'Marque a caixa para concordar com o uso do seu nome e telefone.' })
      return
    }
    if (!token) {
      setErro({ campo: null, mensagem: 'Aguarde a verificação de segurança terminar e tente de novo.' })
      return
    }
    setErro(null)
    setEnviando(true)
    const res = await chamarFuncao({
      acao: 'agendar', slug, servico_id: servico.id, profissional_id: prof.id === QUALQUER ? null : prof.id,
      inicio: new Date(instanteNoFuso(dia, hora, fuso)).toISOString(),
      nome: nome.trim(), telefone: digitosTelefone(telefone), consentimento: true, turnstile_token: token,
    })
    setEnviando(false)
    setToken(null) // cada token vale uma vez so
    setReinicioTs((n) => n + 1)
    if (res.ok) {
      const d = res.dados
      setMarcado({
        id: d.id, servico: { nome: d.servico, duracao_min: d.duracao_min, preco: d.preco }, dia, hora, barbeiro: d.profissional,
        primeiroNome: nome.trim().split(' ')[0], cancelarAte: d.cancelar_ate ?? null, telefone: digitosTelefone(telefone),
      })
      setCancelamento(null)
      ir(4)
      return
    }
    if (ERROS_QUE_PEDEM_OUTRO_HORARIO.includes(res.erro)) {
      // O horario sumiu entre a escolha e a confirmacao: atualiza o dia e volta para escolher outro
      setHora(null)
      setAviso(res.mensagem)
      buscarOcupacao(dia)
      ir(2)
      return
    }
    setErro({ campo: null, mensagem: res.mensagem })
  }

  const cancelarReal = async () => {
    setCancelamento('enviando')
    const res = await chamarFuncao({ acao: 'cancelar', slug, agendamento_id: marcado.id, telefone: marcado.telefone })
    setCancelamento(res.ok ? 'feito' : { mensagem: res.mensagem })
  }

  const copiarLinkCancelar = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/cancelar/${slug}/${marcado.id}`
    try { await navigator.clipboard.writeText(url); setLinkCopiado(true) } catch { setLinkCopiado(false) }
  }

  const dadosCalendario = () => ({
    dia: marcado.dia, hora: marcado.hora, duracao_min: marcado.servico.duracao_min,
    titulo: `${marcado.servico.nome} - ${barbearia.nome}`, local: barbearia.bairro ? `${barbearia.nome}, ${barbearia.bairro}` : barbearia.nome,
  })

  // Abre o Google Agenda (app no celular, site no computador) com o horario ja preenchido
  const salvarNoCalendario = () => {
    const url = linkGoogleAgenda({
      ...dadosCalendario(), fuso,
      detalhes: real ? `Para cancelar: ${window.location.origin}${window.location.pathname}#/cancelar/${slug}/${marcado.id}` : '',
    })
    window.open(url, '_blank', 'noopener')
  }

  const reiniciar = () => {
    setServico(null); setProf(null); setDia(null); setHora(null); setNome(''); setTelefone(''); setErro(null); setMarcado(null)
    setConsentimento(false); setCancelamento(null); setLinkCopiado(false); setAviso('')
    ir(0)
  }

  const painel = (n) => `pub-painel${n === etapa ? (saindo ? ' sai' : ' entra') : ''}`
  const estiloPainel = { '--dx': `${(saindo ? -28 : 36) * sentido}px` }

  return (
    <div className="pub">
      <div className="pub-fita" aria-hidden="true"><i /></div>
      <header className="pub-topo">
        <div className="pub-wrap">
          <div className="pub-marca"><span className="pub-mini" aria-hidden="true"><i /></span>{barbearia.nome.replace(/^Barbearia\s+/i, '')}</div>
        </div>
      </header>
      {!real && <p className="pub-aviso" role="note">Prévia com dados de exemplo. Nenhum horário é reservado de verdade.</p>}

      <main>
        <section className="pub-hero">
          <div className="pub-wrap">
            <div className="pub-hero-texto">
              <h1 aria-label="Corte marcado em 3 toques.">
                <span className="pub-ln" aria-hidden="true"><span>Corte</span></span>
                <span className="pub-ln" aria-hidden="true"><span>marcado em</span></span>
                <span className="pub-ln" aria-hidden="true"><span>3 toques.</span></span>
              </h1>
              <p className="pub-lead">{real ? 'Escolha o serviço, o barbeiro e o horário. A confirmação aparece na hora e nada de fila.' : 'Escolha o serviço, o barbeiro e o horário. Lembrete no seu WhatsApp e nada de fila.'}</p>
              <div className="pub-cta">
                <button type="button" className="pub-btn" onClick={irParaAgendar}>Agendar horário</button>
                {!real && <button type="button" className="pub-link" onClick={irParaVantagens}>Por que usar o app</button>}
              </div>
              <div className="pub-livre"><span className="pub-ponto" aria-hidden="true" /><span>{textoProximo}</span></div>
            </div>
            <div className="pub-poste" aria-hidden="true">
              <div className="pub-tampa" /><div className="pub-vidro"><i /></div><div className="pub-tampa base" />
            </div>
          </div>
        </section>

        <section className="pub-agendar" ref={secao} aria-labelledby="pub-t-agendar">
          <div className="pub-wrap">
            <h2 id="pub-t-agendar">Agende em menos de um minuto</h2>
            <p className="pub-sub">{barbearia.nome}{barbearia.bairro ? `, ${barbearia.bairro}` : ''}. {real ? `${descricaoExpediente(real)}.` : 'Segunda a sábado, das 9h às 20h.'}</p>
            <div className="pub-cartao" ref={cartao}>
              <div className="pub-etapas">
                <ol className="pub-lista" aria-label="Etapas do agendamento">
                {ETAPAS.map((rotulo, i) => (
                  <li key={rotulo}>
                    <button
                      type="button" disabled={i >= etapa || etapa === 4} onClick={() => ir(i)}
                      className={i === etapa ? 'atual' : i < etapa ? 'feita' : ''} aria-current={i === etapa ? 'step' : undefined}
                    >
                      <b>{i < etapa ? '✓' : i + 1}</b>{rotulo}
                    </button>
                  </li>
                ))}
                </ol>
                <div className="pub-barra" style={{ width: `${(Math.min(etapa, 3) / 3) * 100}%` }} aria-hidden="true"><i /></div>
              </div>

              <div className="pub-palco">
                {etapa === 0 && (
                  <section className={painel(0)} style={estiloPainel}>
                    <h3 ref={titulo} tabIndex={-1}>O que vamos fazer hoje?</h3>
                    <p className="pub-dica">Toque em um serviço para continuar.</p>
                    <div className="pub-opcoes">
                      {servicos.length === 0 && <p className="pub-vazio">Esta barbearia ainda não cadastrou serviços.</p>}
                      {servicos.map((s) => (
                        <button key={s.id} type="button" className="pub-opcao" aria-pressed={servico?.id === s.id} onClick={() => escolherServico(s)}>
                          <span>
                            <strong>{s.nome}{s.destaque && <span className="pub-tag">{s.destaque}</span>}</strong>
                            <small>{s.descricao} - {s.duracao_min} min</small>
                          </span>
                          <span className="pub-preco">{moeda(s.preco)}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {etapa === 1 && (
                  <section className={painel(1)} style={estiloPainel}>
                    <h3 ref={titulo} tabIndex={-1}>Com quem você prefere?</h3>
                    <p className="pub-dica">Sem preferência? Mostramos o horário mais cedo entre todos.</p>
                    <div className="pub-opcoes duas">
                      {profissionais.map((p) => (
                        <button key={p.id} type="button" className="pub-opcao" aria-pressed={prof?.id === p.id} onClick={() => escolherProf(p)}>
                          <span className="pub-esq">
                            <span className="pub-avatar" aria-hidden="true">{p.inicial}</span>
                            <span><strong>{p.nome}</strong>{p.apoio && <small>{p.apoio}</small>}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {etapa === 2 && (
                  <section className={painel(2)} style={estiloPainel}>
                    <h3 ref={titulo} tabIndex={-1}>Escolha dia e horário</h3>
                    <p className="pub-dica">Horários riscados já foram reservados.</p>
                    {aviso && <p className="pub-erro" role="alert">{aviso}</p>}
                    <div className="pub-dias" role="group" aria-label="Dias">
                      {dias.map((d) => (
                        <button key={d} type="button" className="pub-dia" aria-pressed={dia === d} onClick={() => escolherDia(d)}>
                          <span>{rotuloCurto(d, agora)}</span><b>{diaDoMes(d)}</b>
                        </button>
                      ))}
                    </div>
                    {temMaisDias && <button type="button" className="pub-mais" onClick={() => setQtdDias((n) => n + 7)}>Ver mais dias</button>}
                    {!dia && <p className="pub-vazio">Escolha um dia para ver os horários.</p>}
                    {dia && ocupDia?.estado === 'carregando' && <p className="pub-vazio" role="status">Carregando horários...</p>}
                    {dia && ocupDia?.estado === 'erro' && (
                      <p className="pub-vazio" role="alert">
                        Não foi possível carregar os horários. <button type="button" className="pub-link" onClick={() => buscarOcupacao(dia)}>Tentar de novo</button>
                      </p>
                    )}
                    {dia && (!real || ocupDia?.estado === 'ok') && !algumLivre && <p className="pub-vazio">Sem horários nesse dia. Escolha outro dia ou outro barbeiro.</p>}
                    {dia && algumLivre && (
                      <div className="pub-horas" role="group" aria-label={`Horários de ${rotuloLongo(dia)}`} key={`${dia}-${prof.id}`}>
                        {horas.map((h, i) => (
                          <button
                            key={h.hora} type="button" className="pub-hora" disabled={!h.livre} aria-pressed={hora === h.hora}
                            style={{ '--i': Math.min(i, 18) }} onClick={() => { setHora(h.hora); setAviso('') }}
                          >{h.hora}</button>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {etapa === 3 && (
                  <section className={painel(3)} style={estiloPainel}>
                    <h3 ref={titulo} tabIndex={-1}>Confira e confirme</h3>
                    <p className="pub-dica">{real ? 'Seu horário é confirmado na hora, nesta tela.' : 'Enviaremos a confirmação e o lembrete para o seu WhatsApp.'}</p>
                    <dl className="pub-resumo">
                      <div><dt>Serviço</dt><dd>{servico.nome}</dd></div>
                      <div><dt>Barbeiro</dt><dd>{barbeiroNoResumo()}</dd></div>
                      <div><dt>Quando</dt><dd>{rotuloLongo(dia)}, {hora}</dd></div>
                      <div className="total"><dt>Total no balcão</dt><dd>{moeda(servico.preco)}</dd></div>
                    </dl>
                    <label className={`pub-campo${erro?.campo === 'nome' ? ' ruim' : ''}`}>
                      <span>Seu nome</span>
                      <input
                        ref={campoNome} value={nome} autoComplete="name" placeholder="Como devemos te chamar?"
                        aria-invalid={erro?.campo === 'nome'} onChange={(e) => { setNome(e.target.value); setErro(null) }}
                      />
                    </label>
                    <label className={`pub-campo${erro?.campo === 'telefone' ? ' ruim' : ''}`}>
                      <span>WhatsApp com DDD</span>
                      <input
                        ref={campoTel} value={telefone} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={15}
                        placeholder="(21) 99999-0000"
                        aria-invalid={erro?.campo === 'telefone'} onChange={(e) => { setTelefone(formatarTelefone(e.target.value)); setErro(null) }}
                      />
                    </label>
                    {real && (
                      <>
                        <label className={`pub-aceite${erro?.campo === 'consentimento' ? ' ruim' : ''}`}>
                          <input type="checkbox" checked={consentimento} onChange={(e) => { setConsentimento(e.target.checked); setErro(null) }} />
                          <span>Concordo em informar meu nome e WhatsApp à {barbearia.nome}. Eles serão usados só para este agendamento.</span>
                        </label>
                        <Turnstile
                          siteKey={CHAVE_TURNSTILE} reinicio={reinicioTs} onToken={setToken}
                          onFalha={() => setErro({ campo: null, mensagem: 'Não foi possível carregar a verificação de segurança. Recarregue a página.' })}
                        />
                      </>
                    )}
                    <p className="pub-erro" role="alert">{erro?.mensagem ?? ''}</p>
                  </section>
                )}

                {etapa === 4 && marcado && (
                  <section className={painel(4)} style={estiloPainel}>
                    <div className="pub-bilhete-area" role="status">
                      <svg className="pub-tesoura" viewBox="0 0 96 56" aria-hidden="true">
                        <g className="a"><path d="M48 28 L90 8" stroke="#12243E" strokeWidth="5" strokeLinecap="round" /><circle cx="20" cy="42" r="10" fill="none" stroke="#C8202F" strokeWidth="5" /><path d="M27 36 L48 28" stroke="#12243E" strokeWidth="5" strokeLinecap="round" /></g>
                        <g className="b"><path d="M48 28 L90 48" stroke="#AEB8C2" strokeWidth="5" strokeLinecap="round" /><circle cx="20" cy="14" r="10" fill="none" stroke="#C8202F" strokeWidth="5" /><path d="M27 20 L48 28" stroke="#AEB8C2" strokeWidth="5" strokeLinecap="round" /></g>
                        <circle cx="48" cy="28" r="4" fill="#12243E" />
                      </svg>
                      <div className="pub-bilhete">
                        <div className="pub-b-corpo">
                          <h3 ref={titulo} tabIndex={-1}>{cancelamento === 'feito' ? `${marcado.primeiroNome}, horário cancelado.` : `${marcado.primeiroNome}, está marcado!`}</h3>
                          <p>{marcado.servico.nome} com {marcado.barbeiro}</p>
                          <p><strong>{rotuloLongo(marcado.dia)}</strong></p>
                          <span className="pub-carimbo">{cancelamento === 'feito' ? 'Cancelado' : 'Confirmado'}</span>
                        </div>
                        <div className="pub-b-canhoto"><div><b>{marcado.hora}</b><small>chegue 5 min antes</small></div></div>
                      </div>
                      <div className="pub-apos">
                        {cancelamento !== 'feito' && <button type="button" className="pub-btn azul" onClick={salvarNoCalendario}>Salvar no Google Agenda</button>}
                        <button type="button" className="pub-fantasma" onClick={reiniciar}>Agendar outro</button>
                      </div>
                      {real && cancelamento !== 'feito' && (
                        <div className="pub-cancelar">
                          {marcado.cancelarAte && (
                            <p>Você pode cancelar por aqui até {rotuloLongo(partesNoFuso(marcado.cancelarAte, fuso).dia)}, {partesNoFuso(marcado.cancelarAte, fuso).hora}.</p>
                          )}
                          {cancelamento === null && (
                            <div className="pub-apos">
                              <button type="button" className="pub-link" onClick={() => setCancelamento('confirmar')}>Cancelar este horário</button>
                              <button type="button" className="pub-link" onClick={copiarLinkCancelar}>{linkCopiado ? 'Link copiado' : 'Copiar link para cancelar depois'}</button>
                            </div>
                          )}
                          {(cancelamento === 'confirmar' || cancelamento === 'enviando' || cancelamento?.mensagem) && (
                            <div className="pub-apos">
                              <button type="button" className="pub-btn" disabled={cancelamento === 'enviando'} onClick={cancelarReal}>
                                {cancelamento === 'enviando' ? 'Cancelando...' : 'Sim, cancelar'}
                              </button>
                              <button type="button" className="pub-fantasma" disabled={cancelamento === 'enviando'} onClick={() => setCancelamento(null)}>Manter horário</button>
                            </div>
                          )}
                          {cancelamento?.mensagem && <p className="pub-erro" role="alert">{cancelamento.mensagem}</p>}
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {etapa < 4 && (
                  <div className="pub-nav">
                    {etapa > 0 ? <button type="button" className="pub-voltar" onClick={() => ir(etapa - 1)}>Voltar</button> : <span />}
                    <button type="button" className="pub-btn" disabled={!podeAvancar} onClick={avancar}>
                      {etapa === 3 ? (enviando ? 'Confirmando...' : 'Confirmar horário') : 'Continuar'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {!real && (
        <section className="pub-vantagens" id="pub-vantagens" aria-labelledby="pub-t-vantagens">
          <div className="pub-wrap">
            <h2 id="pub-t-vantagens" ref={refTitulo} className={`pub-revela${tituloVisivel}`}>Quem agenda pelo app ganha mais</h2>
            <div className="pub-grade">
              <article ref={refPerk1} className={`pub-vantagem pub-revela${perk1}`}>
                <svg viewBox="0 0 44 44" fill="none" stroke="#12243E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 4a18 18 0 1 0 0 36l-7 2 2-7A18 18 0 0 0 22 4z" /><path d="M15 17c1 6 5 10 11 11l2-3-4-2-2 2c-2-1-3-3-4-5l2-2-2-4z" fill="#C8202F" stroke="none" /></svg>
                <h3>Lembrete no WhatsApp</h3>
                <p>Aviso no dia anterior e duas horas antes. Se precisar remarcar, é só responder.</p>
              </article>
              <article ref={refPerk2} className={`pub-vantagem pub-revela${perk2}`}>
                <svg viewBox="0 0 44 44" fill="none" stroke="#12243E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="22" cy="22" r="17" /><path d="M22 11v11l8 5" stroke="#C8202F" /></svg>
                <h3>Lista de espera</h3>
                <p>O horário que você queria lotou? Entre na lista e avisamos assim que alguém desmarcar.</p>
              </article>
              <article ref={refPerk3} className={`pub-vantagem pub-revela${perk3}`}>
                <svg viewBox="0 0 44 44" fill="none" stroke="#12243E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 14h28v20H8z" /><path d="M8 20h28" stroke="#C8202F" /></svg>
                <h3>Cartão fidelidade</h3>
                <p>A cada corte um selo. No décimo, o corte é por nossa conta.</p>
                <div className="pub-selos" role="img" aria-label="Exemplo: 6 de 10 selos">
                  {Array.from({ length: 10 }, (_, i) => <i key={i} style={{ '--i': i }} />)}
                </div>
              </article>
            </div>
          </div>
        </section>
        )}
      </main>

      <footer className="pub-rodape">
        <div className="pub-wrap"><span>{barbearia.nome} - {barbearia.bairro ? `${barbearia.bairro}, ` : ''}Rio de Janeiro</span><span>Agenda por Barbeiro Inteligente</span></div>
      </footer>

      <div className={`pub-fixo${fixo ? ' mostra' : ''}`} aria-hidden={!fixo}>
        <button type="button" className="pub-btn" tabIndex={fixo ? 0 : -1} onClick={irParaAgendar}>Agendar horário</button>
      </div>
    </div>
  )
}
