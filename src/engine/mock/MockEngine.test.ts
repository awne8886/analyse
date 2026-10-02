// MockEngine lookup rules (docs/notes/contracts.md section 1) and its selection by window.__USE_MOCK_ENGINE__.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EngineProfile, PositionEval, SearchLimits } from '../../types/engine'
import { calibrate, createEnginePool, evalKey } from '../index'
import { MockEngine } from './MockEngine'

const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
const FEN4 = FEN.split(' ').slice(0, 4).join(' ')
const OTHER = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const L16: SearchLimits = { depth: 16, movetimeMs: 1500, multiPv: 2 }

const line = (multipv: number, value: number, pv: string[]) => ({
  multipv,
  depth: 16,
  score: { type: 'cp' as const, value },
  pv,
})
const MPV2: PositionEval = {
  fen: FEN,
  lines: [line(1, 35, ['f1b5', 'a7a6']), line(2, 20, ['d2d4', 'e5d4'])],
  depth: 16,
  multiPv: 2,
  bestmove: 'f1b5',
}
const MPV1_D18: PositionEval = {
  ...MPV2,
  lines: [line(1, 41, ['f1c4'])],
  depth: 18,
  multiPv: 1,
  bestmove: 'f1c4',
}
const PROFILE: EngineProfile = {
  build: 'lite-single',
  workers: 1,
  threads: 1,
  hashMb: 16,
  multiPv: 1,
  limits: { depth: 16, movetimeMs: 1500, multiPv: 1 },
  tier: 'standard-16',
}

afterEach(() => {
  delete window.__USE_MOCK_ENGINE__
  delete window.__MOCK_EVALS__
  vi.unstubAllGlobals()
})

describe('MockEngine lookup', () => {
  it('answers an exact fen4|depth|multipv key with the requested fen', async () => {
    const m = new MockEngine({ [`${FEN4}|16|2`]: MPV2 })
    const other = FEN.replace(/ 2 3$/, ' 4 9')
    expect(await m.evaluate(other, L16, 1)).toEqual({ ...MPV2, fen: other })
  })

  it('falls back to another entry of the same fen4, preferring multipv 2, truncated to the request', async () => {
    const m = new MockEngine({ [`${FEN4}|18|1`]: MPV1_D18, [`${FEN4}|16|2`]: MPV2 })
    const r = await m.evaluate(FEN, { depth: 14, movetimeMs: 350, multiPv: 1 }, 1)
    expect(r).toEqual({ ...MPV2, lines: [MPV2.lines[0]], multiPv: 1 })
    const r2 = await m.evaluate(FEN, { depth: 20, movetimeMs: 6000, multiPv: 2 }, 1)
    expect(r2).toEqual(MPV2)
  })

  it('uses a multipv 1 entry when it is the only one for that fen4', async () => {
    const m = new MockEngine({ [`${FEN4}|18|1`]: MPV1_D18 })
    expect(await m.evaluate(FEN, L16, 1)).toEqual({ ...MPV1_D18, multiPv: 2 })
  })

  it('rejects with the missing key', async () => {
    const m = new MockEngine({ [`${FEN4}|16|2`]: MPV2 })
    await expect(m.evaluate(OTHER, L16, 1)).rejects.toThrow(`mock engine: no eval for ${evalKey(OTHER, L16)}`)
  })

  it('resolves asynchronously, without timers or workers; stats stay zero; measureNps is 1,000,000', async () => {
    const worker = vi.fn()
    vi.stubGlobal('Worker', worker)
    const m = new MockEngine({ [`${FEN4}|16|2`]: MPV2 })
    let resolved = false
    const p = m.evaluate(FEN, L16, 1).then(() => (resolved = true))
    expect(resolved).toBe(false)
    await p
    await m.init(PROFILE)
    await m.stop()
    m.dispose()
    expect(await m.measureNps()).toBe(1_000_000)
    expect(m.stats).toEqual({ workersCreated: 0, uciSent: 0 })
    expect(worker).not.toHaveBeenCalled()
  })
})

describe('createEnginePool selects the mock through window globals', () => {
  it('returns a MockEngine reading window.__MOCK_EVALS__ when __USE_MOCK_ENGINE__ is true', async () => {
    const worker = vi.fn()
    vi.stubGlobal('Worker', worker)
    window.__USE_MOCK_ENGINE__ = true
    window.__MOCK_EVALS__ = { [`${FEN4}|16|2`]: MPV2 }
    const statuses: unknown[] = []
    const pool = createEnginePool(PROFILE, { onStatus: (s) => statuses.push(s) })
    expect(pool).toBeInstanceOf(MockEngine)
    await pool.init(PROFILE)
    expect(statuses).toEqual([{ phase: 'ready', build: 'lite-single', threads: 1 }])
    expect((await pool.evaluate(FEN, L16, 1)).bestmove).toBe('f1b5')
    localStorage.clear()
    expect(await calibrate(pool)).toBe('auto-18')
    expect(worker).not.toHaveBeenCalled()
  })

  it('returns the real (lazy) pool otherwise', () => {
    const worker = vi.fn()
    vi.stubGlobal('Worker', worker)
    const pool = createEnginePool(PROFILE)
    expect(pool).not.toBeInstanceOf(MockEngine)
    expect(worker).not.toHaveBeenCalled()
    pool.dispose()
  })
})
