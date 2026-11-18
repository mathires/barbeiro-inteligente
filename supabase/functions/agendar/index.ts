// Ponto de entrada da Edge Function "agendar" (Deno). A logica esta em handler.ts.
// Publicada SEM verificacao de JWT (verify_jwt = false): o visitante nao tem login; quem protege
// a gravacao e o Turnstile (agendar) e o par codigo + telefone (cancelar).
import { criarHandler } from './handler.ts'

Deno.serve(criarHandler({ env: Deno.env.toObject(), fetch }))
