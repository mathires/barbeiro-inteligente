import { useEffect, useState } from 'react'
import '../publico.css'
import { digitosTelefone, formatarTelefone } from '../lib/publico.js'
import { lerBarbearia, chamarFuncao } from '../lib/publicoApi.js'

// Cancelamento pelo link (#/cancelar/<slug>/<id-do-agendamento>). O id e impossivel de adivinhar
// e o servidor ainda exige o telefone de quem agendou; o prazo de cancelamento e conferido no banco.
export default function CancelarPublico({ slug, id }) {
  const [nomeBarbearia, setNomeBarbearia] = useState('')
  const [telefone, setTelefone] = useState('')
  const [fase, setFase] = useState('form') // form | enviando | feito
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    lerBarbearia(slug).then((r) => { if (vivo && r.ok && r.dados) setNomeBarbearia(r.dados.nome) })
    return () => { vivo = false }
  }, [slug])

  async function cancelar(e) {
    e.preventDefault()
    const d = digitosTelefone(telefone)
    if (!/^[1-9][1-9]9\d{8}$/.test(d)) { setErro('Informe o WhatsApp com DDD e 9 dígitos, por exemplo (21) 99999-0000.'); return }
    setErro('')
    setFase('enviando')
    const r = await chamarFuncao({ acao: 'cancelar', slug, agendamento_id: id, telefone: d })
    if (r.ok) setFase('feito')
    else { setErro(r.mensagem); setFase('form') }
  }

  return (
    <div className="pub">
      <div className="pub-fita" aria-hidden="true"><i /></div>
      <main className="pub-wrap pub-estado">
        {fase === 'feito' ? (
          <div role="status">
            <h1>Horário cancelado.</h1>
            <p>Obrigado por avisar. Quando quiser, é só marcar outro horário.</p>
            <a className="pub-btn" href={`#/agendar/${slug}`}>Agendar outro horário</a>
          </div>
        ) : (
          <form onSubmit={cancelar} noValidate>
            <h1>Cancelar horário</h1>
            <p>{nomeBarbearia ? `${nomeBarbearia}. ` : ''}Para confirmar que o horário é seu, informe o WhatsApp usado no agendamento.</p>
            <label className={`pub-campo${erro ? ' ruim' : ''}`}>
              <span>WhatsApp com DDD</span>
              <input
                value={telefone} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={15} placeholder="(21) 99999-0000"
                aria-invalid={Boolean(erro)} onChange={(e) => { setTelefone(formatarTelefone(e.target.value)); setErro('') }}
              />
            </label>
            <p className="pub-erro" role="alert">{erro}</p>
            <button type="submit" className="pub-btn" disabled={fase === 'enviando'}>{fase === 'enviando' ? 'Cancelando...' : 'Cancelar horário'}</button>
          </form>
        )}
      </main>
    </div>
  )
}
