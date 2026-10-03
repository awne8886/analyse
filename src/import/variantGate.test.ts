// @vitest-environment node
// PROMPT.md section 3.9 risk 9 (Chess960 and other variants) and risk 10 (in-progress games), the variant gate of
// section 3.3, R5 (start position from the data) and R6, all through importGame with a mocked global fetch that
// answers from recorded fixtures (PLAN.md Assumption 13) and the hand-made ones under src/test/fixtures/.
// The node environment is deliberate: src/test/loadFixture.ts calls fileURLToPath(new URL(...)) at import time,
// which throws under jsdom (jsdom's URL is not Node's URL).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fixtureResponse,
  loadNetworkFixture,
  readFixtureText,
  type NetworkFixture,
} from '../test/loadFixture'
import type { ChesscomKind, ImportError, ImportErrorCode, ImportResult, ParsedInput } from '../types/game'
import { confirmInProgress, importGame, type ImportOptions } from './index'

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
const monthUrl = (user: string, ym: string) => `https://api.chess.com/pub/player/${user}/games/${ym}`

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

// Literal strings of Appendix F.1 with the placeholders filled for the inputs used below.
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

const QUEEN_ODDS_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1'
const GATE_MESSAGE = /^.+ games can't be analysed \(Stockfish doesn't play this variant\)\.$/
const VALID = 'chesscom/callback-valid-5ply.json'
const plyCountOf = (name: string) =>
  (loadNetworkFixture(name).body as { game: { plyCount: number } }).game.plyCount

/** a recorded fixture whose top-level body fields are overridden (lichess export JSON) */
const recordedWith =
  (name: string, patch: Record<string, unknown>): Factory =>
  () => {
    const f = loadNetworkFixture(name)
    Object.assign(f.body as Record<string, unknown>, patch)
    return fixtureResponse(f)
  }

// ---------------------------------------------------------------------------------------------------------------
// Risk 9: Chess960 and other variants (PROMPT.md 3.9). The gate runs on the imported data, in this order: parse
// errors, variant, zero moves, custom start, in-progress confirmation (section 3.3).
// ---------------------------------------------------------------------------------------------------------------
describe('risk 9: Chess960 is rejected before any decoding', () => {
  it.each([
    ['live', '184659320776'],
    ['daily', '1020832882'],
  ] as const)('chess.com %s %s (type chess960, X-FEN initialSetup)', async (kind, id) => {
    const net = installNetwork()
    const r = await importGame(cc(kind, id), VERCEL)
    expectError(r, 'variant_chess960', MSG.I12)
    expect(net.calls).toEqual([proxyUrl(kind, id)])
  })

  it('daily 1036320138 (A.3: nrnkqrbb/... w FBfb, tcn nD1Low4...) is rejected by the gate, one request only', async () => {
    const net = installNetwork({
      overrides: {
        'www.chess.com-daily-1036320138': handmade('chesscom/callback-chess960-daily-1036320138.json'),
      },
    })
    const r = await importGame(cc('daily', '1036320138'), VERCEL)
    expectError(r, 'variant_chess960', MSG.I12)
    expect(net.calls).toEqual([proxyUrl('daily', '1036320138')])
  })

  it('an initialSetup with X-FEN castling letters (w HAha) alone marks Chess960 even when type says chess', async () => {
    installNetwork({
      overrides: { 'www.chess.com-live-999000000005': handmade('chesscom/callback-xfen-castling.json') },
    })
    const r = await importGame(cc('live', '999000000005'), VERCEL)
    expectError(r, 'variant_chess960', MSG.I12)
  })

  it('lichess 2vUNiLP8 (variant chess960, finished)', async () => {
    installNetwork()
    expectError(await importGame(lichess('2vUNiLP8'), VERCEL), 'variant_chess960', MSG.I12)
  })

  it('PGN with [Variant "Chess960"]', async () => {
    installNetwork()
    expectError(await importGame(pgnInput('pgn/chess960.pgn'), VERCEL), 'variant_chess960', MSG.I12)
  })

  it('the variant check precedes decoding: a chess960 callback with a corrupt moveList is still I-12', async () => {
    installNetwork({
      overrides: {
        'www.chess.com-live-999000000001': handmadeWith(VALID, { type: 'chess960', moveList: 'mC0KgA5Qbs' }),
      },
    })
    expectError(await importGame(cc('live', '999000000001'), VERCEL), 'variant_chess960', MSG.I12)
  })

  it('the variant check precedes the zero-move check', async () => {
    installNetwork({
      overrides: {
        'www.chess.com-live-999000000001': handmadeWith(VALID, {
          type: 'chess960',
          moveList: '',
          plyCount: 0,
        }),
      },
    })
    expectError(await importGame(cc('live', '999000000001'), VERCEL), 'variant_chess960', MSG.I12)
  })
})

describe('risk 9: bughouse and the other unsupported variants', () => {
  it.each(['184867110839', '184546110505'])(
    'chess.com live %s (type bughouse, partnerGameId set)',
    async (id) => {
      const net = installNetwork()
      const r = await importGame(cc('live', id), VERCEL)
      expectError(r, 'variant_unsupported', MSG.I13)
      expect(net.calls).toEqual([proxyUrl('live', id)])
    },
  )

  it('any TCN drop ply is bughouse, even when the game claims type chess (A.3 bughouse tcn)', async () => {
    installNetwork({
      overrides: { 'www.chess.com-live-999000000003': handmade('chesscom/callback-tcn-drops.json') },
    })
    expectError(await importGame(cc('live', '999000000003'), VERCEL), 'variant_unsupported', MSG.I13)
  })

  it('a bughouse game with zero moves is still reported as bughouse', async () => {
    installNetwork({
      overrides: {
        'www.chess.com-live-999000000001': handmadeWith(VALID, {
          type: 'bughouse',
          moveList: '',
          plyCount: 0,
          partnerGameId: 999000000009,
        }),
      },
    })
    expectError(await importGame(cc('live', '999000000001'), VERCEL), 'variant_unsupported', MSG.I13)
  })

  it('public API archive entry of a bughouse game (no pgn key, rules bughouse) is rejected', async () => {
    installNetwork({
      overrides: {
        'api.chess.com-archives-2468kaswer': archivesOf('2468kaswer', ['2026/08', '2026/09', '2026/10']),
      },
      emptyMonthsExcept: ['api.chess.com-month-2468kaswer-2026-09'],
    })
    const month = loadNetworkFixture('api.chess.com-month-2468kaswer-2026-09').body as {
      games: { url: string; rules: string; pgn?: string }[]
    }
    const entry = month.games.find((g) => g.url.endsWith('/game/live/184867110839'))!
    expect(entry.rules).toBe('bughouse')
    expect(entry.pgn).toBeUndefined()
    const r = await importGame(cc('live', '184867110839'), pagesOpts('2468kaswer'))
    expectError(r, 'variant_unsupported', MSG.I13)
  })

  it('chess.com crazyhouse (hand-made callback): variant_unsupported naming Crazyhouse', async () => {
    installNetwork({
      overrides: { 'www.chess.com-live-999000000004': handmade('chesscom/callback-crazyhouse.json') },
    })
    expectError(
      await importGame(cc('live', '999000000004'), VERCEL),
      'variant_unsupported',
      MSG.I14_crazyhouse,
    )
  })

  it.each(['threecheck', 'kingofthehill', 'crazyhouse'])(
    'chess.com type %s: variant_unsupported',
    async (type) => {
      installNetwork({
        overrides: { 'www.chess.com-live-999000000001': handmadeWith(VALID, { type }) },
      })
      const r = await importGame(cc('live', '999000000001'), VERCEL)
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.code).toBe('variant_unsupported')
      expect(r.error.message).toMatch(GATE_MESSAGE)
    },
  )

  it('lichess 6kcoXS0y (crazyhouse, moves with @): variant_unsupported naming Crazyhouse', async () => {
    installNetwork()
    expectError(await importGame(lichess('6kcoXS0y'), VERCEL), 'variant_unsupported', MSG.I14_crazyhouse)
  })

  it.each(['antichess', 'atomic', 'horde', 'kingOfTheHill', 'racingKings', 'threeCheck'])(
    'lichess variant %s: variant_unsupported, never analysed',
    async (variant) => {
      installNetwork({
        overrides: { 'lichess.org-game-TJxUmbWK': recordedWith('lichess.org-game-TJxUmbWK', { variant }) },
      })
      const r = await importGame(lichess('TJxUmbWK'), VERCEL)
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.error.code).toBe('variant_unsupported')
      expect(r.error.message).toMatch(GATE_MESSAGE)
    },
  )

  it('PGN [Variant "Atomic"]: variant_unsupported naming Atomic', async () => {
    installNetwork()
    expectError(
      await importGame(pgnInput('pgn/variant-atomic.pgn'), VERCEL),
      'variant_unsupported',
      MSG.I14_atomic,
    )
  })

  it('PGN with a drop SAN (N@f3) and no Variant header: variant_unsupported', async () => {
    installNetwork()
    const r = await importGame(pgnInput('pgn/drop-san.pgn'), VERCEL)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('variant_unsupported')
    expect(r.error.message).toMatch(GATE_MESSAGE)
  })

  it('unknown rules value newvariant: type_unknown naming the value', async () => {
    installNetwork({
      overrides: { 'www.chess.com-live-999000000002': handmade('chesscom/callback-newvariant.json') },
    })
    expectError(await importGame(cc('live', '999000000002'), VERCEL), 'type_unknown', MSG.I17_newvariant)
  })

  it('any other unknown value is named too (no hard-coded list of unknown names)', async () => {
    installNetwork({
      overrides: { 'www.chess.com-live-999000000001': handmadeWith(VALID, { type: 'zebrachess' }) },
    })
    expectError(
      await importGame(cc('live', '999000000001'), VERCEL),
      'type_unknown',
      "This game type (zebrachess) isn't supported.",
    )
  })
})

describe('risk 9: games that are analysed from their own start position (custom start, banner I-15)', () => {
  it('live 174531660852 (type oddschess): analysed from the FEN, custom_start notice', async () => {
    installNetwork()
    const r = expectOk(await importGame(cc('live', '174531660852'), VERCEL))
    expect(r.notice).toBe('custom_start')
    expect(r.pendingConfirmation).toBeUndefined()
    expect(r.game.customStart).toBe(true)
    expect(fen4(r.game.startFen)).toBe('3k4/pppppppp/8/8/8/8/PPPPPPPP/4K3 w - -')
    expect(r.game.moves).toHaveLength(plyCountOf('www.chess.com-live-174531660852'))
    expect(fen4(r.game.moves[0].before)).toBe(fen4(r.game.startFen))
  })

  it('daily 1000337106 (rules chess, queen odds initialSetup): decoded from its FEN, castling normalised', async () => {
    installNetwork()
    const r = expectOk(await importGame(cc('daily', '1000337106'), VERCEL))
    expect(r.notice).toBe('custom_start')
    expect(r.game.customStart).toBe(true)
    expect(fen4(r.game.startFen)).toBe(fen4(QUEEN_ODDS_FEN))
    expect(r.game.moves).toHaveLength(plyCountOf('www.chess.com-daily-1000337106'))
    // plies are 1-based: ply 14 is black O-O-O (e8a8 on the wire), ply 15 white O-O-O (e1c1)
    expect(r.game.moves[13]).toMatchObject({ ply: 14, san: 'O-O-O', color: 'b' })
    expect(r.game.moves[14]).toMatchObject({ ply: 15, san: 'O-O-O', color: 'w' })
  })

  it('daily 1000337106 through the public API (danielrensch 2026/08): the same custom start', async () => {
    const net = installNetwork({
      emptyMonthsExcept: MONTHS_2026.slice(4).map(
        (m) => `api.chess.com-month-danielrensch-${m.replace('/', '-')}`,
      ),
    })
    const r = expectOk(await importGame(cc('daily', '1000337106'), pagesOpts('danielrensch')))
    expect(r.via).toBe('public-api')
    expect(r.notice).toBe('custom_start')
    expect(r.game.customStart).toBe(true)
    expect(fen4(r.game.startFen)).toBe(fen4(QUEEN_ODDS_FEN))
    expect(r.game.moves).toHaveLength(plyCountOf('www.chess.com-daily-1000337106'))
    expect(net.maxInFlight).toBe(1)
    expect(monthCalls(net).length).toBeLessThanOrEqual(6) // the newest 6 months at most
    expect(monthCalls(net)[0]).toBe(monthUrl('danielrensch', '2026/10')) // newest first
  })

  it('lichess 4S1PZUvW (fromPosition, initialFen, black aiLevel 8): analysed from the FEN, bot flagged', async () => {
    installNetwork()
    const r = expectOk(await importGame(lichess('4S1PZUvW'), VERCEL))
    expect(r.via).toBe('lichess')
    expect(r.notice).toBe('custom_start')
    expect(r.game.customStart).toBe(true)
    expect(fen4(r.game.startFen)).toBe('8/8/8/8/3k4/8/R7/R3K3 w Q -')
    expect(r.game.moves).toHaveLength(13)
    expect(r.game.black.isComputer).toBe(true)
    expect(r.game.white.isComputer).toBeFalsy()
  })

  it('R5: [SetUp "1"] with the standard FEN is not a custom start (never inferred from SetUp)', async () => {
    installNetwork()
    const r = expectOk(await importGame(pgnInput('pgn/setup-standard-fen.pgn'), VERCEL))
    expect(r.notice).toBeUndefined()
    expect(r.game.customStart).toBe(false)
    expect(r.game.moves).toHaveLength(8)
  })

  it('R5: [SetUp "1"] with a custom [FEN] is a custom start and replays from that FEN', async () => {
    installNetwork()
    const r = expectOk(await importGame(pgnInput('pgn/custom-fen.pgn'), VERCEL))
    expect(r.notice).toBe('custom_start')
    expect(r.game.customStart).toBe(true)
    expect(fen4(r.game.startFen)).toBe(fen4(QUEEN_ODDS_FEN))
    expect(fen4(r.game.moves[0].before)).toBe(fen4(QUEEN_ODDS_FEN))
  })

  it('the zero-move check precedes the custom-start banner', async () => {
    installNetwork({
      overrides: {
        'www.chess.com-live-999000000001': handmadeWith(VALID, {
          moveList: '',
          plyCount: 0,
          initialSetup: QUEEN_ODDS_FEN,
        }),
      },
    })
    expectError(await importGame(cc('live', '999000000001'), VERCEL), 'zero_moves', MSG.I11)
  })

  it('custom start and in-progress both apply to an unfinished custom-start daily game', async () => {
    installNetwork({
      overrides: {
        'www.chess.com-daily-999000000007': handmadeWith(VALID, {
          isFinished: false,
          initialSetup: QUEEN_ODDS_FEN,
        }),
      },
    })
    const r = expectOk(await importGame(cc('daily', '999000000007'), VERCEL))
    expect(r.notice).toBe('custom_start')
    expect(r.pendingConfirmation).toBe('in_progress_daily')
    expect(r.game.moves).toHaveLength(5)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Risk 10: in-progress games (PROMPT.md 3.9, section 3.3 ongoing rules).
// ---------------------------------------------------------------------------------------------------------------
describe('risk 10: in-progress games', () => {
  it('daily 1034198172 (isFinished:false, 5 plies): pendingConfirmation in_progress_daily; accepting sets inProgress', async () => {
    installNetwork()
    const r = expectOk(await importGame(cc('daily', '1034198172'), VERCEL))
    expect(r.pendingConfirmation).toBe('in_progress_daily')
    expect(r.game.moves).toHaveLength(5)
    expect(r.game.inProgress).toBe(false)
    const accepted = confirmInProgress(r.game)
    expect(accepted.inProgress).toBe(true)
    expect(accepted.moves).toEqual(r.game.moves)
    expect(accepted.id).toBe('cc:daily:1034198172')
  })

  it('live 1034198172 (kind matters): the finished 78-ply game needs no confirmation', async () => {
    installNetwork()
    const r = expectOk(await importGame(cc('live', '1034198172'), VERCEL))
    expect(r.pendingConfirmation).toBeUndefined()
    expect(r.game.moves).toHaveLength(78)
    expect(r.game.id).toBe('cc:live:1034198172')
  })

  it('live 404 (a live game still being played is indistinguishable from a missing one): I-2', async () => {
    installNetwork()
    expectError(await importGame(cc('live', '1859764312'), VERCEL), 'live_not_found', MSG.I2)
  })

  it('lichess f3mYca1i (status started, source pool): pendingConfirmation in_progress_lichess', async () => {
    installNetwork()
    const r = expectOk(await importGame(lichess('f3mYca1i'), VERCEL))
    expect(r.pendingConfirmation).toBe('in_progress_lichess')
    expect(r.game.inProgress).toBe(false)
  })

  it('lichess f3mYca1i once finished (status mate, same source): no confirmation', async () => {
    installNetwork({
      overrides: { 'lichess.org-game-f3mYca1i': recorded('lichess.org-game-f3mYca1i-finished') },
    })
    const r = expectOk(await importGame(lichess('f3mYca1i'), VERCEL))
    expect(r.pendingConfirmation).toBeUndefined()
  })

  it.each([
    ['created', 'lobby', true],
    ['started', 'lobby', true],
    ['started', 'import', false],
    ['started', 'importlive', false],
    ['mate', 'pool', false],
    ['resign', 'arena', false],
  ] as const)(
    'lichess ongoing rule: status %s, source %s gives confirmation %s',
    async (status, source, pending) => {
      installNetwork({
        overrides: {
          'lichess.org-game-TJxUmbWK': recordedWith('lichess.org-game-TJxUmbWK', { status, source }),
        },
      })
      const r = expectOk(await importGame(lichess('TJxUmbWK'), VERCEL))
      expect(r.pendingConfirmation).toBe(pending ? 'in_progress_lichess' : undefined)
    },
  )

  it('lichess 4pSpQGR7 (source import, status started, 39 plies): finished, result unknown, no confirmation', async () => {
    installNetwork()
    const r = expectOk(await importGame(lichess('4pSpQGR7'), VERCEL))
    expect(r.pendingConfirmation).toBeUndefined()
    expect(r.game.result).toBe('*')
    expect(r.game.moves).toHaveLength(39)
    expect(r.game.inProgress).toBe(false)
  })

  it('PGN with [Result "*"]: pendingConfirmation pgn_unfinished', async () => {
    installNetwork()
    const r = expectOk(await importGame(pgnInput('pgn/unfinished.pgn'), VERCEL))
    expect(r.pendingConfirmation).toBe('pgn_unfinished')
    expect(r.game.result).toBe('*')
    expect(r.game.inProgress).toBe(false)
  })

  it('a finished PGN needs no confirmation', async () => {
    installNetwork()
    const r = expectOk(await importGame(pgnInput('pgn/standard-finished.pgn'), VERCEL))
    expect(r.pendingConfirmation).toBeUndefined()
  })
})
