// Banco de mentira em memoria, com a mesma "cara" do cliente do Supabase.
// Serve para testar a logica do app sem internet. Nao substitui o teste real.
let contador = 0

export function criarBanco(inicial = {}, opcoes = {}) {
  const tabelas = {}
  for (const [nome, linhas] of Object.entries(inicial)) tabelas[nome] = linhas.map((l) => ({ ...l }))
  const log = []
  const falhas = opcoes.falhas ?? {} // ex.: { 'insert:movimentos_estoque': { code: 'X' } }

  function from(nome) {
    const est = { op: 'select', filtros: [], payload: null, ordem: null, quer: false, unico: null }
    const q = {
      select() { est.quer = true; return q },
      insert(p) { est.op = 'insert'; est.payload = p; return q },
      update(p) { est.op = 'update'; est.payload = p; return q },
      delete() { est.op = 'delete'; return q },
      eq(c, v) { est.filtros.push((l) => l[c] === v); return q },
      gte(c, v) { est.filtros.push((l) => l[c] >= v); return q },
      is(c, v) { est.filtros.push((l) => (l[c] ?? null) === v); return q },
      gt(c, v) { est.filtros.push((l) => l[c] > v); return q },
      lt(c, v) { est.filtros.push((l) => l[c] < v); return q },
      lte(c, v) { est.filtros.push((l) => l[c] <= v); return q },
      in(c, vs) { est.filtros.push((l) => vs.includes(l[c])); return q },
      order(c, o = {}) { est.ordem = [c, o.ascending !== false]; return q },
      single() { est.unico = 'single'; return q },
      maybeSingle() { est.unico = 'maybe'; return q },
      then(res, rej) { return Promise.resolve(executar()).then(res, rej) },
    }
    function executar() {
      log.push({ tabela: nome, op: est.op, payload: est.payload })
      const falha = falhas[`${est.op}:${nome}`]
      if (falha) return { data: null, error: falha }
      const lista = (tabelas[nome] ??= [])
      const casa = (l) => est.filtros.every((f) => f(l))
      if (est.op === 'insert') {
        const novas = (Array.isArray(est.payload) ? est.payload : [est.payload]).map((p) => ({ id: `id${++contador}`, ...p }))
        const erro = opcoes.validarInsert?.(nome, novas, lista)
        if (erro) return { data: null, error: erro }
        lista.push(...novas)
        return { data: est.quer ? (est.unico ? novas[0] : novas) : null, error: null }
      }
      if (est.op === 'update') {
        const alvo = lista.filter(casa)
        const erro = opcoes.validarUpdate?.(nome, alvo, est.payload, lista)
        if (erro) return { data: null, error: erro }
        alvo.forEach((l) => Object.assign(l, est.payload))
        return { data: null, error: null }
      }
      if (est.op === 'delete') {
        tabelas[nome] = lista.filter((l) => !casa(l))
        return { data: null, error: null }
      }
      let r = lista.filter(casa).map((l) => ({ ...l }))
      if (est.ordem) {
        const [c, asc] = est.ordem
        r.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1))
      }
      if (est.unico) return { data: r[0] ?? null, error: null }
      return { data: r, error: null }
    }
    return q
  }
  return { sb: { from }, tabelas, log }
}
