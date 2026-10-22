import { beforeEach } from 'vitest'
import { limparCache } from '../src/lib/cache.js'

// Cada teste comeca com o cache vazio, para um teste nunca enxergar dados de outro
beforeEach(() => limparCache())
