// PROMPT.md R3 (Vercel import chain: function, rewrite, username + public API; content-type check; proxyDown memo)
// and the callback metadata mapping of section 3.3. fetch is mocked; recorded fixtures per PLAN.md Assumption 13.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fixtureResponse,
  loadNetworkFixture,
  readFixtureText,
  type NetworkFixture,
} from '../test/loadFixture'
import type { ImportResult, ParsedInput } from '../types/game'
import { IMPORT_STRINGS, PROXY_DOWN_KEY, importGame, type ImportOptions } from './index'

type Factory = () => Response | Promise<Response>
const LIVE_ID = '129688175007'
const fnUrl = (kind: string, id: string) => `/api/chesscom?kind=${kind}&id=${id}`
const rewriteUrl = (kind: string, id: string) => `/api/cc-rewrite/${kind}/${id}`
const archivesUrl = (user: string) => `https://api.chess.com/pub/player/${user}/games/archives`
const monthUrl = (user: string, ym: string) => `https://api.chess.com/pub/player/${user}/games/${ym}`

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const html = (status: number, body = '<!DOCTYPE html><html><body>Just a moment...</body></html>'): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
const recorded =
  (name: string): Factory =>
  () =>
    fixtureResponse(loadNetworkFixture(name))
const networkError: Factory = () => {
  throw new TypeError('Failed to fetch')
}
const timeoutError: Factory = () => {
  throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
}

interface Mock {
  calls: string[]
  maxInFlight: number
}
/** Routes by exact URL; an array answers successive requests (the last one repeats); anything else is a TypeError. */
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
        await Promise.resolve()
        const route = routes[href]
        if (!route) throw new TypeError(`unmocked request: ${href}`)
        const list = Array.isArray(route) ? route : [route]
        const n = served[href] ?? 0
        served[href] = n + 1
        return await list[Math.min(n, list.length - 1)]()
      } finally {
        inFlight -= 1
      }
    }),
  )
  return mock
}

const cc = (cckind: 'live' | 'daily' | 'computer' | 'unknown', id: string): ParsedInput => ({
  kind: 'chesscom',
  cckind,
  id,
})
function vercel(extra: Partial<ImportOptions> = {}) {
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
function errorOf(r: ImportResult) {
  if (r.ok) throw new Error(`expected an error, got game ${r.game.id}`)
  return r.error
}
function gameOf(r: ImportResult) {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}: ${r.error.message}`)
  return r
}
const memo = () => sessionStorage.getItem(PROXY_DOWN_KEY)

beforeEach(() => {
  sessionStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('R3 step 1: the proxy function', () => {
  it('200 JSON with game.moveList: imported through the function, one request, no memo', async () => {
    const net = installFetch({ [fnUrl('live', LIVE_ID)]: recorded('www.chess.com-live-129688175007') })
    const { opts, statuses } = vercel()
    const r = gameOf(await importGame(cc('live', LIVE_ID), opts))
    expect(net.calls).toEqual([fnUrl('live', LIVE_ID)])
    expect(r.via).toBe('proxy')
    expect(r.game.moves).toHaveLength(112)
    expect(statuses).toEqual([])
    expect(memo()).toBeNull()
  })

  it('404 [] (daily): I-6 and stop, never the rewrite or another kind', async () => {
    const net = installFetch({ [fnUrl('daily', '1859764312')]: () => json([], 404) })
    const e = errorOf(await importGame(cc('daily', '1859764312'), vercel().opts))
    expect(e.code).toBe('daily_not_found')
    expect(e.message).toBe(IMPORT_STRINGS['I-6'])
    expect(net.calls).toEqual([fnUrl('daily', '1859764312')])
    expect(memo()).toBeNull()
  })

  it('404 message JSON (live): I-2 and stop', async () => {
    const net = installFetch({
      [fnUrl('live', '1859764312')]: () => json({ message: 'Game is not found.' }, 404),
    })
    const e = errorOf(await importGame(cc('live', '1859764312'), vercel().opts))
    expect(e.code).toBe('live_not_found')
    expect(e.message).toBe(IMPORT_STRINGS['I-2'])
    expect(net.calls).toEqual([fnUrl('live', '1859764312')])
  })

  it('404 {"error":"Game not found"} (computer): I-7 and stop', async () => {
    const net = installFetch({ [fnUrl('computer', '12345678')]: recorded('www.chess.com-computer-12345678') })
    const e = errorOf(await importGame(cc('computer', '12345678'), vercel().opts))
    expect(e.code).toBe('computer_not_found')
    expect(e.message).toBe(IMPORT_STRINGS['I-7'])
    expect(net.calls).toHaveLength(1)
  })

  it('429 then 200: P-2 shown, waits 2 s, retries the function once, imported', async () => {
    const net = installFetch({
      [fnUrl('live', LIVE_ID)]: [
        () => json({ message: 'Too many requests' }, 429),
        recorded('www.chess.com-live-129688175007'),
      ],
    })
    const { opts, statuses, waits } = vercel()
    const r = gameOf(await importGame(cc('live', LIVE_ID), opts))
    expect(statuses).toEqual([['P-2', IMPORT_STRINGS['P-2']]])
    expect(waits).toEqual([2000])
    expect(net.calls).toEqual([fnUrl('live', LIVE_ID), fnUrl('live', LIVE_ID)])
    expect(r.via).toBe('proxy')
  })

  it('429 then 200 with the default timer wait: the retry goes out after 2 s, not before', async () => {
    vi.useFakeTimers()
    const net = installFetch({
      [fnUrl('live', LIVE_ID)]: [() => json({}, 429), recorded('www.chess.com-live-129688175007')],
    })
    const pending = importGame(cc('live', LIVE_ID), { deployTarget: 'vercel', proxyUrl: '/api/chesscom' })
    await vi.advanceTimersByTimeAsync(1999)
    expect(net.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(gameOf(await pending).via).toBe('proxy')
    expect(net.calls).toHaveLength(2)
  })

  it('429 twice from the function: continues to the rewrite without a new message', async () => {
    const net = installFetch({
      [fnUrl('live', LIVE_ID)]: () => json({}, 429),
      [rewriteUrl('live', LIVE_ID)]: recorded('www.chess.com-live-129688175007'),
    })
    const { opts, statuses } = vercel()
    const r = gameOf(await importGame(cc('live', LIVE_ID), opts))
    expect(net.calls).toEqual([fnUrl('live', LIVE_ID), fnUrl('live', LIVE_ID), rewriteUrl('live', LIVE_ID)])
    expect(statuses.map(([k]) => k)).toEqual(['P-2'])
    expect(r.via).toBe('rewrite')
  })

  it('429 from the function twice and from the rewrite: P-3 (proxy_rate_limited), username wanted, no memo', async () => {
    installFetch({
      [fnUrl('live', LIVE_ID)]: () => json({}, 429),
      [rewriteUrl('live', LIVE_ID)]: () => json({}, 429),
    })
    const e = errorOf(await importGame(cc('live', LIVE_ID), vercel().opts))
    expect(e.code).toBe('proxy_rate_limited')
    expect(e.message).toBe(IMPORT_STRINGS['P-3'])
    expect(e.needsUsername).toBe(true)
    expect(memo()).toBeNull()
  })
})

describe('R3 step 2: the rewrite, and what is shown when both paths fail', () => {
  it('403 HTML from the function: next step is the rewrite, which imports the game', async () => {
    const net = installFetch({
      [fnUrl('live', LIVE_ID)]: () => html(403),
      [rewriteUrl('live', LIVE_ID)]: recorded('www.chess.com-live-129688175007'),
    })
    const r = gameOf(await importGame(cc('live', LIVE_ID), vercel().opts))
    expect(net.calls).toEqual([fnUrl('live', LIVE_ID), rewriteUrl('live', LIVE_ID)])
    expect(r.via).toBe('rewrite')
    expect(r.game.id).toBe('cc:live:129688175007')
    expect(memo()).toBeNull()
  })

  it('403 HTML on both paths: P-1 (proxy_blocked), username wanted, memo set', async () => {
    const net = installFetch({
      [fnUrl('live', LIVE_ID)]: () => html(403),
      [rewriteUrl('live', LIVE_ID)]: () => html(403),
    })
    const e = errorOf(await importGame(cc('live', LIVE_ID), vercel().opts))
    expect(e.code).toBe('proxy_blocked')
    expect(e.message).toBe(IMPORT_STRINGS['P-1'])
    expect(e.needsUsername).toBe(true)
    expect(net.calls).toHaveLength(2)
    expect(Number(memo())).toBeGreaterThan(0)
  })

  it('503 upstream_blocked from the function, then the rewrite: a daily 200 is imported via the rewrite', async () => {
    const net = installFetch({
      [fnUrl('daily', '285275822')]: () => json({ error: 'upstream_blocked', upstreamStatus: 403 }, 503),
      [rewriteUrl('daily', '285275822')]: recorded('www.chess.com-daily-285275822'),
    })
    const r = gameOf(await importGame(cc('daily', '285275822'), vercel().opts))
    expect(net.calls).toEqual([fnUrl('daily', '285275822'), rewriteUrl('daily', '285275822')])
    expect(r.via).toBe('rewrite')
    expect(r.game.moves).toHaveLength(37)
  })

  it('503 upstream_blocked on both paths: P-1', async () => {
    installFetch({
      [fnUrl('live', LIVE_ID)]: () => json({ error: 'upstream_blocked' }, 503),
      [rewriteUrl('live', LIVE_ID)]: () => json({ error: 'upstream_blocked' }, 503),
    })
    expect(errorOf(await importGame(cc('live', LIVE_ID), vercel().opts)).code).toBe('proxy_blocked')
  })

  it('network error on both paths: I-18 (proxy_unreachable), memo set', async () => {
    const net = installFetch({
      [fnUrl('live', LIVE_ID)]: networkError,
      [rewriteUrl('live', LIVE_ID)]: networkError,
    })
    const e = errorOf(await importGame(cc('live', LIVE_ID), vercel().opts))
    expect(e.code).toBe('proxy_unreachable')
    expect(e.message).toBe(IMPORT_STRINGS['I-18'])
    expect(net.calls).toEqual([fnUrl('live', LIVE_ID), rewriteUrl('live', LIVE_ID)])
    expect(Number(memo())).toBeGreaterThan(0)
  })

  it('client timeout (TimeoutError) or 504 on both paths: P-4 (proxy_timeout)', async () => {
    installFetch({
      [fnUrl('live', LIVE_ID)]: timeoutError,
      [rewriteUrl('live', LIVE_ID)]: () => json({ error: 'upstream_timeout' }, 504),
    })
    const e = errorOf(await importGame(cc('live', LIVE_ID), vercel().opts))
    expect(e.code).toBe('proxy_timeout')
    expect(e.message).toBe(IMPORT_STRINGS['P-4'])
  })

  it('an HTML index.html body (function not deployed): the content-type check rejects it before parsing', async () => {
    // the body is valid game JSON, but served as text/html: it must never be parsed
    const gameJson = JSON.stringify(loadNetworkFixture('www.chess.com-live-129688175007').body)
    const net = installFetch({
      [fnUrl('live', LIVE_ID)]: () => html(200, gameJson),
      [rewriteUrl('live', LIVE_ID)]: () => html(200, '<!doctype html><div id="root"></div>'),
    })
    const e = errorOf(await importGame(cc('live', LIVE_ID), vercel().opts))
    expect(net.calls).toEqual([fnUrl('live', LIVE_ID), rewriteUrl('live', LIVE_ID)])
    expect(e.code).toBe('proxy_blocked')
    expect(e.message).toBe(IMPORT_STRINGS['P-1'])
  })

  it('computer kind has no rewrite: a 503 from the function goes straight to the username step', async () => {
    const net = installFetch({
      [fnUrl('computer', '285275822')]: () => json({ error: 'upstream_blocked' }, 503),
    })
    const e = errorOf(await importGame(cc('computer', '285275822'), vercel().opts))
    expect(net.calls).toEqual([fnUrl('computer', '285275822')])
    expect(e.code).toBe('proxy_blocked')
    expect(e.needsUsername).toBe(true)
  })

  it('computer kind with a username after a proxy failure: the failure is shown, then I-8 (bots are not archived)', async () => {
    installFetch({ [fnUrl('computer', '285275822')]: networkError })
    const { opts, statuses } = vercel({ username: 'anomen_s' })
    const e = errorOf(await importGame(cc('computer', '285275822'), opts))
    expect(statuses).toEqual([['I-18', IMPORT_STRINGS['I-18']]])
    expect(e.code).toBe('computer_via_public_api')
  })
})

describe('R3 step 3: username and public API after a proxy failure', () => {
  it('blocked on both paths with a username: P-1 is shown, then the public API finds the game', async () => {
    const net = installFetch({
      [fnUrl('live', LIVE_ID)]: () => html(403),
      [rewriteUrl('live', LIVE_ID)]: () => html(403),
      [archivesUrl('hikaru')]: recorded('api.chess.com-archives-hikaru'),
      [monthUrl('hikaru', '2025/01')]: recorded('api.chess.com-month-hikaru-2025-01'),
    })
    const { opts, statuses } = vercel({ username: 'Hikaru' })
    const r = gameOf(await importGame(cc('live', LIVE_ID), opts))
    expect(statuses[0]).toEqual(['P-1', IMPORT_STRINGS['P-1']])
    expect(net.calls).toEqual([
      fnUrl('live', LIVE_ID),
      rewriteUrl('live', LIVE_ID),
      archivesUrl('hikaru'),
      monthUrl('hikaru', '2025/01'),
    ])
    expect(r.via).toBe('public-api')
    expect(r.game.moves).toHaveLength(112)
  })

  it('the ?username= of the link is used when the username field is empty', async () => {
    installFetch({
      [fnUrl('live', LIVE_ID)]: networkError,
      [rewriteUrl('live', LIVE_ID)]: networkError,
      [archivesUrl('hikaru')]: recorded('api.chess.com-archives-hikaru'),
      [monthUrl('hikaru', '2025/01')]: recorded('api.chess.com-month-hikaru-2025-01'),
    })
    const parsed: ParsedInput = { kind: 'chesscom', cckind: 'live', id: LIVE_ID, username: 'hikaru' }
    expect(gameOf(await importGame(parsed, vercel().opts)).via).toBe('public-api')
  })
})

describe('R2 bare link on the Vercel build', () => {
  it('live 200 then daily 404: the I-10a notice names the kind, the players and the date', async () => {
    const net = installFetch({
      [fnUrl('live', LIVE_ID)]: recorded('www.chess.com-live-129688175007'),
      [fnUrl('daily', LIVE_ID)]: () => json([], 404),
    })
    const { opts, statuses } = vercel()
    const r = gameOf(await importGame(cc('unknown', LIVE_ID), opts))
    expect(net.calls).toEqual([fnUrl('live', LIVE_ID), fnUrl('daily', LIVE_ID)])
    expect(r.notice).toBe('ambiguous_resolved')
    expect(statuses).toEqual([
      [
        'I-10a',
        "This link doesn't say whether it's a live or daily game. We found a live game: Arystanner vs Hikaru, 2025-01-04. If that's not the game you meant, open it on Chess.com and copy the full link (it contains /live/, /daily/ or /computer/).",
      ],
    ])
  })

  it('the live lookup failing on both paths goes to the username step without asking for daily', async () => {
    const net = installFetch({
      [fnUrl('live', LIVE_ID)]: networkError,
      [rewriteUrl('live', LIVE_ID)]: networkError,
    })
    const e = errorOf(await importGame(cc('unknown', LIVE_ID), vercel().opts))
    expect(net.calls).toEqual([fnUrl('live', LIVE_ID), rewriteUrl('live', LIVE_ID)])
    expect(e.code).toBe('proxy_unreachable')
  })
})

describe('R3 proxyDown memo (sessionStorage, 10 minutes)', () => {
  it('after a failure both proxy paths are skipped: the next import goes straight to the username step', async () => {
    const net = installFetch({
      [fnUrl('live', LIVE_ID)]: networkError,
      [rewriteUrl('live', LIVE_ID)]: networkError,
    })
    await importGame(cc('live', LIVE_ID), vercel().opts)
    expect(net.calls).toHaveLength(2)
    const e = errorOf(await importGame(cc('daily', '285275822'), vercel().opts))
    expect(net.calls).toHaveLength(2) // nothing new was requested
    expect(e.code).toBe('proxy_unreachable')
    expect(e.needsUsername).toBe(true)
  })

  it('with the memo set and a username, only the public API is asked', async () => {
    sessionStorage.setItem(PROXY_DOWN_KEY, String(Date.now() - 60_000))
    const net = installFetch({
      [archivesUrl('hikaru')]: recorded('api.chess.com-archives-hikaru'),
      [monthUrl('hikaru', '2025/01')]: recorded('api.chess.com-month-hikaru-2025-01'),
    })
    const r = gameOf(await importGame(cc('live', LIVE_ID), vercel({ username: 'hikaru' }).opts))
    expect(net.calls).toEqual([archivesUrl('hikaru'), monthUrl('hikaru', '2025/01')])
    expect(r.via).toBe('public-api')
  })

  it('a memo older than 10 minutes is ignored: the function is asked again', async () => {
    sessionStorage.setItem(PROXY_DOWN_KEY, String(Date.now() - 10 * 60_000 - 1))
    const net = installFetch({ [fnUrl('live', LIVE_ID)]: recorded('www.chess.com-live-129688175007') })
    gameOf(await importGame(cc('live', LIVE_ID), vercel().opts))
    expect(net.calls).toEqual([fnUrl('live', LIVE_ID)])
  })
})

describe('callback metadata mapping (section 3.3)', () => {
  it('players from pgnHeaders, colours from players.*.color, ratings, titles, avatars, clocks, ECO', async () => {
    installFetch({ [fnUrl('live', LIVE_ID)]: recorded('www.chess.com-live-129688175007') })
    const { game } = gameOf(await importGame(cc('live', LIVE_ID), vercel().opts))
    // in this game the top slot is black (Hikaru) and the bottom slot white (Arystanner)
    expect(game.white).toMatchObject({ name: 'Arystanner', rating: 3015, title: 'IM' })
    expect(game.black).toMatchObject({ name: 'Hikaru', rating: 3282, title: 'GM' })
    expect(game.white.avatarUrl).toMatch(/^https:\/\/images\.chesscomfiles\.com\//)
    expect(game).toMatchObject({
      result: '1-0',
      eco: 'B06',
      timeControl: '180',
      timeClass: 'blitz',
      date: '2025-01-04',
      rated: true,
      sourceUrl: 'https://www.chess.com/game/live/129688175007',
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    })
    expect(game.clocks).toHaveLength(112)
    expect(game.clocks?.slice(0, 3)).toEqual([1800, 1800, 1791])
    expect(game.moves[0]).toMatchObject({ ply: 1, color: 'w', san: 'e4', uci: 'e2e4', from: 'e2', to: 'e4' })
    expect(game.moves.every((m, i) => i === 0 || m.before === game.moves[i - 1].after)).toBe(true)
  })

  it("unescapes \\' in header strings and reads daily clocks from the timestamps array", async () => {
    const fixture = JSON.parse(readFixtureText('chesscom/callback-valid-5ply.json')) as NetworkFixture
    const body = fixture.body as { game: { pgnHeaders: Record<string, unknown>; timestamps?: number[] } }
    body.game.pgnHeaders.White = "O\\'Brien"
    body.game.pgnHeaders.Termination = "O\\'Brien won by resignation"
    body.game.timestamps = [8640, 8630, 8620, 8610, 8600]
    delete (body.game as Record<string, unknown>).moveTimestamps
    installFetch({ [fnUrl('daily', '999000000001')]: () => fixtureResponse(fixture) })
    const { game } = gameOf(await importGame(cc('daily', '999000000001'), vercel().opts))
    expect(game.white.name).toBe("O'Brien")
    expect(game.termination).toBe("O'Brien won by resignation")
    expect(game.timeClass).toBe('daily')
    expect(game.clocks).toEqual([8640, 8630, 8620, 8610, 8600])
  })

  it('a bot game flags the bot side with isComputer, the human side not at all', async () => {
    installFetch({ [fnUrl('computer', '1859764312')]: recorded('www.chess.com-computer-1859764312') })
    const { game } = gameOf(await importGame(cc('computer', '1859764312'), vercel().opts))
    expect(game.black).toMatchObject({ name: 'Komodo15', isComputer: true })
    expect(game.white.isComputer).toBeUndefined()
    expect(game.moves).toHaveLength(68)
    expect(game.moves[67].terminal).toBe('checkmate')
    expect(game.clocks).toBeUndefined() // the computer callback sends an empty timestamps array
  })
})
