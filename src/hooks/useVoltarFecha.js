import { useEffect, useId, useRef } from 'react'

/*
 * No celular, o botao/gesto "voltar" deve fechar a janela aberta, e nao sair da tela.
 *
 * Como funciona:
 *  - Ao abrir, empilha uma entrada no historico com o MESMO endereco (a rota nao muda, nao ha hashchange).
 *  - "Voltar" do aparelho retira essa entrada: o navegador dispara popstate e a janela fecha.
 *  - Fechar pelo X, Esc ou ao salvar: a entrada sobra, entao e retirada com history.back().
 *    Esse back e adiado (setTimeout 0) e so acontece se a entrada ainda for desta janela. Assim:
 *      a) um link clicado dentro da janela (menu "Mais") ja criou outra entrada e nao e desfeito;
 *      b) no StrictMode (desmonta e remonta na hora) o back pendente e cancelado e nada se perde.
 */
export function useVoltarFecha(onFechar, ativo = true) {
  const id = useId()
  const fecharRef = useRef(onFechar)
  const adiado = useRef(null)

  useEffect(() => { fecharRef.current = onFechar })

  useEffect(() => {
    if (!ativo || typeof window === 'undefined') return undefined
    let fechouPeloVoltar = false

    if (adiado.current) {
      clearTimeout(adiado.current) // remontagem imediata: a entrada ainda esta la
      adiado.current = null
    } else {
      window.history.pushState({ ...(window.history.state ?? {}), biJanela: id }, '')
    }

    const aoVoltar = () => {
      fechouPeloVoltar = true
      fecharRef.current?.()
    }
    window.addEventListener('popstate', aoVoltar)

    return () => {
      window.removeEventListener('popstate', aoVoltar)
      if (fechouPeloVoltar) return
      adiado.current = setTimeout(() => {
        adiado.current = null
        if (window.history.state?.biJanela === id) window.history.back()
      }, 0)
    }
  }, [ativo, id])
}
