// PROMPT.md R9 (public API: serial requests, lowercase usernames, at most 3 live months predicted from the A.5
// anchors nearest first, the newest 6 months for daily games) and the public API metadata mapping of section 3.3.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureResponse, loadNetworkFixture } from '../test/loadFixture'
import type { ImportResult, ParsedInput } from '../types/game'
import { IMPORT_STRINGS, importGame, predictLiveMonths, type ImportOptions } from './index'

type Factory = () => Response | Promise<Response>
const API = 'https://api.chess.com/pub/player'
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
const recorded =
  (name: string): Factory =>
  () =>
    fixtureResponse(loadNetworkFixture(name))
const archivesOf =
  (user: string, months: string[]): Factory =>
  () =>
    json({ archives: months.map((m) => `${API}/${user}/games/${m}`) })
const months = (from: string, count: number): string[] => {
  const [y, m] = from.split('/').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1))
    return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

interface Mock {
  calls: string[]
  maxInFlight: number
}
/** Exact-URL routes; unlisted month URLs answer 200 {"games":[]}; anything else is a TypeError. */
function installFetch(routes: Record<string, Factory | Factory[]>): Mock {
  const mock: Mock = { calls: [], maxInFlight: 0 }
  const served: Record<string, number> = {}
  let inFlight = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      mock.calls.push(href)
      inFlight += 1
      mock.maxInFlight = Math.max(mock.maxInFlight, inFlight)
      try {
        await new Promise((resolve) => setTimeout(resolve, 0)) // keep each request open across a macrotask
        const route = routes[href]
        if (route) {
          const list = Array.isArray(route) ? route : [route]
          const n = served[href] ?? 0
          served[href] = n + 1
          return await list[Math.min(n, list.length - 1)]()
        }
        if (/\/games\/\d{4}\/\d{2}$/.test(href) || /\/games$/.test(href)) return json({ games: [] })
        throw new TypeError(`unmocked request: ${href}`)
      } finally {
        inFlight -= 1
      }
    }),
  )
  return mock
}
const monthCalls = (m: Mock) => m.calls.filter((c) => /\/games\/\d{4}\/\d{2}$/.test(c))
const cc = (cckind: 'live' | 'daily' | 'computer' | 'unknown', id: string): ParsedInput => ({
  kind: 'chesscom',
  cckind,
  id,
})
function pages(username: string, extra: Partial<ImportOptions> = {}) {
  const statuses: [string, string][] = []
  const waits: number[] = []
  const opts: ImportOptions = {
    deployTarget: 'pages',
    username,
    onStatus: (key, message) => statuses.push([key, message]),
    wait: async (ms) => void waits.push(ms),
    ...extra,
  }
  return { opts, statuses, waits }
}
function gameOf(r: ImportResult) {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}: ${r.error.message}`)
  return r
}
function errorOf(r: ImportResult) {
  if (r.ok) throw new Error(`expected an error, got game ${r.game.id}`)
  return r.error
}

beforeEach(() => {
  sessionStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('A.5 live id to archive month prediction', () => {
  it.each([
    ['2524491235', '2018/01'],
    ['4355135133', '2020/01'],
    ['97872578329', '2024/01'],
    ['129688175007', '2025/01'],
    ['161596628091', '2026/01'],
    ['183193101523', '2026/09'],
  ])('anchor id %s predicts %s', (id, month) => {
    expect(predictLiveMonths(id)[0]).toBe(month)
  })

  it('returns the predicted month, then the previous, then the next', () => {
    expect(predictLiveMonths('129688175007')).toEqual(['2025/01', '2024/12', '2025/02'])
  })

  it('interpolates between anchors (halfway between 2025-01-04 and 2026-01-01 is mid 2025)', () => {
    const mid = String(Math.round((129688175007 + 161596628091) / 2))
    expect(predictLiveMonths(mid)[0]).toBe('2025/07')
  })

  it('extrapolates past the last anchor at 2.6e9 ids per month', () => {
    expect(predictLiveMonths(String(183193101523 + 2.6e9))[0]).toBe('2026/10')
    expect(predictLiveMonths(String(183193101523 + 3 * 2.6e9))[0]).toBe('2026/12')
  })
})

describe('R9 request count, concurrency, lowercase usernames, month order', () => {
  it('live game found in the predicted month: archives then that one month, usernames lowercased', async () => {
    const net = installFetch({
      [`${API}/hikaru/games/archives`]: recorded('api.chess.com-archives-hikaru'),
      [`${API}/hikaru/games/2025/01`]: recorded('api.chess.com-month-hikaru-2025-01'),
    })
    const { opts, statuses } = pages('  HiKaRu ')
    const r = gameOf(await importGame(cc('live', '129688175007'), opts))
    expect(net.calls).toEqual([`${API}/hikaru/games/archives`, `${API}/hikaru/games/2025/01`])
    expect(net.maxInFlight).toBe(1)
    expect(statuses).toEqual([['P-8', 'Searching 2025/01…']])
    expect(r.via).toBe('public-api')
  })

  it('live game not in the archive: exactly 3 months, predicted first, then previous, then next; P-9', async () => {
    const net = installFetch({ [`${API}/hikaru/games/archives`]: recorded('api.chess.com-archives-hikaru') })
    const { opts, statuses } = pages('hikaru')
    const e = errorOf(await importGame(cc('live', '129688175008'), opts))
    expect(net.calls).toHaveLength(4)
    expect(monthCalls(net)).toEqual([
      `${API}/hikaru/games/2025/01`,
      `${API}/hikaru/games/2024/12`,
      `${API}/hikaru/games/2025/02`,
    ])
    expect(net.maxInFlight).toBe(1)
    expect(statuses.map(([k]) => k)).toEqual(['P-8', 'P-8', 'P-8'])
    expect(e.code).toBe('archive_not_found')
    expect(e.message).toBe(
      "Couldn't find game 129688175008 in hikaru's recent archives (2025/01, 2024/12, 2025/02). Check the username (either player works), or paste the PGN.",
    )
  })

  it('months the player has no archive for are not requested', async () => {
    const net = installFetch({
      [`${API}/someone/games/archives`]: archivesOf('someone', ['2024/11', '2024/12']),
    })
    const e = errorOf(await importGame(cc('live', '129688175008'), pages('someone').opts))
    expect(monthCalls(net)).toEqual([`${API}/someone/games/2024/12`])
    expect(e.code).toBe('archive_not_found')
  })

  it('daily game: current games, the archive list, then the newest 6 months newest first (8 requests at most)', async () => {
    const list = months('2025/10', 12) // 2025/10 .. 2026/09
    const net = installFetch({ [`${API}/erik/games/archives`]: archivesOf('erik', list) })
    const e = errorOf(await importGame(cc('daily', '999999999'), pages('Erik').opts))
    expect(net.calls.slice(0, 2)).toEqual([`${API}/erik/games`, `${API}/erik/games/archives`])
    expect(monthCalls(net)).toEqual(
      ['2026/09', '2026/08', '2026/07', '2026/06', '2026/05', '2026/04'].map((m) => `${API}/erik/games/${m}`),
    )
    expect(net.calls).toHaveLength(8)
    expect(net.maxInFlight).toBe(1)
    expect(e.code).toBe('archive_not_found')
  })

  it('bare id on Pages: 3 live months, current games, then the daily months not already scanned (max 9 months)', async () => {
    const net = installFetch({ [`${API}/hikaru/games/archives`]: recorded('api.chess.com-archives-hikaru') })
    const e = errorOf(await importGame(cc('unknown', '129688175008'), pages('hikaru').opts))
    expect(monthCalls(net).slice(0, 3)).toEqual(
      ['2025/01', '2024/12', '2025/02'].map((m) => `${API}/hikaru/games/${m}`),
    )
    expect(monthCalls(net).length).toBeLessThanOrEqual(9)
    expect(net.calls).toContain(`${API}/hikaru/games`)
    expect(net.maxInFlight).toBe(1)
    expect(e.code).toBe('ambiguous_kind')
  })

  it('two imports started together still never have two requests in flight', async () => {
    const net = installFetch({
      [`${API}/hikaru/games/archives`]: recorded('api.chess.com-archives-hikaru'),
      [`${API}/hikaru/games/2025/01`]: recorded('api.chess.com-month-hikaru-2025-01'),
      [`${API}/arystanner/games/archives`]: recorded('api.chess.com-archives-arystanner'),
      [`${API}/arystanner/games/2025/01`]: recorded('api.chess.com-month-arystanner-2025-01'),
    })
    const [a, b] = await Promise.all([
      importGame(cc('live', '129688175007'), pages('hikaru').opts),
      importGame(cc('live', '129688175007'), pages('arystanner').opts),
    ])
    expect(gameOf(a).game.id).toBe('cc:live:129688175007')
    expect(gameOf(b).game.id).toBe('cc:live:129688175007')
    expect(net.calls).toHaveLength(4)
    expect(net.maxInFlight).toBe(1)
  })

  it('never goes through the Vercel function, even on the Vercel build', async () => {
    const net = installFetch({
      '/api/chesscom?kind=live&id=129688175007': () => {
        throw new TypeError('Failed to fetch')
      },
      '/api/cc-rewrite/live/129688175007': () => {
        throw new TypeError('Failed to fetch')
      },
      [`${API}/hikaru/games/archives`]: recorded('api.chess.com-archives-hikaru'),
      [`${API}/hikaru/games/2025/01`]: recorded('api.chess.com-month-hikaru-2025-01'),
    })
    gameOf(
      await importGame(cc('live', '129688175007'), {
        deployTarget: 'vercel',
        proxyUrl: '/api/chesscom',
        username: 'hikaru',
      }),
    )
    expect(net.calls.slice(2).every((c) => c.startsWith(`${API}/hikaru/`))).toBe(true)
  })
})

describe('public API errors and back-off', () => {
  it('429 then 200: P-2, a 2 s wait, one retry', async () => {
    const net = installFetch({
      [`${API}/hikaru/games/archives`]: [() => json({}, 429), recorded('api.chess.com-archives-hikaru')],
      [`${API}/hikaru/games/2025/01`]: recorded('api.chess.com-month-hikaru-2025-01'),
    })
    const { opts, statuses, waits } = pages('hikaru')
    gameOf(await importGame(cc('live', '129688175007'), opts))
    expect(statuses[0]).toEqual(['P-2', IMPORT_STRINGS['P-2']])
    expect(waits).toEqual([2000])
    expect(net.calls.slice(0, 2)).toEqual([`${API}/hikaru/games/archives`, `${API}/hikaru/games/archives`])
  })

  it('429 after the retry: P-3 and the scan stops', async () => {
    const net = installFetch({ [`${API}/hikaru/games/archives`]: () => json({}, 429) })
    const e = errorOf(await importGame(cc('live', '129688175007'), pages('hikaru').opts))
    expect(e.code).toBe('proxy_rate_limited')
    expect(e.message).toBe(IMPORT_STRINGS['P-3'])
    expect(net.calls).toHaveLength(2)
  })

  it('a month answered 404 "internal error" (future month) is skipped, the scan goes on', async () => {
    const net = installFetch({
      [`${API}/hikaru/games/archives`]: recorded('api.chess.com-archives-hikaru'),
      [`${API}/hikaru/games/2025/01`]: () =>
        json({ code: 0, message: 'An internal error has occurred. Please contact Chess.com.' }, 404),
    })
    const e = errorOf(await importGame(cc('live', '129688175008'), pages('hikaru').opts))
    expect(monthCalls(net)).toHaveLength(3)
    expect(e.code).toBe('archive_not_found')
  })

  it('a computer link on the public API path is I-8 without any request', async () => {
    const net = installFetch({})
    const e = errorOf(await importGame(cc('computer', '285275822'), pages('anomen_s').opts))
    expect(e.code).toBe('computer_via_public_api')
    expect(net.calls).toEqual([])
  })
})

describe('public API metadata mapping', () => {
  it('reportedAccuracies, the opening name from the eco URL slug, the time class and the [%clk] clocks', async () => {
    installFetch({
      [`${API}/hikaru/games/archives`]: recorded('api.chess.com-archives-hikaru'),
      [`${API}/hikaru/games/2025/01`]: recorded('api.chess.com-month-hikaru-2025-01'),
    })
    const { game } = gameOf(await importGame(cc('live', '129688175007'), pages('hikaru').opts))
    expect(game.reportedAccuracies).toEqual({ white: 92.69, black: 88.19 })
    expect(game.openingName).toBe('Modern Defense with 1.e4 2.d4')
    expect(game).toMatchObject({ timeClass: 'blitz', timeControl: '180', rated: true, result: '1-0' })
    expect(game.white).toMatchObject({ name: 'Arystanner', rating: 3015 })
    expect(game.black).toMatchObject({ name: 'Hikaru', rating: 3282 })
    expect(game.clocks).toHaveLength(112)
    expect(game.clocks?.[0]).toBe(1800)
  })

  it('an in-progress daily game from the current-games list asks for confirmation', async () => {
    const net = installFetch({ [`${API}/erik/games`]: recorded('api.chess.com-games-erik') })
    const r = gameOf(await importGame(cc('daily', '1034198172'), pages('erik').opts))
    expect(net.calls).toEqual([`${API}/erik/games`])
    expect(r.pendingConfirmation).toBe('in_progress_daily')
    expect(r.game).toMatchObject({ result: '*', inProgress: false, white: { name: 'erik' } })
  })
})
