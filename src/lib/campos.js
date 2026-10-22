// Regras puras dos formularios de cadastro (sem React), faceis de testar.

// Aceita "35,50", "1.234,56", "35.50" e "35". Retorna null se vazio ou invalido.
export function lerNumero(texto) {
  if (texto == null) return null
  const s = String(texto).trim()
  if (s === '') return null
  let normal
  if (s.includes(',')) normal = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d+\.\d{1,2}$/.test(s)) normal = s // "35.50" = decimal
  else normal = s.replace(/\./g, '') // "1.234" = milhar
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

// Linha do banco -> estado do formulario (tudo texto, exceto caixas de marcar)
export function formularioInicial(campos, linha) {
  const f = {}
  for (const c of campos) {
    const v = linha?.[c.chave]
    const padrao = typeof c.padrao === 'function' ? c.padrao() : c.padrao
    if (c.tipo === 'booleano') f[c.chave] = linha ? Boolean(v) : (padrao ?? false)
    else if (c.tipo === 'lgpd') f[c.chave] = Boolean(v)
    else if (c.tipo === 'moeda' || c.tipo === 'percentual') f[c.chave] = v == null ? (linha ? '' : String(padrao ?? '')) : String(v).replace('.', ',')
    else f[c.chave] = v == null ? (padrao ?? '') : String(v)
  }
  return f
}

// Estado do formulario -> linha para gravar. Lanca Error com mensagem amigavel.
export function paraLinha(campos, form, original) {
  const row = {}
  for (const c of campos) {
    const v = form[c.chave]
    switch (c.tipo) {
      case 'booleano':
        row[c.chave] = Boolean(v)
        break
      case 'lgpd':
        // marcado: guarda o momento do consentimento (preserva o original); desmarcado: limpa
        row[c.chave] = v ? (original?.[c.chave] ?? new Date().toISOString()) : null
        break
      case 'inteiro': {
        const n = lerNumero(v)
        if (n == null || !Number.isInteger(n)) {
          if (c.obrigatorio) throw new Error(`Informe um número inteiro em "${c.rotulo}".`)
          row[c.chave] = null
        } else {
          checarFaixa(c, n)
          row[c.chave] = n
        }
        break
      }
      case 'moeda':
      case 'percentual': {
        const n = lerNumero(v)
        if (n == null) {
          if (String(v ?? '').trim() !== '' || c.obrigatorio) throw new Error(`Valor inválido em "${c.rotulo}".`)
          row[c.chave] = null
        } else {
          checarFaixa(c, n)
          row[c.chave] = Math.round(n * 100) / 100
        }
        break
      }
      case 'data':
      case 'hora':
      case 'selecao':
        row[c.chave] = v ? v : null
        break
      default: {
        const t = String(v ?? '').trim()
        if (c.obrigatorio && !t) throw new Error(`Preencha "${c.rotulo}".`)
        row[c.chave] = t === '' ? null : t
      }
    }
  }
  return row
}

function checarFaixa(c, n) {
  if (c.min != null && n < c.min) throw new Error(`"${c.rotulo}" deve ser no mínimo ${c.min}.`)
  if (c.max != null && n > c.max) throw new Error(`"${c.rotulo}" deve ser no máximo ${c.max}.`)
}

// Traduz erros do banco para portugues claro
export function mensagemDeErro(error, acao = 'salvar') {
  if (error?.code === '23P01') return 'Esse profissional já tem um atendimento nesse horário.'
  if (error?.code === '23505') return 'Já existe um registro com esse nome.'
  if (error?.code === '23503' && acao === 'excluir') return 'Não é possível excluir: este registro já está em uso (atendimentos ou receitas). Considere desativá-lo.'
  if (error?.code === '23503') return 'Um dos itens escolhidos não existe mais. Atualize a página e tente de novo.'
  return `Não foi possível ${acao}. Tente novamente.`
}
