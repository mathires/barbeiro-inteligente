// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = (f) => join(process.cwd(), f)
const largura = (png) => readFileSync(raiz(`public/${png}`)).readUInt32BE(16) // IHDR: largura

describe('splash de abertura', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); document.body.innerHTML = '<div id="splash"></div>' })
  afterEach(() => { vi.useRealTimers() })

  it('faz fade e remove o elemento depois da transicao', async () => {
    const { esconderSplash } = await import('../src/lib/splash.js')
    esconderSplash()
    expect(document.getElementById('splash').classList.contains('sair')).toBe(true)
    vi.advanceTimersByTime(300)
    expect(document.getElementById('splash')).toBe(null)
  })

  it('chamar mais de uma vez nao quebra', async () => {
    const { esconderSplash } = await import('../src/lib/splash.js')
    esconderSplash(); esconderSplash()
    vi.advanceTimersByTime(300)
    expect(document.getElementById('splash')).toBe(null)
  })

  it('sem elemento no DOM (testes, SSR) nao faz nada', async () => {
    document.body.innerHTML = ''
    const { esconderSplash } = await import('../src/lib/splash.js')
    expect(() => esconderSplash()).not.toThrow()
  })
})

describe('identidade visual', () => {
  it('cor do manifest, do theme-color e do fundo da splash sao a mesma (sem quadrado no splash do Android)', () => {
    const manifest = JSON.parse(readFileSync(raiz('public/manifest.webmanifest'), 'utf8'))
    const html = readFileSync(raiz('index.html'), 'utf8')
    const tema = html.match(/name="theme-color" content="(#[0-9A-Fa-f]{6})"/)[1]
    const fundo = html.match(/#splash\{[^}]*background:(#[0-9A-Fa-f]{6})/)[1]
    const cores = [manifest.background_color, manifest.theme_color, tema, fundo].map((c) => c.toUpperCase())
    expect(new Set(cores).size).toBe(1)
    expect(cores[0]).toBe('#0E1D29')
  })

  it('icones do PWA existem nos tamanhos declarados', () => {
    expect(largura('icon-192.png')).toBe(192)
    expect(largura('icon-512.png')).toBe(512)
    expect(largura('icon-maskable-512.png')).toBe(512)
    expect(largura('apple-touch-icon.png')).toBe(180)
  })
})
