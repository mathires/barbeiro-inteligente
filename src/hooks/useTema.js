// Tema claro/escuro: segue o aparelho e lembra a escolha do usuario neste navegador
export function aplicarTemaSalvo() {
  try {
    const t = localStorage.getItem('bi-theme')
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t
  } catch { /* sem armazenamento: segue o tema do aparelho */ }
}

export function alternarTema() {
  const r = document.documentElement
  const escuro = r.dataset.theme ? r.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  const novo = escuro ? 'light' : 'dark'
  r.dataset.theme = novo
  try { localStorage.setItem('bi-theme', novo) } catch { /* ignora */ }
}
