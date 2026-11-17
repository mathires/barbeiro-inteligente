import { useEffect, useRef, useState } from 'react'
import '../publico.css'
import { moeda, hojeISO } from '../lib/formato.js'
import { somarDias } from '../lib/agenda.js'
import {
  SERVICOS_EXEMPLO, PROFISSIONAIS_EXEMPLO, QUALQUER, horariosDoDia, diasDeAtendimento, proximoHorarioLivre,
  profissionalDoHorario, rotuloCurto, rotuloLongo, diaDoMes, validarContato, gerarICS,
} from '../lib/publico.js'

// Pagina publica de agendamento (rota #/agendar, sem login). Por enquanto SO VISUAL: usa dados de exemplo
// de lib/publico.js e nao grava nada. Quando for ligada ao Supabase, troque as constantes pelas consultas.
const BARBEARIA_EXEMPLO = { nome: 'Barbearia Poste Vermelho', bairro: 'Recreio dos Bandeirantes' }
const ETAPAS = ['Serviço', 'Barbeiro', 'Horário', 'Confirmar']
const reduzido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

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

export default function AgendarPublico({ barbearia = BARBEARIA_EXEMPLO }) {
  const [agora] = useState(() => new Date())
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

  const secao = useRef(null)
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
  const depois = (ms, fn) => { timers.current.push(setTimeout(fn, ms)) }

  // Foco no titulo da etapa nova (leitor de tela anuncia a mudanca); nao na primeira pintura
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return }
    titulo.current?.focus({ preventScroll: true })
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

  const proximo = proximoHorarioLivre(agora)
  const textoProximo = (() => {
    if (!proximo) return 'Sem horários livres nos próximos dias'
    const hoje = hojeISO(agora)
    const quando = proximo.dia === hoje ? 'hoje' : proximo.dia === somarDias(hoje, 1) ? 'amanhã' : `${rotuloCurto(proximo.dia, agora)} ${diaDoMes(proximo.dia)}`
    return `Próximo horário livre: ${quando}, ${proximo.hora}`
  })()

  const dias = diasDeAtendimento(agora)
  const horas = dia && prof ? horariosDoDia(dia, prof.id, agora) : []
  const algumLivre = horas.some((h) => h.livre)

  const ir = (para) => {
    if (para === etapa) return
    const s = para > etapa ? 1 : -1
    setSentido(s)
    if (reduzido()) { setEtapa(para); return }
    setSaindo(true)
    depois(170, () => { setEtapa(para); setSaindo(false) })
  }

  const escolherServico = (s) => { setServico(s); depois(reduzido() ? 0 : 320, () => ir(1)) }
  const escolherProf = (p) => {
    if (prof && prof.id !== p.id) setHora(null)
    setProf(p)
    depois(reduzido() ? 0 : 320, () => ir(2))
  }
  const escolherDia = (d) => { setDia(d); setHora(null) }

  const podeAvancar = [!!servico, !!prof, !!hora, true][etapa]
  const avancar = () => (etapa < 3 ? ir(etapa + 1) : confirmar())

  const quemAtende = () => (prof.id === QUALQUER ? profissionalDoHorario(dia, QUALQUER, hora) : prof.id)
  const nomeDoBarbeiro = (id) => PROFISSIONAIS_EXEMPLO.find((p) => p.id === id)?.nome ?? ''

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

  const salvarNoCalendario = () => {
    const ics = gerarICS({
      dia: marcado.dia, hora: marcado.hora, duracao_min: marcado.servico.duracao_min,
      titulo: `${marcado.servico.nome} - ${barbearia.nome}`, local: `${barbearia.nome}, ${barbearia.bairro}`,
    })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'horario-barbearia.ics'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const reiniciar = () => {
    setServico(null); setProf(null); setDia(null); setHora(null); setNome(''); setTelefone(''); setErro(null); setMarcado(null)
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
          <button type="button" className="pub-fantasma" onClick={irParaAgendar}>Agendar</button>
        </div>
      </header>
      <p className="pub-aviso" role="note">Prévia com dados de exemplo. Nenhum horário é reservado de verdade.</p>

      <main>
        <section className="pub-hero">
          <div className="pub-wrap">
            <div className="pub-hero-texto">
              <h1 aria-label="Corte marcado em 3 toques.">
                <span className="pub-ln" aria-hidden="true"><span>Corte</span></span>
                <span className="pub-ln" aria-hidden="true"><span>marcado em</span></span>
                <span className="pub-ln" aria-hidden="true"><span>3 toques.</span></span>
              </h1>
              <p className="pub-lead">Escolha o serviço, o barbeiro e o horário. Lembrete no seu WhatsApp e nada de fila.</p>
              <div className="pub-cta">
                <button type="button" className="pub-btn" onClick={irParaAgendar}>Agendar horário</button>
                <button type="button" className="pub-link" onClick={irParaVantagens}>Por que usar o app</button>
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
            <p className="pub-sub">{barbearia.nome}, {barbearia.bairro}. Segunda a sábado, das 9h às 20h.</p>
            <div className="pub-cartao">
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
                      {SERVICOS_EXEMPLO.map((s) => (
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
                      {PROFISSIONAIS_EXEMPLO.map((p) => (
                        <button key={p.id} type="button" className="pub-opcao" aria-pressed={prof?.id === p.id} onClick={() => escolherProf(p)}>
                          <span className="pub-esq">
                            <span className="pub-avatar" aria-hidden="true">{p.inicial}</span>
                            <span><strong>{p.nome}</strong><small>{p.apoio}</small></span>
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
                    <div className="pub-dias" role="group" aria-label="Dias">
                      {dias.map((d) => (
                        <button key={d} type="button" className="pub-dia" aria-pressed={dia === d} onClick={() => escolherDia(d)}>
                          <span>{rotuloCurto(d, agora)}</span><b>{diaDoMes(d)}</b>
                        </button>
                      ))}
                    </div>
                    {!dia && <p className="pub-vazio">Escolha um dia para ver os horários.</p>}
                    {dia && !algumLivre && <p className="pub-vazio">Sem horários nesse dia. Escolha outro dia ou outro barbeiro.</p>}
                    {dia && algumLivre && (
                      <div className="pub-horas" role="group" aria-label={`Horários de ${rotuloLongo(dia)}`} key={`${dia}-${prof.id}`}>
                        {horas.map((h, i) => (
                          <button
                            key={h.hora} type="button" className="pub-hora" disabled={!h.livre} aria-pressed={hora === h.hora}
                            style={{ '--i': Math.min(i, 18) }} onClick={() => setHora(h.hora)}
                          >{h.hora}</button>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {etapa === 3 && (
                  <section className={painel(3)} style={estiloPainel}>
                    <h3 ref={titulo} tabIndex={-1}>Confira e confirme</h3>
                    <p className="pub-dica">Enviaremos a confirmação e o lembrete para o seu WhatsApp.</p>
                    <dl className="pub-resumo">
                      <div><dt>Serviço</dt><dd>{servico.nome}</dd></div>
                      <div><dt>Barbeiro</dt><dd>{prof.id === QUALQUER ? nomeDoBarbeiro(quemAtende()) : prof.nome}</dd></div>
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
                        ref={campoTel} value={telefone} type="tel" inputMode="tel" autoComplete="tel" placeholder="(21) 99999-0000"
                        aria-invalid={erro?.campo === 'telefone'} onChange={(e) => { setTelefone(e.target.value); setErro(null) }}
                      />
                    </label>
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
                          <h3 ref={titulo} tabIndex={-1}>{marcado.primeiroNome}, está marcado!</h3>
                          <p>{marcado.servico.nome} com {marcado.barbeiro}</p>
                          <p><strong>{rotuloLongo(marcado.dia)}</strong></p>
                          <span className="pub-carimbo">Confirmado</span>
                        </div>
                        <div className="pub-b-canhoto"><div><b>{marcado.hora}</b><small>chegue 5 min antes</small></div></div>
                      </div>
                      <div className="pub-apos">
                        <button type="button" className="pub-btn azul" onClick={salvarNoCalendario}>Salvar no calendário</button>
                        <button type="button" className="pub-fantasma" onClick={reiniciar}>Agendar outro</button>
                      </div>
                    </div>
                  </section>
                )}

                {etapa < 4 && (
                  <div className="pub-nav">
                    {etapa > 0 ? <button type="button" className="pub-voltar" onClick={() => ir(etapa - 1)}>Voltar</button> : <span />}
                    <button type="button" className="pub-btn" disabled={!podeAvancar} onClick={avancar}>
                      {etapa === 3 ? 'Confirmar horário' : 'Continuar'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

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
      </main>

      <footer className="pub-rodape">
        <div className="pub-wrap"><span>{barbearia.nome} - {barbearia.bairro}, Rio de Janeiro</span><span>Agenda por Barbeiro Inteligente</span></div>
      </footer>

      <div className={`pub-fixo${fixo ? ' mostra' : ''}`} aria-hidden={!fixo}>
        <button type="button" className="pub-btn" tabIndex={fixo ? 0 : -1} onClick={irParaAgendar}>Agendar horário</button>
      </div>
    </div>
  )
}
