// Retry mode (G.4): a retried move equal to a stored line's first move reuses that line's score (no search);
// any other move is searched once with MultiPV 1 ("Checking..."); the class maps to Correct / Good / OK /
// Incorrect; illegal moves are refused.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyPly } from '../analysis'
import { calibrate, createEnginePool } from '../engine'
import type { DeviceProfile, EngineApi, PositionEval } from '../types/engine'
import { fixtureGame, fixtureReview } from '../ui/test-fixtures'
import { __resetSessionForTests, bootApp } from './controller'
import { startRetry, tryRetryMove, useReviewStore } from './index'

vi.mock('../analysis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../analysis')>()),
  classifyPly: vi.fn(),
}))
vi.mock('../engine', () => ({
  deviceProfile: vi.fn(),
  createEnginePool: vi.fn(),
  calibrate: vi.fn(),
  ENGINE_STRINGS: {},
}))

const DEVICE = {
  build: 'lite-single',
  workers: 1,
  threads: 1,
  hashMb: 64,
  multiPv: 2,
  isMobile: false,
} as DeviceProfile

beforeEach(() => {
  __resetSessionForTests()
  vi.mocked(classifyPly).mockReset()
  window.history.replaceState(null, '', '/')
  bootApp(DEVICE)
  const game = fixtureGame()
  useReviewStore.getState().openGame(game, fixtureReview(game), 8) // 4...d5, best was d6 (d7d6)
  startRetry()
})

describe('tryRetryMove (G.4)', () => {
  it('refuses an illegal move', () => {
    expect(tryRetryMove('d8', 'd1')).toBe(false)
    expect(classifyPly).not.toHaveBeenCalled()
  })

  it('the engine best move reuses its stored line: no search, Correct', async () => {
    vi.mocked(classifyPly).mockReturnValue({
      classification: 'best',
      reasonCode: 'x',
      winBefore: 50,
      winAfter: 50,
      loss: 0,
    })
    expect(tryRetryMove('d7', 'd6')).toBe(true)
    await vi.waitFor(() => expect(useReviewStore.getState().retry.feedback?.grade).toBe('correct'))
    expect(createEnginePool).not.toHaveBeenCalled()
    const ctx = vi.mocked(classifyPly).mock.calls[0][0]
    expect(ctx.isBook).toBe(false)
    expect(ctx.move.uci).toBe('d7d6')
    expect(ctx.after.lines[0].score).toEqual(ctx.before.lines[0].score)
    expect(ctx.previous?.uci).toBe('f3g5')
    expect(useReviewStore.getState().retry.fen).toContain('2np1n2')
  })

  it('another move is searched once with MultiPV 1, then graded', async () => {
    const searched: PositionEval = {
      fen: '',
      lines: [{ multipv: 1, depth: 16, score: { type: 'cp', value: 300 }, pv: ['e4d5'] }],
      depth: 16,
      multiPv: 1,
      bestmove: 'e4d5',
    }
    const pool: EngineApi = {
      init: vi.fn(async () => undefined),
      evaluate: vi.fn(async () => searched),
      stop: vi.fn(async () => undefined),
      dispose: vi.fn(),
      stats: { workersCreated: 1, uciSent: 1 },
    }
    vi.mocked(createEnginePool).mockReturnValue(pool)
    vi.mocked(calibrate).mockResolvedValue('auto-18')
    vi.mocked(classifyPly).mockReturnValue({
      classification: 'mistake',
      reasonCode: 'x',
      winBefore: 50,
      winAfter: 30,
      loss: 20,
    })
    expect(tryRetryMove('h7', 'h6')).toBe(true)
    expect(useReviewStore.getState().retry.checking).toBe(true)
    await vi.waitFor(() => expect(useReviewStore.getState().retry.feedback?.grade).toBe('incorrect'))
    expect(pool.evaluate).toHaveBeenCalledTimes(1)
    const [, limits] = vi.mocked(pool.evaluate).mock.calls[0]
    expect(limits.multiPv).toBe(1)
    expect(vi.mocked(classifyPly).mock.calls[0][0].after).toBe(searched)
    expect(useReviewStore.getState().retry.feedback?.praise).toBe('retry.tryAgain')
  })
})
