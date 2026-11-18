import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Cabecalho, Aviso, Dica } from '../components/ui.jsx'
import { useToast } from '../hooks/useToast.jsx'
import { TURNSTILE_EM_TESTE } from '../lib/publicoApi.js'
import {
  PASSOS, DIAS_SEMANA, formDoBanco, validarConfig, mensagemDoErro, sugerirSlug, linkPublico, textoWhatsApp, pendencias,
} from '../lib/agendamentoOnline.js'

const COLUNAS = 'id, nome, slug, agendamento_online, abertura, fechamento, passo_min, dias_atendimento, antecedencia_min, cancelamento_ate_min, janela_dias'

// Tela do dono: liga o link publico de agendamento, define as regras e copia o texto para o WhatsApp Business.
export default function AgendamentoOnline({ barbeariaId }) {
  const [barbearia, setBarbearia] = useState(null)
  const [f, setF] = useState(null)
  const [contagem, setContagem] = useState({ profissionais: 0, servicos: 0 })
  const [erro, setErro] = useState('')
  const [campoRuim, setCampoRuim] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [copiado, setCopiado] = useState('')
  const [toast, avisar] = useToast()

  const carregar = useCallback(async () => {
    setErro('')
    const [b, p, s] = await Promise.all([
      supabase.from('barbearias').select(COLUNAS).eq('id', barbeariaId).single(),
      supabase.from('profissionais').select('id').eq('barbearia_id', barbeariaId).eq('ativo', true),
      supabase.from('servicos').select('id').eq('barbearia_id', barbeariaId).eq('ativo', true),
    ])
    if (b.error || !b.data) { setErro('Não foi possível carregar as configurações.'); return }
    setBarbearia(b.data)
    setF(formDoBanco(b.data))
    setContagem({ profissionais: (p.data ?? []).length, servicos: (s.data ?? []).length })
  }, [barbeariaId])

  useEffect(() => { carregar() }, [carregar])

  if (!f) {
    return (
      <div className="wrap">
        <Cabecalho titulo="Agendamento online" sub="Link para o cliente marcar horário sozinho" />
        <Aviso erro={erro} />
        {!erro && <p className="card card-b muted" role="status">Carregando...</p>}
      </div>
    )
  }

  const mudar = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setCampoRuim('') }
  const alternarDia = (n) => setF((x) => ({ ...x, dias: x.dias.includes(n) ? x.dias.filter((d) => d !== n) : [...x.dias, n] }))

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    const r = validarConfig(f)
    if (!r.ok) { setErro(r.mensagem); setCampoRuim(r.campo); return }
    setSalvando(true)
    const { error } = await supabase.from('barbearias').update(r.valores).eq('id', barbeariaId)
    setSalvando(false)
    if (error) { setErro(mensagemDoErro(error)); return }
    setBarbearia((b) => ({ ...b, ...r.valores }))
    avisar(r.valores.agendamento_online ? 'Salvo. O link está no ar.' : 'Salvo. O agendamento online está desligado.')
  }

  const salvoSlug = barbearia.slug
  const link = salvoSlug ? linkPublico(salvoSlug, window.location.origin) : ''
  const no_ar = Boolean(barbearia.agendamento_online && salvoSlug)
  const faltas = pendencias({
    profissionais: contagem.profissionais, servicos: contagem.servicos, slug: salvoSlug,
    ligado: barbearia.agendamento_online, testeTurnstile: TURNSTILE_EM_TESTE,
  })
  const textoZap = link ? textoWhatsApp({ nome: barbearia.nome, link }) : ''

  async function copiar(chave, texto) {
    try { await navigator.clipboard.writeText(texto); setCopiado(chave); avisar('Copiado.') } catch { setErro('Não foi possível copiar. Selecione o texto e copie manualmente.') }
  }
  const ruim = (c) => (campoRuim === c ? { 'aria-invalid': true } : {})

  return (
    <div className="wrap">
      <Cabecalho titulo="Agendamento online" sub="Link para o cliente marcar horário sozinho" />

      <section className="card" aria-labelledby="ao-status">
        <div className="card-h"><h2 id="ao-status">Seu link</h2></div>
        <div className="card-b" style={{ display: 'grid', gap: 12 }}>
          <p role="status">
            <span className={`pill ${no_ar ? 'done' : 'warn'}`}>{no_ar ? 'No ar' : 'Desligado'}</span>
          </p>
          {link ? (
            <>
              <div className="fld">
                <label htmlFor="ao-link">Endereço para o cliente</label>
                <input id="ao-link" className="inp" readOnly value={link} onFocus={(e) => e.target.select()} />
              </div>
              <div className="frm-actions" style={{ justifyContent: 'flex-start', gap: 8 }}>
                <button type="button" className="btn primary sm" onClick={() => copiar('link', link)}>{copiado === 'link' ? 'Link copiado' : 'Copiar link'}</button>
                <a className="btn ghost sm" href={link} target="_blank" rel="noreferrer">Abrir página</a>
              </div>
            </>
          ) : <p className="muted">Defina o endereço abaixo e salve para gerar o link.</p>}
          {faltas.length > 0 && (
            <Dica titulo="Antes de divulgar" tipo="warn">
              <ul style={{ margin: 0, paddingLeft: 18 }}>{faltas.map((t) => <li key={t}>{t}</li>)}</ul>
            </Dica>
          )}
        </div>
      </section>

      <form className="card" onSubmit={salvar} noValidate aria-labelledby="ao-regras">
        <div className="card-h"><h2 id="ao-regras">Regras</h2></div>
        <div className="card-b frm">
          <div className="fld fld-sw">
            <label htmlFor="ao-ligado">Receber agendamentos online</label>
            <label className="sw">
              <input id="ao-ligado" type="checkbox" checked={f.ligado} onChange={(e) => setF((x) => ({ ...x, ligado: e.target.checked }))} />
              <span />
            </label>
          </div>

          <div className="fld">
            <label htmlFor="ao-slug">Endereço do link</label>
            <input
              id="ao-slug" className="inp" value={f.slug} autoComplete="off" spellCheck="false" placeholder="poste-vermelho"
              onChange={(e) => { setF((x) => ({ ...x, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })); setCampoRuim('') }} {...ruim('slug')}
            />
            {!f.slug && sugerirSlug(barbearia.nome) && (
              <button type="button" className="lnk" style={{ justifySelf: 'start' }} onClick={() => setF((x) => ({ ...x, slug: sugerirSlug(barbearia.nome) }))}>
                Usar &quot;{sugerirSlug(barbearia.nome)}&quot;
              </button>
            )}
            <small className="muted">Só letras minúsculas, números e hífen. Se você mudar depois, o link antigo deixa de funcionar.</small>
          </div>

          <div className="duas">
            <div className="fld"><label htmlFor="ao-abre">Abre às</label><input id="ao-abre" className="inp" type="time" value={f.abertura} onChange={mudar('abertura')} {...ruim('abertura')} /></div>
            <div className="fld"><label htmlFor="ao-fecha">Fecha às</label><input id="ao-fecha" className="inp" type="time" value={f.fechamento} onChange={mudar('fechamento')} /></div>
          </div>

          <div className="fld">
            <label htmlFor="ao-passo">Intervalo entre horários</label>
            <select id="ao-passo" className="inp" value={f.passo_min} onChange={mudar('passo_min')}>
              {PASSOS.map((n) => <option key={n} value={n}>{n} minutos</option>)}
            </select>
          </div>

          <div className="fld" role="group" aria-label="Dias de atendimento">
            <label>Dias de atendimento</label>
            <div className="chips">
              {DIAS_SEMANA.map((d) => (
                <button key={d.n} type="button" className="chip" aria-pressed={f.dias.includes(d.n)} onClick={() => { alternarDia(d.n); setCampoRuim('') }}>{d.rotulo}</button>
              ))}
            </div>
          </div>

          <div className="duas">
            <div className="fld">
              <label htmlFor="ao-ant">Antecedência mínima (min)</label>
              <input id="ao-ant" className="inp" inputMode="numeric" value={f.antecedencia_min} onChange={mudar('antecedencia_min')} {...ruim('antecedencia_min')} />
            </div>
            <div className="fld">
              <label htmlFor="ao-canc">Cliente cancela até (min antes)</label>
              <input id="ao-canc" className="inp" inputMode="numeric" value={f.cancelamento_ate_min} onChange={mudar('cancelamento_ate_min')} {...ruim('cancelamento_ate_min')} />
            </div>
          </div>
          <div className="fld">
            <label htmlFor="ao-janela">Agenda aberta por (dias)</label>
            <input id="ao-janela" className="inp" inputMode="numeric" value={f.janela_dias} onChange={mudar('janela_dias')} {...ruim('janela_dias')} />
            <small className="muted">Os agendamentos entram já confirmados. Você pode cancelar qualquer um pela Agenda.</small>
          </div>

          <Aviso erro={erro} />
          <div className="frm-actions">
            <button className="btn primary" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </form>

      {link && (
        <section className="card" aria-labelledby="ao-zap">
          <div className="card-h"><h2 id="ao-zap">Mensagem para o WhatsApp Business</h2></div>
          <div className="card-b" style={{ display: 'grid', gap: 12 }}>
            <p className="muted">Cole em <b>Ferramentas comerciais &gt; Mensagem de saudação</b> (e, se quiser, em Respostas rápidas). É gratuito e não usa a API do WhatsApp.</p>
            <textarea className="inp ta" rows={4} readOnly value={textoZap} aria-label="Texto da mensagem" onFocus={(e) => e.target.select()} />
            <div className="frm-actions" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="btn primary sm" onClick={() => copiar('zap', textoZap)}>{copiado === 'zap' ? 'Texto copiado' : 'Copiar texto'}</button>
            </div>
          </div>
        </section>
      )}
      {toast}
    </div>
  )
}
