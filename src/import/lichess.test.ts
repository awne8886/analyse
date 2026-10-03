// PROMPT.md R8: lichess games are fetched from the browser with Accept: application/json, one request at a time; a
// 429 waits 60 s and retries once; a "not found" is a rejected fetch (TypeError: the 404 has no CORS header).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fixtureResponse,
  loadNetworkFixture,
  readFixtureText,
  type NetworkFixture,
} from '../test/loadFixture'
import type { ImportResult } from '../types/game'
import { IMPORT_STRINGS, importGame, type ImportOptions } from './index'

type Factory = () => Response | Promise<Response>
const recorded =
  (name: string): Factory =>
  () =>
    fixtureResponse(loadNetworkFixture(name))
const rateLimited: Factory = () =>
  fixtureResponse(JSON.parse(readFixtureText('lichess/export-rate-limited-429.json')) as NetworkFixture)
const rejected: Factory = () => {
  throw new TypeError('Failed to fetch')
}

interface Call {
  url: string
  accept: string | null
}
interface Mock {
  calls: Call[]
  maxInFlight: number
}
function installFetch(answers: Factory[]): Mock {
  const mock: Mock = { calls: [], maxInFlight: 0 }
  let inFlight = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      mock.calls.push({ url, accept: new Headers(init?.headers).get('accept') })
      inFlight += 1
      mock.maxInFlight = Math.max(mock.maxInFlight, inFlight)
      try {
        await Promise.resolve()
        return await answers[Math.min(mock.calls.length - 1, answers.length - 1)]()
      } finally {
        inFlight -= 1
      }
    }),
  )
  return mock
}
function options(extra: Partial<ImportOptions> = {}) {
  const statuses: [string, string][] = []
  const waits: number[] = []
  const opts: ImportOptions = {
    deployTarget: 'vercel',
    proxyUrl: '/api/chesscom',
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

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('R8 lichess export', () => {
  it('200: one GET of the export URL with Accept: application/json, imported with its metadata', async () => {
    const net = installFetch([recorded('lichess.org-game-TJxUmbWK')])
    const { opts, statuses } = options()
    const r = gameOf(await importGame({ kind: 'lichess', id: 'TJxUmbWK' }, opts))
    expect(net.calls).toEqual([
      {
        url: 'https://lichess.org/game/export/TJxUmbWK?pgnInJson=true&clocks=true&evals=false&opening=true&accuracy=true',
        accept: 'application/json',
      },
    ])
    expect(statuses).toEqual([])
    expect(r.via).toBe('lichess')
    expect(r.game).toMatchObject({
      id: 'li:TJxUmbWK',
      site: 'lichess',
      sourceUrl: 'https://lichess.org/TJxUmbWK',
      result: '1-0',
      eco: 'B07',
      openingName: 'Pirc Defense',
      timeControl: '600+0',
      timeClass: 'rapid',
      rated: true,
      date: '2017-08-30',
      white: { name: 'arex', rating: 1627 },
      black: { name: 'JERC-12Jesus', rating: 1740 },
    })
    expect(r.game.clocks).toHaveLength(r.game.moves.length)
    expect(r.game.clocks?.[0]).toBe(6000) // 60003 centiseconds
  })

  it('429 then 200: the first I-27 sentence, a 60 s wait, exactly one retry, imported', async () => {
    const net = installFetch([rateLimited, recorded('lichess.org-game-4S1PZUvW')])
    const { opts, statuses, waits } = options()
    const r = gameOf(await importGame({ kind: 'lichess', id: '4S1PZUvW' }, opts))
    expect(statuses).toEqual([['I-27', IMPORT_STRINGS['I-27']]])
    expect(waits).toEqual([60_000])
    expect(net.calls).toHaveLength(2)
    expect(r.game.moves).toHaveLength(13)
  })

  it('429 then 200 with the default timer wait: nothing is retried before 60 s', async () => {
    vi.useFakeTimers()
    const net = installFetch([rateLimited, recorded('lichess.org-game-4S1PZUvW')])
    const pending = importGame({ kind: 'lichess', id: '4S1PZUvW' }, { deployTarget: 'vercel' })
    await vi.advanceTimersByTimeAsync(59_999)
    expect(net.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(gameOf(await pending).game.id).toBe('li:4S1PZUvW')
    expect(net.calls).toHaveLength(2)
  })

  it('429 twice: lichess_rate_limited with the second I-27 sentence, no third request', async () => {
    const net = installFetch([rateLimited])
    const { opts, waits } = options()
    const e = errorOf(await importGame({ kind: 'lichess', id: '4S1PZUvW' }, opts))
    expect(e.code).toBe('lichess_rate_limited')
    expect(e.message).toBe(IMPORT_STRINGS['I-27b'])
    expect(waits).toEqual([60_000])
    expect(net.calls).toHaveLength(2)
  })

  it('rejected promise (TypeError, the CORS-less 404): lichess_not_found, no retry', async () => {
    const net = installFetch([rejected])
    const { opts, waits } = options()
    const e = errorOf(await importGame({ kind: 'lichess', id: 'zzzzzzzz' }, opts))
    expect(e.code).toBe('lichess_not_found')
    expect(e.message).toBe(IMPORT_STRINGS['I-26'])
    expect(net.calls).toHaveLength(1)
    expect(waits).toEqual([])
  })

  it('a readable 404 (no browser CORS block, as in the recorded fixture) is also lichess_not_found', async () => {
    installFetch([recorded('lichess.org-game-zzzzzzzz')])
    expect(errorOf(await importGame({ kind: 'lichess', id: 'zzzzzzzz' }, options().opts)).code).toBe(
      'lichess_not_found',
    )
  })

  it('one request at a time: two imports started together are serialised', async () => {
    const net = installFetch([recorded('lichess.org-game-TJxUmbWK')])
    const [a, b] = await Promise.all([
      importGame({ kind: 'lichess', id: 'TJxUmbWK' }, options().opts),
      importGame({ kind: 'lichess', id: 'TJxUmbWK' }, options().opts),
    ])
    expect(gameOf(a).game.id).toBe('li:TJxUmbWK')
    expect(gameOf(b).game.id).toBe('li:TJxUmbWK')
    expect(net.calls).toHaveLength(2)
    expect(net.maxInFlight).toBe(1)
  })

  it('a computer opponent (aiLevel) is flagged as a bot', async () => {
    installFetch([recorded('lichess.org-game-4S1PZUvW')])
    const { game } = gameOf(await importGame({ kind: 'lichess', id: '4S1PZUvW' }, options().opts))
    expect(game.black.isComputer).toBe(true)
    expect(game.black.name).toBe('Stockfish level 8')
    expect(game.white).toMatchObject({ name: 'IQ_4U_Academy', rating: 1500 })
    expect(game.moves[12]).toMatchObject({ san: 'Ra7#', terminal: 'checkmate' })
  })
})
