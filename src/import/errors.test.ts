// @vitest-environment node
// PROMPT.md Appendix F.1 and F.2 (string table snapshot, one test per F.1 row, the R2 request sequence, the
// P-rows reachable without timers). Red against the Phase 0a stub. Network fixtures are recorded files under
// src/test/fixtures/network/ (PLAN.md Assumption 13), loaded only inside test bodies; hand-made fixtures are
// under src/test/fixtures/{chesscom,lichess,pgn}/.
// The node environment is deliberate: src/test/loadFixture.ts calls fileURLToPath(new URL(...)) at import time,
// which throws under jsdom (jsdom's URL is not Node's URL).
import { Chess } from 'chess.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fixtureResponse,
  loadNetworkFixture,
  readFixtureText,
  type NetworkFixture,
} from '../test/loadFixture'
import type { ChesscomKind, ImportError, ImportErrorCode, ImportResult, ParsedInput } from '../types/game'
import { IMPORT_STRINGS, confirmInProgress, importGame, type ImportOptions } from './index'

// ---------------------------------------------------------------------------------------------------------------
// Shared test plumbing. It is duplicated in errors.test.ts and variantGate.test.ts on purpose: tests import only
// the module entry point, chess.js, vitest and src/test/loadFixture.ts.
// The mocked global fetch answers from recorded network fixtures (PLAN.md Assumption 13), loaded lazily inside the
// handler, so a missing recorded file fails only the tests that need it. Usernames in public API paths must be
// lowercase (R9); an uppercase one is an unmocked request.
// ---------------------------------------------------------------------------------------------------------------
const VERCEL: ImportOptions = { deployTarget: 'vercel', proxyUrl: '/api/chesscom' }
const pagesOpts = (username?: string): ImportOptions => ({ deployTarget: 'pages', username })

const proxyUrl = (kind: string, id: string) => `/api/chesscom?kind=${kind}&id=${id}`
const rewriteUrl = (kind: string, id: string) => `/api/cc-rewrite/${kind}/${id}`
const archivesUrl = (user: string) => `https://api.chess.com/pub/player/${user}/games/archives`
const monthUrl = (user: string, ym: string) => `https://api.chess.com/pub/player/${user}/games/${ym}`
const currentGamesUrl = (user: string) => `https://api.chess.com/pub/player/${user}/games`

const cc = (cckind: ChesscomKind | 'unknown', id: string): ParsedInput => ({ kind: 'chesscom', cckind, id })
const lichess = (id: string): ParsedInput => ({ kind: 'lichess', id })
const pgnInput = (rel: string): ParsedInput => ({ kind: 'pgn', pgn: readFixtureText(rel).trim() })

type Factory = () => Response | Promise<Response>
interface NetOptions {
  /** keyed by route key (the recorded fixture name); an array answers successive requests, the last one repeats */
  overrides?: Record<string, Factory | Factory[]>
  /** when set, any month request whose route key is not listed answers 200 {"games":[]} */
  emptyMonthsExcept?: string[]
}
interface Net {
  calls: string[]
  maxInFlight: number
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const htmlResponse = (status: number): Response =>
  new Response('<!DOCTYPE html><html><body>Just a moment...</body></html>', {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
const networkError: Factory = () => {
  throw new TypeError('Failed to fetch')
}
const recorded =
  (name: string): Factory =>
  () =>
    fixtureResponse(loadNetworkFixture(name))
const handmade =
  (rel: string): Factory =>
  () =>
    fixtureResponse(JSON.parse(readFixtureText(rel)) as NetworkFixture)
/** a hand-made fixture whose `game` object has some fields overridden */
const handmadeWith =
  (rel: string, game: Record<string, unknown>): Factory =>
  () => {
    const f = JSON.parse(readFixtureText(rel)) as NetworkFixture
    Object.assign((f.body as { game: Record<string, unknown> }).game, game)
    return fixtureResponse(f)
  }
const archivesOf =
  (user: string, months: string[]): Factory =>
  () =>
    jsonResponse({ archives: months.map((m) => monthUrl(user, m)) })
const MONTHS_2026 = ['2026/04', '2026/05', '2026/06', '2026/07', '2026/08', '2026/09', '2026/10']

function routeKey(href: string): string | null {
  const u = new URL(href, 'http://app.test')
  if (u.hostname === 'api.chess.com') {
    let m = /^\/pub\/player\/([^/]+)\/games\/archives$/.exec(u.pathname)
    if (m && m[1] === m[1].toLowerCase()) return `api.chess.com-archives-${m[1]}`
    m = /^\/pub\/player\/([^/]+)\/games\/(\d{4})\/(\d{2})$/.exec(u.pathname)
    if (m && m[1] === m[1].toLowerCase()) return `api.chess.com-month-${m[1]}-${m[2]}-${m[3]}`
    m = /^\/pub\/player\/([^/]+)\/games$/.exec(u.pathname)
    if (m && m[1] === m[1].toLowerCase()) return `api.chess.com-games-${m[1]}`
    return null
  }
  if (u.hostname === 'lichess.org') {
    const m = /^\/game\/export\/([A-Za-z0-9]{8})$/.exec(u.pathname)
    return m ? `lichess.org-game-${m[1]}` : null
  }
  if (u.hostname === 'app.test') {
    if (u.pathname === '/api/chesscom') {
      const kind = u.searchParams.get('kind')
      const id = u.searchParams.get('id')
      return kind && id && /^(live|daily|computer)$/.test(kind) && /^\d+$/.test(id)
        ? `www.chess.com-${kind}-${id}`
        : null
    }
    const m = /^\/api\/cc-rewrite\/(live|daily)\/(\d+)$/.exec(u.pathname)
    return m ? `www.chess.com-${m[1]}-${m[2]}` : null
  }
  return null // anything else, www.chess.com included, is never requested by the browser
}

function installNetwork(options: NetOptions = {}): Net {
  const net: Net = { calls: [], maxInFlight: 0 }
  const served: Record<string, number> = {}
  let inFlight = 0
  const handler = async (input: RequestInfo | URL): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    net.calls.push(href)
    inFlight += 1
    net.maxInFlight = Math.max(net.maxInFlight, inFlight)
    try {
      await Promise.resolve() // lets two overlapping requests be observed as overlapping
      const key = routeKey(href)
      if (key === null) throw new TypeError(`unmocked request: ${href}`)
      const override = options.overrides?.[key]
      if (override) {
        const list = Array.isArray(override) ? override : [override]
        const n = served[key] ?? 0
        served[key] = n + 1
        return await list[Math.min(n, list.length - 1)]()
      }
      // only erik's current games are recorded; any other user simply has none in progress
      if (key.startsWith('api.chess.com-games-') && key !== 'api.chess.com-games-erik') {
        return jsonResponse({ games: [] })
      }
      if (
        key.startsWith('api.chess.com-month-') &&
        options.emptyMonthsExcept &&
        !options.emptyMonthsExcept.includes(key)
      ) {
        return jsonResponse({ games: [] })
      }
      return fixtureResponse(loadNetworkFixture(key))
    } finally {
      inFlight -= 1
    }
  }
  vi.stubGlobal('fetch', vi.fn(handler))
  return net
}

const monthCalls = (net: Net) => net.calls.filter((c) => /\/games\/\d{4}\/\d{2}$/.test(c))

/** In-memory sessionStorage (the file runs in the node environment because jsdom breaks loadFixture.ts). */
const sessionStore = new Map<string, string>()
function installStorage() {
  sessionStore.clear()
  const storage = {
    getItem: (k: string) => sessionStore.get(k) ?? null,
    setItem: (k: string, v: string) => void sessionStore.set(k, String(v)),
    removeItem: (k: string) => void sessionStore.delete(k),
    clear: () => sessionStore.clear(),
    key: (i: number) => [...sessionStore.keys()][i] ?? null,
    get length() {
      return sessionStore.size
    },
  }
  vi.stubGlobal('sessionStorage', storage)
  vi.stubGlobal('window', globalThis)
}

beforeEach(() => {
  installStorage()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

type Ok = Extract<ImportResult, { ok: true }>
function expectOk(r: ImportResult): Ok {
  if (!r.ok) throw new Error(`expected ok, got error ${r.error.code}: ${r.error.message}`)
  return r
}
function expectError(r: ImportResult, code: ImportErrorCode, message: string): ImportError {
  if (r.ok) throw new Error(`expected error ${code}, got ok (game ${r.game.id})`)
  expect(r.error.code).toBe(code)
  expect(r.error.message).toBe(message)
  return r.error
}
const fen4 = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

// Literal strings of Appendix F.1 / F.2 with the placeholders filled for the inputs used below.
const MSG = {
  I2: "Couldn't find this live game. If it's still being played, Chess.com only publishes it once it ends. Try again after the game finishes.",
  I6: 'No daily game with this id exists on Chess.com.',
  I7: 'No bot game with this id exists on Chess.com.',
  I8: "Games against Chess.com bots aren't in the public archive. Paste the game link (chess.com/game/computer/…) or the PGN instead.",
  I10b: "This link doesn't say whether it's a live, daily or bot game. Open the game on Chess.com and copy the full link (it contains /live/, /daily/ or /computer/).",
  I11: 'This game has no moves to analyse (it was aborted or decided before the first move).',
  I11b_ply3: "Couldn't decode this game's moves (problem at move 3). Paste the PGN instead.",
  I12: "Chess960 games aren't supported yet.",
  I13: "Bughouse games can't be analysed (Stockfish doesn't play this variant).",
  I14_crazyhouse: "Crazyhouse games can't be analysed (Stockfish doesn't play this variant).",
  I14_atomic: "Atomic games can't be analysed (Stockfish doesn't play this variant).",
  I17_newvariant: "This game type (newvariant) isn't supported.",
  I18: "Couldn't reach Chess.com right now. Try again in a moment, or paste the PGN.",
  I26: "Couldn't find this game on Lichess (or Lichess is unreachable). Check the link. It should look like lichess.org/AbCd1234.",
  I27_first: 'error',
  I27_second: 'Please only run 1 request(s) at a time',
  I28_study:
    'This is a Lichess study chapter, not a game. Open the game and copy its link (lichess.org/XXXXXXXX).',
  I28_puzzle: 'This is a Lichess puzzle, not a game. Open the game and copy its link (lichess.org/XXXXXXXX).',
  I28_broadcast:
    'This is a Lichess broadcast, not a game. Open the game and copy its link (lichess.org/XXXXXXXX).',
  I28_page: 'This is a Lichess page, not a game. Open the game and copy its link (lichess.org/XXXXXXXX).',
  I34: 'Paste a Chess.com game link (chess.com/game/live/…, /daily/…, /computer/…), a Lichess game link (lichess.org/XXXXXXXX) or a PGN.',
  I33_two: 'This PGN contains 2 games. Pick one.',
  P1: "Chess.com's firewall blocked our server's request (Cloudflare challenge). Enter the Chess.com username of either player and we'll fetch the game through Chess.com's public API instead, or paste the PGN.",
  P4: "Chess.com didn't answer in time. Try again, enter a player's username, or paste the PGN.",
  P5_id:
    "Importing by link needs a small server proxy, which this static build doesn't have. Enter the Chess.com username of either player (we'll find game 129688175007 through Chess.com's public API), or paste the PGN.",
  P6_name: 'Chess.com has no player named "nonexistent_user_xyz_123".',
  P7: 'Chess.com temporarily blocked archive downloads from your connection. Please paste the PGN (Chess.com → Share → PGN) or try again in a few minutes.',
  P8_2025_01: 'Searching 2025/01…',
} as const

// ---------------------------------------------------------------------------------------------------------------
// (1) String table snapshot: Appendix F.1 and F.2, written out literally. Key convention: the Appendix F row key
// ('I-2', ..., 'I-27b' for the second I-27 sentence, 'P-1' ...), named placeholders {kind} (I-10a), {variant} (I-14),
// {what} (I-28), {months} (P-9), the other placeholders as in the appendix. Rows without a string ((none), and
// I-5 whose string is "same as I-4") have no key of their own.
// ---------------------------------------------------------------------------------------------------------------
const EXPECTED_IMPORT_STRINGS: Record<string, string> = {
  'I-2':
    "Couldn't find this live game. If it's still being played, Chess.com only publishes it once it ends. Try again after the game finishes.",
  'I-4': 'This daily game is still in progress ({plyCount} moves so far). Analyse the moves played so far?',
  'I-6': 'No daily game with this id exists on Chess.com.',
  'I-7': 'No bot game with this id exists on Chess.com.',
  'I-8':
    "Games against Chess.com bots aren't in the public archive. Paste the game link (chess.com/game/computer/…) or the PGN instead.",
  'I-10a':
    "This link doesn't say whether it's a live or daily game. We found a {kind} game: {White} vs {Black}, {date}. If that's not the game you meant, open it on Chess.com and copy the full link (it contains /live/, /daily/ or /computer/).",
  'I-10b':
    "This link doesn't say whether it's a live, daily or bot game. Open the game on Chess.com and copy the full link (it contains /live/, /daily/ or /computer/).",
  'I-11': 'This game has no moves to analyse (it was aborted or decided before the first move).',
  'I-11b': "Couldn't decode this game's moves (problem at move {n}). Paste the PGN instead.",
  'I-12': "Chess960 games aren't supported yet.",
  'I-13': "Bughouse games can't be analysed (Stockfish doesn't play this variant).",
  'I-14': "{variant} games can't be analysed (Stockfish doesn't play this variant).",
  'I-15': 'Started from a custom position. Opening-book moves are not shown.',
  'I-17': "This game type ({type}) isn't supported.",
  'I-18': "Couldn't reach Chess.com right now. Try again in a moment, or paste the PGN.",
  'I-20':
    'This game is still in progress on Lichess (Lichess withholds the last 3 moves of live games). Analyse the moves available so far?',
  'I-21': 'Result unknown',
  'I-26':
    "Couldn't find this game on Lichess (or Lichess is unreachable). Check the link. It should look like lichess.org/AbCd1234.",
  'I-27': 'error',
  'I-27b': 'Please only run 1 request(s) at a time',
  'I-28': 'This is a Lichess {what}, not a game. Open the game and copy its link (lichess.org/XXXXXXXX).',
  'I-30': 'This PGN looks unfinished. Analyse the moves present?',
  'I-33': 'This PGN contains {n} games. Pick one.',
  'I-34':
    'Paste a Chess.com game link (chess.com/game/live/…, /daily/…, /computer/…), a Lichess game link (lichess.org/XXXXXXXX) or a PGN.',
  'I-36': 'In progress: {n} moves so far',
  'I-37': 'This review was made from a pasted PGN on another device; paste the PGN again.',
  'P-1':
    "Chess.com's firewall blocked our server's request (Cloudflare challenge). Enter the Chess.com username of either player and we'll fetch the game through Chess.com's public API instead, or paste the PGN.",
  'P-2': 'Chess.com is rate-limiting requests right now. Retrying in 2 seconds…',
  'P-3': 'Still rate-limited. Wait a minute and try again, or paste the PGN (Chess.com → Share → PGN).',
  'P-4': "Chess.com didn't answer in time. Try again, enter a player's username, or paste the PGN.",
  'P-5':
    "Importing by link needs a small server proxy, which this static build doesn't have. Enter the Chess.com username of either player (we'll find game {id} through Chess.com's public API), or paste the PGN.",
  'P-6': 'Chess.com has no player named "{username}".',
  'P-7':
    'Chess.com temporarily blocked archive downloads from your connection. Please paste the PGN (Chess.com → Share → PGN) or try again in a few minutes.',
  'P-8': 'Searching {YYYY}/{MM}…',
  'P-9':
    "Couldn't find game {id} in {username}'s recent archives ({months}). Check the username (either player works), or paste the PGN.",
  'P-10': 'Chess.com username (optional: shows which side is yours and is used as a fallback)',
  'P-11': 'Chess.com username of either player (required for Chess.com links)',
}

describe('IMPORT_STRINGS (Appendix F.1 and F.2)', () => {
  it('equals the literal table of the appendix', () => {
    expect(IMPORT_STRINGS).toEqual(EXPECTED_IMPORT_STRINGS)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// (2) One test per row of Appendix F.1: the path taken and, for errors, the exact string with placeholders filled.
// ---------------------------------------------------------------------------------------------------------------
describe('F.1 import outcomes', () => {
  it('I-1 chess.com live finished standard: imported through the proxy, no notice, no confirmation', async () => {
    const net = installNetwork()
    const r = expectOk(await importGame(cc('live', '129688175007'), VERCEL))
    expect(net.calls).toEqual([proxyUrl('live', '129688175007')])
    expect(r.via).toBe('proxy')
    expect(r.notice).toBeUndefined()
    expect(r.pendingConfirmation).toBeUndefined()
    expect(r.game).toMatchObject({
      id: 'cc:live:129688175007',
      site: 'chesscom',
      kind: 'live',
      customStart: false,
      inProgress: false,
      result: '1-0',
    })
    expect(r.game.moves).toHaveLength(112)
    expect(r.game.white.name).toBe('Arystanner')
    expect(r.game.black.name).toBe('Hikaru')
  })

  it('I-2 live 404 {"message":"Game is not found."}: live_not_found and no fallback to daily or the rewrite', async () => {
    const net = installNetwork()
    const r = await importGame(cc('live', '1859764312'), VERCEL)
    expectError(r, 'live_not_found', MSG.I2)
    expect(net.calls).toEqual([proxyUrl('live', '1859764312')])
  })

  it('I-3 chess.com daily finished: imported through the proxy', async () => {
    const net = installNetwork()
    const r = expectOk(await importGame(cc('daily', '285275822'), VERCEL))
    expect(net.calls).toEqual([proxyUrl('daily', '285275822')])
    expect(r.via).toBe('proxy')
    expect(r.pendingConfirmation).toBeUndefined()
    expect(r.game).toMatchObject({ id: 'cc:daily:285275822', kind: 'daily', inProgress: false })
    expect(r.game.moves).toHaveLength(37)
  })

  it('I-4 chess.com daily in progress (callback): pendingConfirmation in_progress_daily, 5 plies, not yet accepted', async () => {
    const net = installNetwork()
    const r = expectOk(await importGame(cc('daily', '1034198172'), VERCEL))
    expect(net.calls).toEqual([proxyUrl('daily', '1034198172')])
    expect(r.via).toBe('proxy')
    expect(r.pendingConfirmation).toBe('in_progress_daily')
    expect(r.notice).toBeUndefined()
    expect(r.game).toMatchObject({ id: 'cc:daily:1034198172', kind: 'daily', inProgress: false, result: '*' })
    expect(r.game.moves).toHaveLength(5)
  })

  it('I-5 chess.com daily in progress found in /pub/player/{u}/games (public API, Pages build)', async () => {
    const net = installNetwork({
      overrides: { 'api.chess.com-archives-erik': archivesOf('erik', MONTHS_2026.slice(0, 6)) },
      emptyMonthsExcept: ['api.chess.com-month-erik-2026-09'],
    })
    const r = expectOk(await importGame(cc('daily', '1034198172'), pagesOpts('erik')))
    expect(net.calls).toContain(currentGamesUrl('erik'))
    expect(net.maxInFlight).toBe(1)
    expect(r.via).toBe('public-api')
    expect(r.pendingConfirmation).toBe('in_progress_daily')
    expect(r.game).toMatchObject({ id: 'cc:daily:1034198172', kind: 'daily', inProgress: false })
    expect(r.game.moves).toHaveLength(5)
  })

  it('I-6 chess.com daily 404 []: daily_not_found, one request', async () => {
    const net = installNetwork()
    const r = await importGame(cc('daily', '1859764312'), VERCEL)
    expectError(r, 'daily_not_found', MSG.I6)
    expect(net.calls).toEqual([proxyUrl('daily', '1859764312')])
  })

  it('I-7 chess.com bot game 404 {"error":"Game not found"}: computer_not_found, one request', async () => {
    const net = installNetwork()
    const r = await importGame(cc('computer', '12345678'), VERCEL)
    expectError(r, 'computer_not_found', MSG.I7)
    expect(net.calls).toEqual([proxyUrl('computer', '12345678')])
  })

  it('I-7 a 200 with isVsComputer:true analyses, the bot side flagged as computer', async () => {
    const net = installNetwork()
    const r = expectOk(await importGame(cc('computer', '285275822'), VERCEL))
    expect(net.calls).toEqual([proxyUrl('computer', '285275822')])
    expect(r.via).toBe('proxy')
    expect(r.game).toMatchObject({ id: 'cc:computer:285275822', kind: 'computer', result: '0-1' })
    expect(r.game.moves).toHaveLength(54)
    expect(r.game.black.isComputer).toBe(true)
    expect(r.game.white.isComputer).toBeFalsy()
    expect(r.game.customStart).toBe(false) // the computer callback carries the full standard FEN as initialSetup
  })

  it('I-8 computer kind on the public API path: computer_via_public_api at once, nothing fetched', async () => {
    const net = installNetwork()
    const r = await importGame(cc('computer', '285275822'), pagesOpts('anomen_s'))
    expectError(r, 'computer_via_public_api', MSG.I8)
    expect(net.calls).toEqual([])
  })

  it('I-9 "Play vs Coach" archive entry: built from the entry own pgn, never from the callback (daily 234150048)', async () => {
    const net = installNetwork({
      overrides: { 'api.chess.com-archives-admdz_2015': archivesOf('admdz_2015', MONTHS_2026.slice(0, 6)) },
      emptyMonthsExcept: ['api.chess.com-month-admdz_2015-2026-09'],
    })
    const r = expectOk(await importGame(cc('daily', '234150048'), pagesOpts('admdz_2015')))
    expect(r.via).toBe('public-api')
    expect(net.calls.every((c) => c.startsWith('https://api.chess.com/pub/'))).toBe(true)

    const month = loadNetworkFixture('api.chess.com-month-admdz_2015-2026-09').body as {
      games: { url: string; pgn: string }[]
    }
    const entry = month.games.find((g) => g.url.endsWith('/game/daily/234150048'))!
    expect(entry.pgn).toContain('[Event "Play vs Coach"]')
    const white = /\[White "([^"]+)"\]/.exec(entry.pgn)![1]
    const black = /\[Black "([^"]+)"\]/.exec(entry.pgn)![1]
    expect(r.game.white.name).toBe(white)
    expect(r.game.black.name).toBe(black)
    // the callback for this id is an unrelated game (Oleksandr30 vs Opus64, 2019)
    expect(r.game.white.name).not.toBe('Oleksandr30')
    expect(r.game.black.name).not.toBe('Opus64')
    const reference = new Chess()
    reference.loadPgn(entry.pgn)
    expect(r.game.moves.map((m) => m.san)).toEqual(reference.history())
  })

  it('I-10a bare id on Vercel, live 200 and daily 404: ambiguous_resolved notice, live tried then daily', async () => {
    const net = installNetwork({
      overrides: { 'www.chess.com-daily-129688175007': () => jsonResponse([], 404) },
    })
    const r = expectOk(await importGame(cc('unknown', '129688175007'), VERCEL))
    expect(net.calls).toEqual([proxyUrl('live', '129688175007'), proxyUrl('daily', '129688175007')])
    expect(net.maxInFlight).toBe(1)
    expect(r.notice).toBe('ambiguous_resolved')
    expect(r.via).toBe('proxy')
    expect(r.pendingConfirmation).toBeUndefined()
    expect(r.game).toMatchObject({ id: 'cc:live:129688175007', kind: 'live' })
    expect(r.game.white.name).toBe('Arystanner')
    expect(r.game.moves).toHaveLength(112)
  })

  it('I-10a bare id on Vercel, live 404 and daily 200: the daily game is chosen', async () => {
    const net = installNetwork({
      overrides: {
        'www.chess.com-live-285275822': () => jsonResponse({ message: 'Game is not found.' }, 404),
      },
    })
    const r = expectOk(await importGame(cc('unknown', '285275822'), VERCEL))
    expect(net.calls).toEqual([proxyUrl('live', '285275822'), proxyUrl('daily', '285275822')])
    expect(r.notice).toBe('ambiguous_resolved')
    expect(r.game).toMatchObject({ id: 'cc:daily:285275822', kind: 'daily' })
    expect(r.game.moves).toHaveLength(37)
  })

  it('I-10b bare id 1034198172, both kinds 200: ambiguous_kind with both games as choices', async () => {
    installNetwork()
    const r = await importGame(cc('unknown', '1034198172'), VERCEL)
    const error = expectError(r, 'ambiguous_kind', MSG.I10b)
    expect(error.choices?.map((g) => g.id)).toEqual(['cc:live:1034198172', 'cc:daily:1034198172'])
    expect(error.choices?.map((g) => g.moves.length)).toEqual([78, 5])
  })

  it('I-10b bare id 285275822, both kinds 200: ambiguous_kind with both games as choices', async () => {
    installNetwork()
    const r = await importGame(cc('unknown', '285275822'), VERCEL)
    const error = expectError(r, 'ambiguous_kind', MSG.I10b)
    expect(error.choices?.map((g) => g.id)).toEqual(['cc:live:285275822', 'cc:daily:285275822'])
    expect(error.choices?.[1].moves).toHaveLength(37)
  })

  it('I-10b bare id, both kinds 404: ambiguous_kind, each endpoint asked exactly once', async () => {
    const net = installNetwork()
    const r = await importGame(cc('unknown', '1859764312'), VERCEL)
    const error = expectError(r, 'ambiguous_kind', MSG.I10b)
    expect(error.choices ?? []).toHaveLength(0)
    expect(net.calls).toEqual([proxyUrl('live', '1859764312'), proxyUrl('daily', '1859764312')])
  })

  it('I-10b bare id on Pages with no archive match: ambiguous_kind', async () => {
    const net = installNetwork({
      emptyMonthsExcept: ['api.chess.com-month-hikaru-2024-01', 'api.chess.com-month-hikaru-2025-01'],
    })
    const r = await importGame(cc('unknown', '97872578330'), pagesOpts('hikaru'))
    expectError(r, 'ambiguous_kind', MSG.I10b)
    expect(net.maxInFlight).toBe(1)
    expect(monthCalls(net).length).toBeLessThanOrEqual(9) // 3 live months + 6 daily months at most
  })

  it('I-11 zero moves (callback plyCount 0, moveList ""): zero_moves', async () => {
    const net = installNetwork()
    const r = await importGame(cc('live', '185013511419'), VERCEL)
    expectError(r, 'zero_moves', MSG.I11)
    expect(net.calls).toEqual([proxyUrl('live', '185013511419')])
  })

  it('I-11 zero moves (lichess aborted, moves ""): zero_moves', async () => {
    installNetwork({
      overrides: { 'lichess.org-game-AbCd1234': handmade('lichess/export-aborted-zero-moves.json') },
    })
    const r = await importGame(lichess('AbCd1234'), VERCEL)
    expectError(r, 'zero_moves', MSG.I11)
  })

  it('I-11 zero moves (PGN with no moves, Result *): zero_moves, not the unfinished-PGN confirmation', async () => {
    installNetwork()
    const r = await importGame(pgnInput('pgn/zero-moves.pgn'), VERCEL)
    expectError(r, 'zero_moves', MSG.I11)
  })

  it('I-11b illegal move while replaying a TCN (ply 3): decode_failed with the ply number', async () => {
    installNetwork({
      overrides: { 'www.chess.com-live-999000000001': handmade('chesscom/callback-corrupted-tcn.json') },
    })
    const r = await importGame(cc('live', '999000000001'), VERCEL)
    const error = expectError(r, 'decode_failed', MSG.I11b_ply3)
    expect(error.detail).toMatchObject({ n: 3 })
  })

  it('I-11b illegal move while replaying a PGN (ply 3): decode_failed with the ply number', async () => {
    installNetwork()
    const r = await importGame(pgnInput('pgn/illegal-move.pgn'), VERCEL)
    expectError(r, 'decode_failed', MSG.I11b_ply3)
  })

  it('I-11b control: the uncorrupted hand-made callback imports with its 5 plies', async () => {
    installNetwork({
      overrides: { 'www.chess.com-live-999000000001': handmade('chesscom/callback-valid-5ply.json') },
    })
    const r = expectOk(await importGame(cc('live', '999000000001'), VERCEL))
    expect(r.game.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Nc3'])
  })

  it('R4: plyCount that disagrees with moveList.length / 2 fails the import', async () => {
    installNetwork({
      overrides: {
        'www.chess.com-live-999000000001': handmadeWith('chesscom/callback-valid-5ply.json', { plyCount: 6 }),
      },
    })
    const r = await importGame(cc('live', '999000000001'), VERCEL)
    expect(r.ok).toBe(false)
  })

  it('I-12 chess960 (callback type chess960): variant_chess960', async () => {
    const net = installNetwork()
    const r = await importGame(cc('live', '184659320776'), VERCEL)
    expectError(r, 'variant_chess960', MSG.I12)
    expect(net.calls).toEqual([proxyUrl('live', '184659320776')])
  })

  it('I-12 chess960 (lichess variant chess960): variant_chess960', async () => {
    installNetwork()
    const r = await importGame(lichess('2vUNiLP8'), VERCEL)
    expectError(r, 'variant_chess960', MSG.I12)
  })

  it('I-12 chess960 (PGN [Variant "Chess960"]): variant_chess960', async () => {
    installNetwork()
    const r = await importGame(pgnInput('pgn/chess960.pgn'), VERCEL)
    expectError(r, 'variant_chess960', MSG.I12)
  })

  it('I-13 bughouse (callback type bughouse): variant_unsupported with the bughouse string', async () => {
    installNetwork()
    const r = await importGame(cc('live', '184867110839'), VERCEL)
    expectError(r, 'variant_unsupported', MSG.I13)
  })

  it('I-13 bughouse (any TCN drop ply in a game that claims type chess): variant_unsupported', async () => {
    installNetwork({
      overrides: { 'www.chess.com-live-999000000003': handmade('chesscom/callback-tcn-drops.json') },
    })
    const r = await importGame(cc('live', '999000000003'), VERCEL)
    expectError(r, 'variant_unsupported', MSG.I13)
  })

  it('I-13 bughouse (archive entry without a pgn key, public API)', async () => {
    installNetwork({
      overrides: {
        'api.chess.com-archives-2468kaswer': archivesOf('2468kaswer', ['2026/08', '2026/09', '2026/10']),
      },
      emptyMonthsExcept: ['api.chess.com-month-2468kaswer-2026-09'],
    })
    const r = await importGame(cc('live', '184867110839'), pagesOpts('2468kaswer'))
    expectError(r, 'variant_unsupported', MSG.I13)
  })

  it('I-14 crazyhouse (callback type crazyhouse): variant_unsupported naming the variant', async () => {
    installNetwork({
      overrides: { 'www.chess.com-live-999000000004': handmade('chesscom/callback-crazyhouse.json') },
    })
    const r = await importGame(cc('live', '999000000004'), VERCEL)
    expectError(r, 'variant_unsupported', MSG.I14_crazyhouse)
  })

  it('I-14 crazyhouse (lichess variant crazyhouse, moves with @): variant_unsupported naming the variant', async () => {
    installNetwork()
    const r = await importGame(lichess('6kcoXS0y'), VERCEL)
    expectError(r, 'variant_unsupported', MSG.I14_crazyhouse)
  })

  it('I-14 other variant (PGN [Variant "Atomic"]): variant_unsupported naming the variant', async () => {
    installNetwork()
    const r = await importGame(pgnInput('pgn/variant-atomic.pgn'), VERCEL)
    expectError(r, 'variant_unsupported', MSG.I14_atomic)
  })

  it('I-14 any SAN containing @ (PGN without a Variant header): variant_unsupported', async () => {
    installNetwork()
    const r = await importGame(pgnInput('pgn/drop-san.pgn'), VERCEL)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('variant_unsupported')
    expect(r.error.message).toMatch(/ games can't be analysed \(Stockfish doesn't play this variant\)\.$/)
  })

  it('I-15a custom start, chess.com type oddschess: analysed from the FEN with the custom_start notice', async () => {
    installNetwork()
    const r = expectOk(await importGame(cc('live', '174531660852'), VERCEL))
    expect(r.notice).toBe('custom_start')
    expect(r.pendingConfirmation).toBeUndefined()
    expect(r.game.customStart).toBe(true)
    expect(fen4(r.game.startFen)).toBe('3k4/pppppppp/8/8/8/8/PPPPPPPP/4K3 w - -')
    expect(fen4(r.game.moves[0].before)).toBe(fen4(r.game.startFen))
  })

  it('I-15b custom start, rules chess with a non-standard initialSetup (daily 1000337106): custom_start notice', async () => {
    installNetwork()
    const r = expectOk(await importGame(cc('daily', '1000337106'), VERCEL))
    expect(r.notice).toBe('custom_start')
    expect(r.game.customStart).toBe(true)
    expect(fen4(r.game.startFen)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq -')
    expect(r.game.moves[13].san).toBe('O-O-O')
    expect(r.game.moves[14].san).toBe('O-O-O')
  })

  it('I-15c custom start, lichess variant fromPosition with initialFen (4S1PZUvW): custom_start notice', async () => {
    installNetwork()
    const r = expectOk(await importGame(lichess('4S1PZUvW'), VERCEL))
    expect(r.via).toBe('lichess')
    expect(r.notice).toBe('custom_start')
    expect(r.game.customStart).toBe(true)
    expect(fen4(r.game.startFen)).toBe('8/8/8/8/3k4/8/R7/R3K3 w Q -')
    expect(r.game.moves).toHaveLength(13)
  })

  it('I-15d custom start, PGN [SetUp "1"] with a non-standard [FEN]; Variant absent, From Position or Odds Chess', async () => {
    installNetwork()
    const base = readFixtureText('pgn/custom-fen.pgn').trim()
    for (const header of ['', '[Variant "From Position"]\n', '[Variant "Odds Chess"]\n']) {
      const r = expectOk(await importGame({ kind: 'pgn', pgn: header + base }, VERCEL))
      expect(r.via).toBe('pgn')
      expect(r.notice).toBe('custom_start')
      expect(r.game.customStart).toBe(true)
      expect(fen4(r.game.startFen)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq -')
      expect(r.game.moves).toHaveLength(8)
    }
  })

  it('I-17 chess.com type not in the known list (newvariant): type_unknown naming the value', async () => {
    installNetwork({
      overrides: { 'www.chess.com-live-999000000002': handmade('chesscom/callback-newvariant.json') },
    })
    const r = await importGame(cc('live', '999000000002'), VERCEL)
    expectError(r, 'type_unknown', MSG.I17_newvariant)
  })

  it('I-18 network error on both proxy paths, no username: proxy_unreachable, proxyDown memo set, username field wanted', async () => {
    const net = installNetwork({
      overrides: {
        'www.chess.com-live-129688175007': networkError,
      },
    })
    const before = Date.now()
    const r = await importGame(cc('live', '129688175007'), VERCEL)
    const error = expectError(r, 'proxy_unreachable', MSG.I18)
    expect(error.needsUsername).toBe(true)
    // function first, then the zero-code rewrite, each once
    expect(net.calls).toEqual([proxyUrl('live', '129688175007'), rewriteUrl('live', '129688175007')])
    const memo = Number(sessionStore.get('proxyDown'))
    expect(Number.isFinite(memo)).toBe(true)
    expect(memo).toBeGreaterThanOrEqual(before)
  })

  it('I-18 a 502 from the function and a network error from the rewrite: proxy_unreachable', async () => {
    const net = installNetwork({
      overrides: {
        'www.chess.com-live-129688175007': [
          () => jsonResponse({ error: 'upstream_error', upstreamStatus: 500 }, 502),
          networkError,
        ],
      },
    })
    const r = await importGame(cc('live', '129688175007'), VERCEL)
    expectError(r, 'proxy_unreachable', MSG.I18)
    expect(net.calls).toEqual([proxyUrl('live', '129688175007'), rewriteUrl('live', '129688175007')])
  })

  it('I-19 lichess standard finished: imported, no notice, no confirmation', async () => {
    const net = installNetwork()
    const r = expectOk(await importGame(lichess('TJxUmbWK'), VERCEL))
    expect(net.calls).toHaveLength(1)
    expect(net.calls[0]).toMatch(/^https:\/\/lichess\.org\/game\/export\/TJxUmbWK(\?|$)/)
    expect(r.via).toBe('lichess')
    expect(r.notice).toBeUndefined()
    expect(r.pendingConfirmation).toBeUndefined()
    expect(r.game).toMatchObject({
      id: 'li:TJxUmbWK',
      site: 'lichess',
      customStart: false,
      inProgress: false,
    })
    expect(r.game.moves.length).toBeGreaterThan(0)
  })

  it('I-20 lichess ongoing (status started, source pool): pendingConfirmation in_progress_lichess', async () => {
    installNetwork()
    const r = expectOk(await importGame(lichess('f3mYca1i'), VERCEL))
    expect(r.via).toBe('lichess')
    expect(r.pendingConfirmation).toBe('in_progress_lichess')
    expect(r.game).toMatchObject({ id: 'li:f3mYca1i', inProgress: false })
    expect(r.game.moves.length).toBeGreaterThan(0)
  })

  it('I-21 lichess imported game (source import, status started, 39 plies): finished, result unknown', async () => {
    installNetwork()
    const r = expectOk(await importGame(lichess('4pSpQGR7'), VERCEL))
    expect(r.pendingConfirmation).toBeUndefined()
    expect(r.game).toMatchObject({ id: 'li:4pSpQGR7', result: '*', inProgress: false })
    expect(r.game.moves).toHaveLength(39)
  })

  it('I-26 lichess fetch rejects with a TypeError (CORS-less 404): lichess_not_found, no retry', async () => {
    const net = installNetwork({ overrides: { 'lichess.org-game-zzzzzzzz': networkError } })
    const r = await importGame(lichess('zzzzzzzz'), VERCEL)
    expectError(r, 'lichess_not_found', MSG.I26)
    expect(net.calls).toHaveLength(1)
  })

  it('I-27 lichess 429 then 200: first sentence through onStatus, one retry after 60 s, then imported', async () => {
    vi.useFakeTimers()
    const net = installNetwork({
      overrides: {
        'lichess.org-game-4S1PZUvW': [
          handmade('lichess/export-rate-limited-429.json'),
          recorded('lichess.org-game-4S1PZUvW'),
        ],
      },
    })
    const statuses: [string, string][] = []
    const pending = importGame(lichess('4S1PZUvW'), {
      ...VERCEL,
      onStatus: (key, message) => statuses.push([key, message]),
    })
    await vi.advanceTimersByTimeAsync(59_000)
    expect(net.calls).toHaveLength(1)
    expect(statuses).toContainEqual(['I-27', MSG.I27_first])
    await vi.advanceTimersByTimeAsync(1_000)
    const r = expectOk(await pending)
    expect(net.calls).toHaveLength(2)
    expect(r.via).toBe('lichess')
    expect(r.game.moves).toHaveLength(13)
  })

  it('I-27 lichess 429 twice: lichess_rate_limited with the second sentence, exactly one automatic retry', async () => {
    vi.useFakeTimers()
    const net = installNetwork({
      overrides: { 'lichess.org-game-4S1PZUvW': handmade('lichess/export-rate-limited-429.json') },
    })
    const pending = importGame(lichess('4S1PZUvW'), VERCEL)
    await vi.advanceTimersByTimeAsync(60_000)
    const r = await pending
    expectError(r, 'lichess_rate_limited', MSG.I27_second)
    await vi.advanceTimersByTimeAsync(300_000)
    expect(net.calls).toHaveLength(2)
  })

  it.each([
    ['study chapter', MSG.I28_study],
    ['puzzle', MSG.I28_puzzle],
    ['broadcast', MSG.I28_broadcast],
    ['page', MSG.I28_page],
  ] as const)(
    'I-28 lichess %s, not a game: lichess_not_a_game without any request',
    async (what, message) => {
      const net = installNetwork()
      const r = await importGame({ kind: 'lichess_not_a_game', what }, VERCEL)
      expectError(r, 'lichess_not_a_game', message)
      expect(net.calls).toEqual([])
    },
  )

  it('I-29 PGN paste, standard, finished: imported with names, clocks and a hashed id', async () => {
    const net = installNetwork()
    const r = expectOk(await importGame(pgnInput('pgn/standard-finished.pgn'), VERCEL))
    expect(net.calls).toEqual([])
    expect(r.via).toBe('pgn')
    expect(r.notice).toBeUndefined()
    expect(r.pendingConfirmation).toBeUndefined()
    expect(r.game.id).toMatch(/^pgn:[0-9a-f]{12}$/)
    expect(r.game).toMatchObject({ site: 'pgn', customStart: false, inProgress: false, result: '1-0' })
    expect(r.game.moves).toHaveLength(33)
    expect(r.game.white.name).toBe('Paul Morphy')
    expect(r.game.clocks).toHaveLength(33)
    expect(r.game.clocks?.[0]).toBe(6000) // {[%clk 0:10:00]} after ply 1, in tenths of a second
    expect(r.game.clocks?.[1]).toBe(5970) // {[%clk 0:09:57]}
  })

  it('I-29 the pgn id depends on the movetext only: same moves give the same id, other moves another', async () => {
    installNetwork()
    const text = readFixtureText('pgn/standard-finished.pgn').trim()
    const a = expectOk(await importGame({ kind: 'pgn', pgn: text }, VERCEL))
    const b = expectOk(
      await importGame({ kind: 'pgn', pgn: text.replace('Paul Morphy', 'Someone Else') }, VERCEL),
    )
    const c = expectOk(await importGame(pgnInput('pgn/setup-standard-fen.pgn'), VERCEL))
    expect(b.game.id).toBe(a.game.id)
    expect(c.game.id).not.toBe(a.game.id)
  })

  it('I-30 PGN with [Result "*"]: pendingConfirmation pgn_unfinished', async () => {
    installNetwork()
    const r = expectOk(await importGame(pgnInput('pgn/unfinished.pgn'), VERCEL))
    expect(r.via).toBe('pgn')
    expect(r.pendingConfirmation).toBe('pgn_unfinished')
    expect(r.game).toMatchObject({ result: '*', inProgress: false })
    expect(r.game.moves).toHaveLength(8)
  })

  it('I-33 PGN with two [Event blocks: pgn_multiple listing both games as choices', async () => {
    installNetwork()
    const r = await importGame(pgnInput('pgn/multi-game.pgn'), VERCEL)
    const error = expectError(r, 'pgn_multiple', MSG.I33_two)
    expect(error.choices).toHaveLength(2)
    expect(error.choices?.map((g) => g.moves.length)).toEqual([7, 6])
    expect(error.choices?.map((g) => g.white.name)).toEqual(['Alice', 'Carol'])
  })

  it('I-34 no regex match, not a pgn: unrecognised', async () => {
    const net = installNetwork()
    const r = await importGame({ kind: 'unrecognised' }, VERCEL)
    expectError(r, 'unrecognised', MSG.I34)
    expect(net.calls).toEqual([])
  })

  it('I-36 an in-progress game accepted with "Analyse so far": confirmInProgress sets inProgress true', async () => {
    installNetwork()
    const r = expectOk(await importGame(cc('daily', '1034198172'), VERCEL))
    expect(r.game.inProgress).toBe(false)
    const before = structuredClone(r.game)
    const accepted = confirmInProgress(r.game)
    expect(accepted.inProgress).toBe(true)
    expect(accepted).toEqual({ ...before, inProgress: true })
    expect(accepted.moves).toHaveLength(5)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// R2: the kind selects exactly one endpoint; only the bare link tries live then daily, once each, one after the other.
// ---------------------------------------------------------------------------------------------------------------
describe('R2 request sequence for bare ids on the Vercel build', () => {
  it.each(['1034198172', '285275822'])(
    'bare id %s: exactly one live and one daily request, in that order, never in parallel',
    async (id) => {
      const net = installNetwork()
      const r = await importGame(cc('unknown', id), VERCEL)
      expect(net.calls).toEqual([proxyUrl('live', id), proxyUrl('daily', id)])
      expect(net.maxInFlight).toBe(1)
      expectError(r, 'ambiguous_kind', MSG.I10b)
    },
  )

  it('an explicit live link never falls back to daily after a 404', async () => {
    const net = installNetwork()
    await importGame(cc('live', '1859764312'), VERCEL)
    expect(net.calls).toEqual([proxyUrl('live', '1859764312')])
  })

  it('an explicit daily link never falls back to live after a 404', async () => {
    const net = installNetwork()
    await importGame(cc('daily', '1859764312'), VERCEL)
    expect(net.calls).toEqual([proxyUrl('daily', '1859764312')])
  })

  it('an explicit computer link never falls back to live or daily after a 404', async () => {
    const net = installNetwork()
    await importGame(cc('computer', '12345678'), VERCEL)
    expect(net.calls).toEqual([proxyUrl('computer', '12345678')])
  })
})

// ---------------------------------------------------------------------------------------------------------------
// F.2 rows reachable without timers.
// ---------------------------------------------------------------------------------------------------------------
describe('F.2 proxy and public API outcomes', () => {
  it('P-1 blocked on both proxy paths (503 upstream_blocked, then a 403 HTML challenge): proxy_blocked, username wanted', async () => {
    const net = installNetwork({
      overrides: {
        'www.chess.com-live-129688175007': [
          () =>
            jsonResponse({ error: 'upstream_blocked', upstreamStatus: 403, cfMitigated: 'challenge' }, 503),
          () => htmlResponse(403),
        ],
      },
    })
    const r = await importGame(cc('live', '129688175007'), VERCEL)
    const error = expectError(r, 'proxy_blocked', MSG.P1)
    expect(error.needsUsername).toBe(true)
    expect(net.calls).toEqual([proxyUrl('live', '129688175007'), rewriteUrl('live', '129688175007')])
    expect(Number.isFinite(Number(sessionStore.get('proxyDown')))).toBe(true)
  })

  it('P-4 504 from the function and from the rewrite: proxy_timeout, username wanted', async () => {
    const net = installNetwork({
      overrides: {
        'www.chess.com-live-129688175007': [
          () => jsonResponse({ error: 'upstream_timeout' }, 504),
          () => jsonResponse({ error: 'upstream_timeout' }, 504),
        ],
      },
    })
    const r = await importGame(cc('live', '129688175007'), VERCEL)
    const error = expectError(r, 'proxy_timeout', MSG.P4)
    expect(error.needsUsername).toBe(true)
    expect(net.calls).toEqual([proxyUrl('live', '129688175007'), rewriteUrl('live', '129688175007')])
  })

  it('P-5 Pages build, chess.com link, no username: pages_needs_username with the game id, nothing fetched', async () => {
    const net = installNetwork()
    const r = await importGame(cc('live', '129688175007'), pagesOpts())
    const error = expectError(r, 'pages_needs_username', MSG.P5_id)
    expect(error.needsUsername).toBe(true)
    expect(net.calls).toEqual([])
  })

  it('P-6 unknown user (public API 404 "User ... not found."): user_not_found naming the username', async () => {
    const notFound = recorded('api.chess.com-month-nonexistent_user_xyz_123-2026-09')
    const net = installNetwork({
      overrides: {
        'api.chess.com-archives-nonexistent_user_xyz_123': notFound,
        'api.chess.com-month-nonexistent_user_xyz_123-2026-09': notFound,
      },
    })
    const r = await importGame(cc('live', '129688175007'), pagesOpts('nonexistent_user_xyz_123'))
    expectError(r, 'user_not_found', MSG.P6_name)
    expect(net.calls.length).toBeGreaterThanOrEqual(1)
    expect(net.calls.every((c) => c.includes('/pub/player/nonexistent_user_xyz_123/'))).toBe(true)
  })

  it('P-7 archives answered 403 text/plain "Blocked: ...": archive_blocked, scan stops', async () => {
    const net = installNetwork({
      overrides: { 'api.chess.com-archives-hikaru': handmade('chesscom/archive-blocked-403.json') },
    })
    const r = await importGame(cc('live', '129688175007'), pagesOpts('hikaru'))
    expectError(r, 'archive_blocked', MSG.P7)
    expect(net.calls).toEqual([archivesUrl('hikaru')])
  })

  it('P-7 a month answered 403 text/plain "Blocked: ...": archive_blocked, no further month is fetched', async () => {
    const net = installNetwork({
      overrides: { 'api.chess.com-month-hikaru-2025-01': handmade('chesscom/archive-blocked-403.json') },
    })
    const r = await importGame(cc('live', '129688175007'), pagesOpts('hikaru'))
    expectError(r, 'archive_blocked', MSG.P7)
    expect(net.calls).toEqual([archivesUrl('hikaru'), monthUrl('hikaru', '2025/01')])
  })

  it('P-8 progress: each month fetched is announced as "Searching YYYY/MM…" and the game is found (hikaru 2025/01)', async () => {
    const net = installNetwork()
    const statuses: [string, string][] = []
    const r = expectOk(
      await importGame(cc('live', '129688175007'), {
        ...pagesOpts('hikaru'),
        onStatus: (key, message) => statuses.push([key, message]),
      }),
    )
    expect(statuses).toContainEqual(['P-8', MSG.P8_2025_01])
    // serial, the predicted month (the id is the 2025-01 anchor) first, and the scan stops at the first match
    expect(net.calls).toEqual([archivesUrl('hikaru'), monthUrl('hikaru', '2025/01')])
    expect(net.maxInFlight).toBe(1)
    expect(r.via).toBe('public-api')
    expect(r.game).toMatchObject({ id: 'cc:live:129688175007', kind: 'live' })
    expect(r.game.moves).toHaveLength(112)
  })

  it('P-9 username path exhausted its month cap (live id not in the three predicted months): archive_not_found', async () => {
    const net = installNetwork({
      emptyMonthsExcept: ['api.chess.com-month-hikaru-2024-01', 'api.chess.com-month-hikaru-2025-01'],
    })
    const r = await importGame(cc('live', '97872578330'), pagesOpts('hikaru'))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('archive_not_found')
    // "Couldn't find game {id} in {username}'s recent archives ({months scanned}). Check the username ..."
    expect(r.error.message).toMatch(
      /^Couldn't find game 97872578330 in hikaru's recent archives \((.+)\)\. Check the username \(either player works\), or paste the PGN\.$/,
    )
    expect(r.error.message).toContain('2024/01') // the predicted month (the id sits next to the 2024-01 anchor)
    expect(monthCalls(net).length).toBeLessThanOrEqual(3)
    expect(net.maxInFlight).toBe(1)
  })
})
