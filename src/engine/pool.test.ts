// Engine pool with a mock Worker (R16, R17, C.1 items 2 to 9, section 3.4). Stockfish never runs in vitest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineProfile, PositionEval, SearchLimits } from '../types/engine'
import { calibrate, createEnginePool, evalKey, type EngineStatus } from './index'

type Reply = string[] | 'silent' | 'manual'

/** Stand-in for a classic Stockfish worker: one output line per message, strict-protocol violations recorded. */
class MockWorker {
  static all: MockWorker[] = []
  static boot: (url: string) => 'ok' | 'error' | 'silent' = () => 'ok'
  static script: (w: MockWorker, go: string) => Reply = (w, go) => defaultLines(w, go)
  static replyToStop = true
  static holdReadyok = false // the test answers `isready` itself (a worker inside newGame)
  readonly url: string
  readonly options: unknown
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null
  readonly sent: string[] = []
  readonly violations: string[] = []
  searching = false
  silent = false // a hung search (issue #124): not even `stop` gets an answer
  terminated = false
  multiPv = 1
  position = ''

  constructor(url: string | URL, options?: unknown) {
    this.url = String(url)
    this.options = options
    MockWorker.all.push(this)
  }

  postMessage(msg: unknown): void {
    if (this.terminated) return
    if (typeof msg !== 'string') {
      const port = (msg as { progressPort?: MessagePort }).progressPort
      if (port) {
        port.postMessage({ percent: 0.5, loaded: 5, total: 10 })
        port.postMessage({ percent: 1, loaded: 10, total: 10 })
      }
      return
    }
    this.sent.push(msg)
    if (msg === 'uci') {
      const b = MockWorker.boot(this.url)
      if (b === 'ok') this.emit(['Stockfish 19 Lite WASM by the Stockfish developers', 'uciok'])
      if (b === 'error')
        queueMicrotask(() => this.onerror?.({ message: 'RuntimeError: unreachable', preventDefault() {} }))
    } else if (msg === 'isready') {
      if (!MockWorker.holdReadyok) this.emit(['readyok'])
    } else if (/^(ucinewgame|setoption name (Hash|Threads) )/.test(msg)) {
      if (this.searching) this.violations.push(`${msg} during search`)
    } else if (msg.startsWith('setoption name MultiPV value ')) {
      if (this.searching) this.violations.push(`${msg} during search`)
      this.multiPv = Number(msg.split(' ').pop())
    } else if (msg.startsWith('position ')) {
      if (this.searching) this.violations.push(`${msg} during search`)
      this.position = msg
    } else if (msg.startsWith('go ')) {
      if (this.searching) this.violations.push(`${msg} during search`)
      this.searching = true
      const r = MockWorker.script(this, msg)
      this.silent = r === 'silent'
      if (Array.isArray(r)) this.emit(r)
    } else if (msg === 'stop') {
      if (this.searching && !this.silent && MockWorker.replyToStop) this.emit(['bestmove e2e4'])
    }
  }

  emit(lines: string[]): void {
    queueMicrotask(() => {
      for (const l of lines) {
        if (this.terminated) return
        if (l.startsWith('bestmove')) this.searching = false
        this.onmessage?.({ data: l })
      }
    })
  }

  terminate(): void {
    this.terminated = true
  }

  newGames(): number {
    return this.sent.filter((m) => m === 'ucinewgame').length
  }
  gos(): string[] {
    return this.sent.filter((m) => m.startsWith('go '))
  }
  positions(): string[] {
    return this.sent.filter((m) => m.startsWith('position '))
  }
}

function defaultLines(w: MockWorker, go: string): string[] {
  const depth = Number(go.split(' ')[2])
  const lines = [
    `info depth 1 seldepth 1 multipv 1 score cp 15 nodes 20 nps 400000 time 1 pv e2e4`,
    `info depth ${depth} seldepth ${depth + 4} multipv 1 score cp 30 nodes 9000 nps 450000 time 20 pv e2e4 e7e5`,
  ]
  if (w.multiPv >= 2)
    lines.push(
      `info depth ${depth} seldepth ${depth + 2} multipv 2 score cp 10 nodes 9000 nps 450000 time 20 pv d2d4`,
    )
  lines.push('bestmove e2e4 ponder e7e5')
  return lines
}

const FENS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
  'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
  'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
  'r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 4',
]
// stockfish.js issue #124 (section 3.4): lite builds can spin forever on `go depth 16` here
const ISSUE_124 = '3r3k/pbq1rpp1/1p2pNnp/2p1P2Q/2BP2R1/2P4R/P4PPP/6K1 b - - 3 24'
const MATED = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
const STALEMATE = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'

const STD: SearchLimits = { depth: 16, movetimeMs: 1500, multiPv: 2 }
const DESKTOP: EngineProfile = {
  build: 'lite-single',
  workers: 2,
  threads: 1,
  hashMb: 64,
  multiPv: 2,
  limits: STD,
  tier: 'standard-16',
}
const ONE = { ...DESKTOP, workers: 1 }
const PHONE: EngineProfile = {
  build: 'lite-single',
  workers: 1,
  threads: 1,
  hashMb: 16,
  multiPv: 1,
  limits: { depth: 16, movetimeMs: 1500, multiPv: 1 },
  tier: 'auto-16',
}
const PTHREADS: EngineProfile = { ...DESKTOP, build: 'lite', workers: 1, threads: 7, hashMb: 128 }

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve()
}
const settle = <T>(p: Promise<T>) => {
  const s: { value?: T; error?: Error; done: boolean } = { done: false }
  p.then(
    (v) => Object.assign(s, { value: v, done: true }),
    (e: Error) => Object.assign(s, { error: e, done: true }),
  )
  return s
}

beforeEach(() => {
  MockWorker.all = []
  MockWorker.boot = () => 'ok'
  MockWorker.script = (w, go) => defaultLines(w, go)
  MockWorker.replyToStop = true
  MockWorker.holdReadyok = false
  vi.stubGlobal('Worker', MockWorker)
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('pool boot (lazy, C.1 items 1 to 5 and 9)', () => {
  it('creates no worker and sends nothing before init, then boots profile.workers classic workers', async () => {
    const pool = createEnginePool(DESKTOP)
    const early = pool.evaluate(FENS[0], STD, 1)
    await flush()
    expect(MockWorker.all).toHaveLength(0)
    expect(pool.stats).toEqual({ workersCreated: 0, uciSent: 0 })
    await pool.init(DESKTOP)
    expect(MockWorker.all.map((w) => w.url)).toEqual([
      '/engine/sf19/stockfish-19-lite-single.js',
      '/engine/sf19/stockfish-19-lite-single.js',
    ])
    expect(MockWorker.all.every((w) => w.options === undefined)).toBe(true) // no {type: 'module'}
    expect((await early).lines[0].score).toEqual({ type: 'cp', value: 30 })
    pool.dispose()
  })

  it('lite-single: uci, then Hash, MultiPV, ucinewgame, isready (no Threads); stats count every command', async () => {
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const w = MockWorker.all[0]
    expect(w.sent).toEqual([
      'uci',
      'setoption name Hash value 64',
      'setoption name MultiPV value 2',
      'ucinewgame',
      'isready',
    ])
    expect(pool.stats).toEqual({ workersCreated: 1, uciSent: 5 })
    pool.dispose()
  })

  it('reports loading progress from the progress port and the ready build', async () => {
    const statuses: EngineStatus[] = []
    const pool = createEnginePool(ONE, { onStatus: (s) => statuses.push(s) })
    await pool.init(ONE)
    expect(MockWorker.all[0].sent.slice(0, 2)).toEqual([
      'uci',
      'setoption name CanOutputEngineDownloadProgress',
    ])
    await vi.waitFor(() => expect(statuses).toContainEqual({ phase: 'loading', percent: 1 }))
    expect(statuses[0]).toEqual({ phase: 'loading', percent: null })
    expect(statuses).toContainEqual({ phase: 'loading', percent: 0.5 })
    expect(statuses).toContainEqual({ phase: 'ready', build: 'lite-single', threads: 1 })
    pool.dispose()
  })

  it('pthreads build: lite.js and Threads before Hash', async () => {
    const statuses: EngineStatus[] = []
    const pool = createEnginePool(PTHREADS, { onStatus: (s) => statuses.push(s) })
    await pool.init(PTHREADS)
    const w = MockWorker.all[0]
    expect(w.url).toBe('/engine/sf19/stockfish-19-lite.js')
    const opts = w.sent.filter((m) => m.startsWith('setoption name') && !m.includes('Download'))
    expect(opts).toEqual([
      'setoption name Threads value 7',
      'setoption name Hash value 128',
      'setoption name MultiPV value 2',
    ])
    expect(statuses.at(-1)).toEqual({ phase: 'ready', build: 'lite', threads: 7 })
    pool.dispose()
  })

  it('a multi boot failure falls back to single once and remembers it in localStorage', async () => {
    MockWorker.boot = (url) => (url.endsWith('stockfish-19-lite.js') ? 'error' : 'ok')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const statuses: EngineStatus[] = []
    const pool = createEnginePool(PTHREADS, { onStatus: (s) => statuses.push(s) })
    await pool.init(PTHREADS)
    expect(MockWorker.all.map((w) => w.url.split('/').pop())).toEqual([
      'stockfish-19-lite.js',
      'stockfish-19-lite-single.js',
    ])
    expect(localStorage.getItem('analyse:engineVariant')).toBe('single')
    expect(MockWorker.all[1].sent.some((m) => m.includes('Threads'))).toBe(false)
    expect(statuses.at(-1)).toEqual({ phase: 'ready', build: 'lite-single', threads: 1 })
    pool.dispose()

    MockWorker.all = []
    const again = createEnginePool(PTHREADS)
    await again.init(PTHREADS)
    expect(MockWorker.all.map((w) => w.url.split('/').pop())).toEqual(['stockfish-19-lite-single.js'])
    again.dispose()
    warn.mockRestore()
  })

  it('a second init (new game or final profile) keeps the workers and re-sends the per-game options once', async () => {
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const w = MockWorker.all[0]
    await pool.init({ ...ONE, limits: { depth: 18, movetimeMs: 600, multiPv: 2 }, tier: 'auto-18' })
    await pool.evaluate(FENS[0], STD, 1)
    await pool.evaluate(FENS[1], STD, 1)
    expect(MockWorker.all).toHaveLength(1)
    expect(w.sent.slice(5).filter((m) => !m.startsWith('info'))).toEqual([
      'setoption name Hash value 64',
      'setoption name MultiPV value 2',
      'ucinewgame',
      'isready',
      `position fen ${FENS[0]}`,
      'go depth 16 movetime 1500',
      `position fen ${FENS[1]}`,
      'go depth 16 movetime 1500',
    ])
    pool.dispose()
  })

  it('no uciok within 15 s: init rejects and the E-2 status carries the message', async () => {
    vi.useFakeTimers()
    MockWorker.boot = () => 'silent'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const statuses: EngineStatus[] = []
    const pool = createEnginePool(ONE, { onStatus: (s) => statuses.push(s) })
    const init = settle(pool.init(ONE))
    await vi.advanceTimersByTimeAsync(14_999)
    expect(init.done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(init.error?.message).toBe('single: no uciok within 15000ms')
    expect(MockWorker.all[0].terminated).toBe(true)
    expect(statuses.at(-1)).toEqual({
      phase: 'error',
      key: 'E-2',
      message: 'single: no uciok within 15000ms',
    })
    warn.mockRestore()
  })
})

describe('strict UCI serialisation (R17)', () => {
  it('two workers, eight positions: one go per worker at a time, position/go only after bestmove', async () => {
    const pool = createEnginePool(DESKTOP)
    await pool.init(DESKTOP)
    const results = await Promise.all(FENS.map((f) => pool.evaluate(f, STD, 1)))
    for (const w of MockWorker.all) {
      expect(w.violations).toEqual([])
      expect(w.gos().length).toBeGreaterThan(0) // dealt round-robin to both workers
      expect(new Set(w.gos())).toEqual(new Set(['go depth 16 movetime 1500']))
      // every go is directly preceded by its position
      w.sent.forEach((m, i) => {
        if (m.startsWith('go ')) expect(w.sent[i - 1]).toMatch(/^position fen /)
      })
    }
    expect(MockWorker.all.reduce((n, w) => n + w.gos().length, 0)).toBe(8)
    results.forEach((r, i) => {
      const stm = FENS[i].split(' ')[1]
      // White perspective, exactly once: cp 30 for the side to move
      expect(r.lines.map((l) => l.score.value)).toEqual(stm === 'w' ? [30, 10] : [-30, -10])
      expect(r).toMatchObject({ fen: FENS[i], depth: 16, multiPv: 2, bestmove: 'e2e4' })
      expect(r.lines[0]).toEqual({ multipv: 1, depth: 16, score: r.lines[0].score, pv: ['e2e4', 'e7e5'] })
    })
    expect(pool.progress?.()).toMatchObject({ completed: 8, queued: 0, inFlight: 0 })
    pool.dispose()
  })

  it('one worker: the next position is sent only after the previous bestmove', async () => {
    MockWorker.script = () => 'manual'
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const w = MockWorker.all[0]
    const a = settle(pool.evaluate(FENS[0], STD, 1))
    const b = settle(pool.evaluate(FENS[1], STD, 1))
    await flush()
    expect(w.positions()).toEqual([`position fen ${FENS[0]}`])
    w.emit(['info depth 16 multipv 1 score cp 20 nodes 1 nps 1 time 1 pv e2e4'])
    await flush()
    expect(w.positions()).toHaveLength(1)
    w.emit(['bestmove e2e4'])
    await flush()
    expect(a.value?.lines[0].score).toEqual({ type: 'cp', value: 20 })
    expect(w.positions()).toEqual([`position fen ${FENS[0]}`, `position fen ${FENS[1]}`])
    expect(b.done).toBe(false)
    w.emit(['info depth 16 multipv 1 score mate -3 nodes 1 nps 1 time 1 pv e8f8 h6f7', 'bestmove e8f8'])
    await flush()
    expect(b.value?.lines[0].score).toEqual({ type: 'mate', value: 3 }) // Black to move: mate -3 is White mating
    expect(w.violations).toEqual([])
    pool.dispose()
  })

  it('ignores bound lines and keeps the deepest complete line per multipv; bestmove ignores ponder', async () => {
    MockWorker.script = () => [
      'info string NNUE evaluation using nn-61e7af4bb97d.nnue',
      'info depth 10 seldepth 12 multipv 1 score cp 40 nodes 1 nps 1 time 1 pv d2d4',
      'info depth 11 seldepth 12 multipv 1 score cp 900 lowerbound nodes 1 nps 1 time 1 pv g1f3',
      'info depth 11 seldepth 13 multipv 1 score cp -985 upperbound nodes 1 nps 1 time 1 pv c2c4',
      'info depth 11 seldepth 14 multipv 1 score cp 35 wdl 53 941 6 nodes 1 nps 1 time 1 pv e2e4 e7e5',
      'info depth 11 seldepth 14 multipv 2 score cp 12 nodes 1 nps 1 time 1 pv d2d4 d7d5',
      'bestmove e2e4 ponder e7e5',
    ]
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const r = await pool.evaluate(FENS[0], STD, 1)
    expect(r).toEqual({
      fen: FENS[0],
      lines: [
        { multipv: 1, depth: 11, score: { type: 'cp', value: 35 }, pv: ['e2e4', 'e7e5'] },
        { multipv: 2, depth: 11, score: { type: 'cp', value: 12 }, pv: ['d2d4', 'd7d5'] },
      ],
      depth: 11,
      multiPv: 2,
      bestmove: 'e2e4',
    })
    pool.dispose()
  })
})

describe('depth-0 terminal lines (C.1 item 7)', () => {
  it.each([
    [MATED, 'info depth 0 score mate 0', 'checkmate'],
    [STALEMATE, 'info depth 0 score cp 0', 'stalemate'],
  ])('%s gives terminal %s with no lines and a null bestmove', async (fen, info, terminal) => {
    MockWorker.script = () => [info, 'bestmove (none)']
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    expect(await pool.evaluate(fen, STD, 1)).toEqual({
      fen,
      lines: [],
      depth: 0,
      multiPv: 2,
      bestmove: null,
      terminal,
    })
    pool.dispose()
  })
})

describe('cancel (stop, wait for bestmove, drop stale job ids)', () => {
  it('stop rejects queued and running requests, waits for bestmove, and the next job starts after it', async () => {
    MockWorker.script = () => 'manual'
    MockWorker.replyToStop = false
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const w = MockWorker.all[0]
    const a = settle(pool.evaluate(FENS[0], STD, 1))
    const b = settle(pool.evaluate(FENS[1], STD, 1))
    await flush()
    w.emit(['info depth 5 multipv 1 score cp 11 nodes 1 nps 1 time 1 pv e2e4'])
    const stopped = settle(pool.stop())
    await flush()
    expect(w.sent.at(-1)).toBe('stop')
    expect(a.error?.name).toBe('AbortError')
    expect(b.error?.name).toBe('AbortError')
    expect(stopped.done).toBe(false) // still waiting for the stopped search's bestmove
    const c = settle(pool.evaluate(FENS[2], STD, 2))
    await flush()
    expect(w.positions()).toEqual([`position fen ${FENS[0]}`]) // nothing sent before bestmove
    w.emit(['info depth 6 multipv 1 score cp 12 nodes 1 nps 1 time 1 pv e2e4', 'bestmove e2e4'])
    await flush()
    expect(stopped.done).toBe(true)
    expect(a.value).toBeUndefined() // the stale result is dropped, never delivered
    expect(w.positions()).toEqual([`position fen ${FENS[0]}`, `position fen ${FENS[2]}`])
    w.emit(['info depth 16 multipv 1 score cp 50 nodes 1 nps 1 time 1 pv g1f3', 'bestmove g1f3'])
    await flush()
    expect(c.value?.lines[0].score.value).toBe(50)
    expect(w.violations).toEqual([])
    // the stopped position was not cached: asking again searches again
    const again = settle(pool.evaluate(FENS[0], STD, 2))
    await flush()
    expect(w.positions().at(-1)).toBe(`position fen ${FENS[0]}`)
    w.emit(['info depth 16 multipv 1 score cp 1 nodes 1 nps 1 time 1 pv e2e4', 'bestmove e2e4'])
    await flush()
    expect(again.value?.depth).toBe(16)
    pool.dispose()
  })

  it('a newer job id supersedes older requests and an older job id is rejected as stale', async () => {
    MockWorker.script = () => 'manual'
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const w = MockWorker.all[0]
    const old = settle(pool.evaluate(FENS[0], STD, 4))
    const oldQueued = settle(pool.evaluate(FENS[1], STD, 4))
    await flush()
    const fresh = settle(pool.evaluate(FENS[2], STD, 5))
    await flush()
    expect(old.error?.name).toBe('AbortError')
    expect(oldQueued.error?.name).toBe('AbortError')
    expect(w.sent).toContain('stop')
    expect(w.positions()).toEqual([`position fen ${FENS[0]}`, `position fen ${FENS[2]}`])
    const stale = settle(pool.evaluate(FENS[3], STD, 4))
    await flush()
    expect(stale.error?.message).toBe('engine: stale job 4')
    w.emit(['info depth 16 multipv 1 score cp 5 nodes 1 nps 1 time 1 pv e2e4', 'bestmove e2e4'])
    await flush()
    expect(fresh.value?.lines[0].score.value).toBe(5)
    expect(w.violations).toEqual([])
    pool.dispose()
  })

  it('dispose terminates every worker and rejects what is pending', async () => {
    MockWorker.script = () => 'manual'
    const pool = createEnginePool(DESKTOP)
    await pool.init(DESKTOP)
    const p = settle(pool.evaluate(FENS[0], STD, 1))
    pool.dispose()
    await flush()
    expect(p.error).toBeDefined()
    expect(MockWorker.all.every((w) => w.terminated)).toBe(true)
    await expect(pool.evaluate(FENS[1], STD, 2)).rejects.toThrow('engine pool disposed')
  })
})

describe('watchdog (R16: 10 s of silence -> terminate, respawn, retry once at depth 12, then notAnalysed)', () => {
  it('issue #124 FEN with a silent worker is marked not analysed after two timeouts; the pass continues', async () => {
    vi.useFakeTimers()
    MockWorker.script = (w, go) => (w.position.includes(ISSUE_124) ? 'silent' : defaultLines(w, go))
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const stuck = settle(pool.evaluate(ISSUE_124, STD, 1))
    const next = settle(pool.evaluate(FENS[0], STD, 1))
    await vi.advanceTimersByTimeAsync(0)
    const [w0] = MockWorker.all
    expect(w0.gos()).toEqual(['go depth 16 movetime 1500'])
    await vi.advanceTimersByTimeAsync(3_500)
    expect(w0.sent.at(-1)).toBe('stop') // the movetime + 2 s safety stop
    await vi.advanceTimersByTimeAsync(6_499)
    expect(w0.terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(w0.terminated).toBe(true)
    expect(MockWorker.all).toHaveLength(2)
    const w1 = MockWorker.all[1]
    expect(w1.positions()).toEqual([`position fen ${ISSUE_124}`])
    expect(w1.gos()).toEqual(['go depth 12 movetime 1500'])
    expect(stuck.done).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(w1.terminated).toBe(true)
    expect(stuck.value).toEqual({
      fen: ISSUE_124,
      lines: [],
      depth: 0,
      multiPv: 2,
      bestmove: null,
      notAnalysed: true,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(MockWorker.all).toHaveLength(3)
    expect(next.value?.depth).toBe(16) // the pass continues on the respawned worker
    expect(pool.stats.workersCreated).toBe(3)
    for (const w of MockWorker.all) expect(w.violations).toEqual([])
    pool.dispose()
  })

  it('a retry at depth 12 that answers is delivered (and cached under its own depth)', async () => {
    vi.useFakeTimers()
    MockWorker.script = (w, go) =>
      w.position.includes(ISSUE_124) && go.includes('depth 16') ? 'silent' : defaultLines(w, go)
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const r = settle(pool.evaluate(ISSUE_124, STD, 1))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(r.value).toMatchObject({ depth: 12, bestmove: 'e2e4' })
    expect(r.value?.notAnalysed).toBeUndefined()
    expect(r.value?.lines[0].score).toEqual({ type: 'cp', value: -30 })
    const gos = MockWorker.all.reduce((n, w) => n + w.gos().length, 0)
    expect(await pool.evaluate(ISSUE_124, { ...STD, depth: 12 }, 1)).toEqual(r.value)
    expect(MockWorker.all.reduce((n, w) => n + w.gos().length, 0)).toBe(gos)
    pool.dispose()
  })

  it('every info line resets the watchdog (a deep search that keeps talking is not killed)', async () => {
    vi.useFakeTimers()
    MockWorker.script = () => 'manual'
    const deep: SearchLimits = { depth: 20, movetimeMs: 6000, multiPv: 2 }
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const w = MockWorker.all[0]
    const r = settle(pool.evaluate(FENS[0], deep, 1))
    await vi.advanceTimersByTimeAsync(6_000)
    w.emit(['info depth 19 multipv 1 score cp 22 nodes 1 nps 1 time 1 pv e2e4'])
    await vi.advanceTimersByTimeAsync(6_000)
    expect(w.terminated).toBe(false)
    w.emit(['bestmove e2e4'])
    await vi.advanceTimersByTimeAsync(0)
    expect(r.value).toMatchObject({ depth: 19, bestmove: 'e2e4' })
    expect(MockWorker.all).toHaveLength(1)
    pool.dispose()
  })

  it('a worker error mid-search respawns and retries at depth 12', async () => {
    MockWorker.script = (w, go) => (go.includes('depth 16') ? 'manual' : defaultLines(w, go))
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const r = settle(pool.evaluate(FENS[0], STD, 1))
    await flush()
    MockWorker.all[0].onerror?.({ message: 'RuntimeError: memory access out of bounds', preventDefault() {} })
    await vi.waitFor(() => expect(r.done).toBe(true))
    expect(MockWorker.all).toHaveLength(2)
    expect(MockWorker.all[1].gos()).toEqual(['go depth 12 movetime 1500'])
    expect(r.value?.depth).toBe(12)
    pool.dispose()
  })
})

describe('cache keyed by evalKey (fen4|depth|multipv)', () => {
  it('evalKey uses the first four FEN fields', () => {
    expect(evalKey(FENS[1], STD)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -|16|2')
  })

  it('a cache hit skips dispatch, also for a duplicate already waiting in the queue', async () => {
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const w = MockWorker.all[0]
    const first = await pool.evaluate(FENS[0], STD, 1)
    const sameFen4 = FENS[0].replace(/ 0 1$/, ' 7 30')
    const second = await pool.evaluate(sameFen4, STD, 1)
    expect(w.gos()).toHaveLength(1)
    expect(second).toEqual({ ...first, fen: sameFen4 })
    const [x, y] = await Promise.all([pool.evaluate(FENS[3], STD, 1), pool.evaluate(FENS[3], STD, 1)])
    expect(w.gos()).toHaveLength(2)
    expect(y).toEqual(x)
    // another depth or multipv is another key
    await pool.evaluate(FENS[0], { ...STD, depth: 18 }, 1)
    expect(w.gos()).toHaveLength(3)
    expect(pool.progress?.()).toMatchObject({ completed: 3, cacheHits: 2 })
    pool.dispose()
  })
})

describe('priority lane: MultiPV 2 requests run ahead of the main-pass FIFO (section 3.4, R15)', () => {
  it('phone profile: a re-search queued after B and C runs before them, with MultiPV switched between searches', async () => {
    MockWorker.script = () => 'manual'
    const pool = createEnginePool(PHONE)
    await pool.init(PHONE)
    const w = MockWorker.all[0]
    expect(w.sent).toContain('setoption name MultiPV value 1')
    const mpv1 = PHONE.limits
    const a = settle(pool.evaluate(FENS[0], mpv1, 1))
    const b = settle(pool.evaluate(FENS[1], mpv1, 1))
    const c = settle(pool.evaluate(FENS[2], mpv1, 1))
    const re = settle(pool.evaluate(FENS[4], { ...mpv1, multiPv: 2 }, 1))
    await flush()
    const done = (lines: string[]) => {
      w.emit([...lines, 'bestmove e2e4'])
      return flush()
    }
    await done(['info depth 16 multipv 1 score cp 1 nodes 1 nps 1 time 1 pv e2e4'])
    expect(a.value?.multiPv).toBe(1)
    expect(w.sent.slice(-3)).toEqual([
      'setoption name MultiPV value 2',
      `position fen ${FENS[4]}`,
      'go depth 16 movetime 1500',
    ])
    await done([
      'info depth 16 multipv 1 score cp 1 nodes 1 nps 1 time 1 pv e2e4',
      'info depth 16 multipv 2 score cp -40 nodes 1 nps 1 time 1 pv a2a3',
    ])
    expect(re.value?.multiPv).toBe(2)
    expect(re.value?.lines.map((l) => l.score.value)).toEqual([1, -40])
    expect(w.sent.slice(-3)).toEqual([
      'setoption name MultiPV value 1',
      `position fen ${FENS[1]}`,
      'go depth 16 movetime 1500',
    ])
    await done(['info depth 16 multipv 1 score cp 1 nodes 1 nps 1 time 1 pv e2e4'])
    expect(w.positions().at(-1)).toBe(`position fen ${FENS[2]}`)
    await done(['info depth 16 multipv 1 score cp 1 nodes 1 nps 1 time 1 pv e2e4'])
    expect(b.done && c.done).toBe(true)
    expect(w.violations).toEqual([])
    expect(evalKey(FENS[4], { ...mpv1, multiPv: 2 })).toMatch(/\|16\|2$/)
    pool.dispose()
  })
})

describe('progress, ETA and calibration', () => {
  it('ETA = remaining x mean per-position time / workers', async () => {
    vi.useFakeTimers()
    MockWorker.script = () => 'manual'
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const w = MockWorker.all[0]
    expect(pool.etaMs?.(10)).toBeNull()
    const r = settle(pool.evaluate(FENS[0], STD, 1))
    await vi.advanceTimersByTimeAsync(400)
    w.emit(['info depth 16 multipv 1 score cp 1 nodes 1 nps 1 time 1 pv e2e4', 'bestmove e2e4'])
    await vi.advanceTimersByTimeAsync(0)
    expect(r.done).toBe(true)
    expect(pool.progress?.().meanMs).toBe(400)
    expect(pool.etaMs?.(10)).toBe(4000)
    pool.dispose()
  })

  it('measureNps sends position startpos + plain go depth 12 and returns the last nps; calibrate stores the tier', async () => {
    MockWorker.script = () => [
      'info depth 11 seldepth 14 multipv 1 score cp 30 nodes 1 nps 401000 time 1 pv e2e4',
      'info depth 12 seldepth 15 multipv 1 score cp 28 nodes 1 nps 455000 time 1 pv e2e4',
      'bestmove e2e4',
    ]
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    expect(await pool.measureNps()).toBe(455000)
    const w = MockWorker.all[0]
    expect(w.sent.slice(-2)).toEqual(['position startpos', 'go depth 12'])
    expect(await calibrate(pool, { force: true })).toBe('auto-16')
    expect(JSON.parse(localStorage.getItem('analyse:engineTier') ?? '{}')).toMatchObject({
      nps: 455000,
      tier: 'auto-16',
    })
    pool.dispose()
  })
})

describe('results are plain data', () => {
  it('a PositionEval never carries side-to-move fields', async () => {
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const r: PositionEval = await pool.evaluate(FENS[1], STD, 1)
    expect(Object.keys(r).sort()).toEqual(['bestmove', 'depth', 'fen', 'lines', 'multiPv'])
    expect(Object.keys(r.lines[0]).sort()).toEqual(['depth', 'multipv', 'pv', 'score'])
    pool.dispose()
  })
})

const WORKER_ERROR = 'single: worker error RuntimeError: unreachable'
const INFO_16 = 'info depth 16 multipv 1 score cp 3 nodes 1 nps 1 time 1 pv e2e4'

describe('no worker left (review performance H2): requests fail with E-2 at once, nothing hangs', () => {
  it('a failed respawn after the watchdog rejects the request in hand, the queue and every later request', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const statuses: EngineStatus[] = []
    const pool = createEnginePool(ONE, { onStatus: (s) => statuses.push(s) })
    await pool.init(ONE)
    MockWorker.boot = () => 'error'
    MockWorker.script = () => 'silent'
    const inHand = settle(pool.evaluate(FENS[0], STD, 10))
    const queued = settle(pool.evaluate(FENS[1], STD, 10))
    await vi.advanceTimersByTimeAsync(11_000)
    expect(MockWorker.all).toHaveLength(2) // one respawn attempt, which failed
    for (const r of [inHand, queued]) {
      expect(r.error?.message).toBe(WORKER_ERROR)
      expect(r.error?.name).not.toBe('AbortError')
    }
    expect(statuses.at(-1)).toEqual({ phase: 'error', key: 'E-2', message: WORKER_ERROR })
    MockWorker.boot = () => 'ok'
    MockWorker.script = (w, go) => defaultLines(w, go)
    const later = settle(pool.evaluate(FENS[2], STD, 11))
    const nps = settle(pool.measureNps())
    await vi.advanceTimersByTimeAsync(0)
    expect(later.error?.message).toBe(WORKER_ERROR)
    expect(later.error?.name).not.toBe('AbortError')
    expect(nps.error?.message).toBe(WORKER_ERROR)
    expect(MockWorker.all).toHaveLength(2) // no request creates a worker behind the caller's back
    // the E-2 Retry: a new init boots a fresh worker and the pool serves requests again
    await pool.init(ONE)
    expect(MockWorker.all).toHaveLength(3)
    expect(statuses.at(-1)).toEqual({ phase: 'ready', build: 'lite-single', threads: 1 })
    const again = settle(pool.evaluate(FENS[2], STD, 12))
    await vi.advanceTimersByTimeAsync(0)
    expect(again.value?.depth).toBe(16)
    pool.dispose()
    expect(MockWorker.all.every((w) => w.terminated)).toBe(true)
    await expect(pool.evaluate(FENS[3], STD, 13)).rejects.toThrow('engine pool disposed')
    warn.mockRestore()
  })

  it('a failed boot rejects a request queued before init and every later request with the boot error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    MockWorker.boot = () => 'error'
    const pool = createEnginePool(ONE)
    const early = settle(pool.evaluate(FENS[0], STD, 1))
    await expect(pool.init(ONE)).rejects.toThrow(WORKER_ERROR)
    const later = settle(pool.evaluate(FENS[1], STD, 2))
    await flush()
    for (const r of [early, later]) {
      expect(r.error?.message).toBe(WORKER_ERROR)
      expect(r.error?.name).not.toBe('AbortError')
    }
    pool.dispose()
    warn.mockRestore()
  })

  it('with two workers, one failed respawn keeps the pass going on the survivor (no E-2)', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    MockWorker.script = (w, go) =>
      w.position.includes(ISSUE_124) && go.includes('depth 16') ? 'silent' : defaultLines(w, go)
    const statuses: EngineStatus[] = []
    const pool = createEnginePool(DESKTOP, { onStatus: (s) => statuses.push(s) })
    await pool.init(DESKTOP)
    MockWorker.boot = () => 'error'
    const stuck = settle(pool.evaluate(ISSUE_124, STD, 1))
    const rest = FENS.slice(0, 4).map((f) => settle(pool.evaluate(f, STD, 1)))
    await vi.advanceTimersByTimeAsync(11_000)
    expect(rest.every((r) => r.value?.depth === 16)).toBe(true)
    expect(stuck.value).toMatchObject({ depth: 12, bestmove: 'e2e4' }) // retried on the survivor
    expect(statuses.some((s) => s.phase === 'error')).toBe(false)
    expect(pool.progress?.().workers).toBe(1)
    pool.dispose()
    warn.mockRestore()
  })
})

describe('per-game options once per game (review performance M2, R17, C.1 item 5)', () => {
  const GAME2: EngineProfile = {
    ...DESKTOP,
    hashMb: 32,
    limits: { depth: 18, movetimeMs: 600, multiPv: 2 },
    tier: 'auto-18',
  }

  it('a later init schedules Hash, MultiPV, ucinewgame, isready once on each worker before its next position, never mid-search', async () => {
    MockWorker.script = (w, go) => (w.position.includes(FENS[0]) ? 'manual' : defaultLines(w, go))
    const pool = createEnginePool(DESKTOP)
    await pool.init(DESKTOP)
    const a = settle(pool.evaluate(FENS[0], STD, 1))
    await flush()
    const busy = MockWorker.all.find((w) => w.searching)
    expect(busy).toBeDefined()
    await pool.init(GAME2) // the next game starts while the previous search still runs
    await pool.init(GAME2) // a repeated init before any search is still one new game
    expect(MockWorker.all).toHaveLength(2) // no reboot
    expect(MockWorker.all.map((w) => w.newGames())).toEqual([1, 1]) // nothing sent during the search
    busy?.emit([INFO_16, 'bestmove e2e4'])
    await flush()
    expect(a.value?.depth).toBe(16)
    await Promise.all(FENS.slice(1).map((f) => pool.evaluate(f, GAME2.limits, 2)))
    for (const w of MockWorker.all) {
      expect(w.violations).toEqual([])
      expect(w.newGames()).toBe(2)
      const i = w.sent.lastIndexOf('ucinewgame')
      expect(w.sent.slice(i - 2, i + 3)).toEqual([
        'setoption name Hash value 32',
        'setoption name MultiPV value 2',
        'ucinewgame',
        'isready',
        expect.stringMatching(/^position fen /),
      ])
      expect(w.sent.indexOf(`position fen ${FENS[0]}`)).toBeLessThan(i) // the old game's search came first
    }
    pool.dispose()
  })

  it('an init while the only worker is being respawned keeps that worker (no reboot, no leak, no cancel)', async () => {
    vi.useFakeTimers()
    MockWorker.script = (w, go) =>
      w.position.includes(ISSUE_124) && go.includes('depth 16') ? 'silent' : defaultLines(w, go)
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    const stuck = settle(pool.evaluate(ISSUE_124, STD, 1))
    MockWorker.boot = () => 'silent' // the replacement is slow to answer `uci`
    await vi.advanceTimersByTimeAsync(10_000)
    expect(MockWorker.all).toHaveLength(2)
    const w1 = MockWorker.all[1]
    const init = settle(pool.init({ ...GAME2, workers: 1 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(init.done).toBe(true)
    w1.emit(['uciok'])
    await vi.advanceTimersByTimeAsync(0)
    expect(MockWorker.all).toHaveLength(2)
    expect(w1.terminated).toBe(false)
    expect(stuck.value).toMatchObject({ depth: 12, bestmove: 'e2e4' })
    expect(w1.sent).toEqual([
      'uci',
      'setoption name Hash value 32',
      'setoption name MultiPV value 2',
      'ucinewgame',
      'isready',
      `position fen ${ISSUE_124}`,
      'go depth 12 movetime 1500',
    ])
    pool.dispose()
  })
})

describe('cancel while a worker is inside newGame (review correctness L4)', () => {
  it('stop() during the per-game isready: no search is started, stop returns on readyok', async () => {
    MockWorker.script = () => 'manual'
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    await pool.init(ONE) // new game: the sequence runs before the next position
    const w = MockWorker.all[0]
    MockWorker.holdReadyok = true
    const r = settle(pool.evaluate(FENS[0], STD, 1))
    await flush()
    expect(w.sent.slice(-2)).toEqual(['ucinewgame', 'isready'])
    const stopped = settle(pool.stop())
    await flush()
    expect(r.error?.name).toBe('AbortError')
    expect(stopped.done).toBe(false) // the isready in flight is awaited (strict serialisation)
    w.emit(['readyok'])
    await flush()
    expect(stopped.done).toBe(true)
    expect(w.positions()).toEqual([])
    expect(w.gos()).toEqual([])
    expect(w.sent).not.toContain('stop')
    MockWorker.holdReadyok = false
    const next = settle(pool.evaluate(FENS[1], STD, 2))
    await flush()
    expect(w.positions()).toEqual([`position fen ${FENS[1]}`])
    w.emit([INFO_16, 'bestmove e2e4'])
    await flush()
    expect(next.value?.depth).toBe(16)
    expect(MockWorker.all).toHaveLength(1)
    expect(w.violations).toEqual([])
    pool.dispose()
  })

  it('a newer job id during newGame: the superseded position is never searched, the new one is next', async () => {
    MockWorker.script = () => 'manual'
    const pool = createEnginePool(ONE)
    await pool.init(ONE)
    await pool.init(ONE)
    const w = MockWorker.all[0]
    MockWorker.holdReadyok = true
    const old = settle(pool.evaluate(FENS[0], STD, 1))
    await flush()
    const fresh = settle(pool.evaluate(FENS[1], STD, 2))
    await flush()
    expect(old.error?.name).toBe('AbortError')
    w.emit(['readyok'])
    await flush()
    expect(w.positions()).toEqual([`position fen ${FENS[1]}`])
    w.emit([INFO_16, 'bestmove e2e4'])
    await flush()
    expect(fresh.value?.depth).toBe(16)
    expect(w.violations).toEqual([])
    pool.dispose()
  })
})
