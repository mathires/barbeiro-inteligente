// Splash de abertura: o HTML do index.html cobre a tela ate o app ter o que mostrar.
// Some com fade quando a sessao e os dados iniciais resolvem (ver App.jsx).
let escondida = false

export function esconderSplash() {
  if (escondida) return
  escondida = true
  const el = document.getElementById('splash')
  if (!el) return
  el.classList.add('sair')
  setTimeout(() => el.remove(), 300)
}
