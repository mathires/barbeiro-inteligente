// Service worker minimo: deixa o app instalavel e abrir mais rapido.
// IMPORTANTE: so mexe em arquivos do proprio site. Chamadas ao Supabase (outro dominio)
// NUNCA passam por aqui, entao dados de clientes e financeiros nao ficam guardados no cache.
const CACHE = 'bi-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase e outros: direto na rede

  // Paginas: rede primeiro (sempre a versao nova); sem internet, usa a ultima guardada
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put('/', c)); return r })
        .catch(() => caches.match('/')),
    )
    return
  }

  // Arquivos com nome unico (assets/*.js, *.css): cache primeiro
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((r) => {
        const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); return r
      })),
    )
  }
})
