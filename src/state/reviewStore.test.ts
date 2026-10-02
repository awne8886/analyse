// Review store transitions and the small pure pieces of the controller (G.4 grading, R14 tiers, R29 ids).
import { beforeEach, describe, expect, it } from 'vitest'
import type { DeviceProfile } from '../types/engine'
import { fixtureGame, fixtureReview } from '../ui/test-fixtures'
import {
  defaultProfileFor,
  engineProfileFor,
  gameIdOf,
  gradeOf,
  praiseKey,
  tierFor,
  useReviewStore,
} from './index'

beforeEach(() => {
  useReviewStore.getState().reset()
})

describe('useReviewStore transitions', () => {
  it('starts on the import screen with nothing loaded', () => {
    const s = useReviewStore.getState()
    expect(s.screen).toBe('import')
    expect(s.phase).toBe('idle')
    expect(s.game).toBeUndefined()
    expect(s.ply).toBe(0)
  })

  it('openGame loads a game and a review at a clamped ply, flags a custom start', () => {
    const game = fixtureGame()
    useReviewStore.getState().openGame(game, fixtureReview(game), 40)
    expect(useReviewStore.getState().ply).toBe(12)
    expect(useReviewStore.getState().review?.gameId).toBe(game.id)
    expect(useReviewStore.getState().notice).toBeUndefined()
    useReviewStore.getState().openGame(fixtureGame({ customStart: true }), undefined, -3)
    expect(useReviewStore.getState().ply).toBe(0)
    expect(useReviewStore.getState().notice).toBe('custom_start')
    expect(useReviewStore.getState().review).toBeUndefined()
  })

  it('setPly clamps to 0..N and clears the per-ply overlays', () => {
    const game = fixtureGame()
    const store = useReviewStore.getState()
    store.openGame(game, fixtureReview(game))
    store.setPly(5)
    store.toggleShowBest()
    store.toggleShowReply()
    store.patch({ retry: { active: true, checking: false, fen: null } })
    expect(useReviewStore.getState().showBest).toBe(true)
    store.setPly(6)
    const s = useReviewStore.getState()
    expect(s.ply).toBe(6)
    expect(s.showBest).toBe(false)
    expect(s.showReply).toBe(false)
    expect(s.retry.active).toBe(false)
    store.setPly(99)
    expect(useReviewStore.getState().ply).toBe(12)
    store.setPly(-1)
    expect(useReviewStore.getState().ply).toBe(0)
  })

  it('setPly without a game stays at 0', () => {
    useReviewStore.getState().setPly(3)
    expect(useReviewStore.getState().ply).toBe(0)
  })

  it('toggleFlip, setScreen and reset', () => {
    const store = useReviewStore.getState()
    store.openGame(fixtureGame())
    store.setScreen('moves')
    store.toggleFlip()
    expect(useReviewStore.getState().flipped).toBe(true)
    expect(useReviewStore.getState().screen).toBe('moves')
    store.reset()
    const s = useReviewStore.getState()
    expect(s.screen).toBe('import')
    expect(s.game).toBeUndefined()
    expect(s.inputText).toBe('')
  })

  it('a new game drops the previous error, notice and progress', () => {
    const store = useReviewStore.getState()
    store.patch({
      importError: { key: 'I-2' },
      importNotice: { key: 'P-8', fallback: 'Searching 2025/01…' },
      progress: { done: 3, total: 10, etaMs: 1000, refining: 0 },
    })
    store.openGame(fixtureGame())
    const s = useReviewStore.getState()
    expect(s.importError).toBeUndefined()
    expect(s.importNotice).toBeUndefined()
    expect(s.progress).toBeUndefined()
  })
})

describe('Retry grading (G.4)', () => {
  it.each([
    ['brilliant', 'correct'],
    ['great', 'correct'],
    ['best', 'correct'],
    ['excellent', 'good'],
    ['good', 'ok'],
    ['book', 'ok'],
    ['forced', 'ok'],
    ['inaccuracy', 'incorrect'],
    ['mistake', 'incorrect'],
    ['blunder', 'incorrect'],
    ['miss', 'incorrect'],
  ] as const)('%s -> %s', (c, grade) => {
    expect(gradeOf(c)).toBe(grade)
  })

  it('praise: the sacrifice line only for Brilliant, the try-again line for Incorrect', () => {
    expect(praiseKey('brilliant', 7)).toBe('praise.correct.3')
    for (let ply = 1; ply < 10; ply++) expect(praiseKey('best', ply)).not.toBe('praise.correct.3')
    expect(praiseKey('blunder', 3)).toBe('retry.tryAgain')
  })
})

describe('profiles and tiers (R14, C.4)', () => {
  const desktop: DeviceProfile = {
    isIOS: false,
    isIPad: false,
    isAndroid: false,
    isMobile: false,
    isTablet: false,
    isWebKit: false,
    lowMem: false,
    hc: 8,
    simd: true,
    coi: false,
    pthreads: false,
    build: 'lite-single',
    workers: 4,
    threads: 1,
    hashMb: 64,
    multiPv: 2,
  }

  it('fast-14 overrides every choice; auto follows the calibration', () => {
    expect(tierFor('standard', 'fast-14')).toBe('fast-14')
    expect(tierFor('deep', 'fast-14')).toBe('fast-14')
    expect(tierFor('deep', 'auto-18')).toBe('deep-20')
    expect(tierFor('standard', 'auto-18')).toBe('standard-16')
    expect(tierFor('auto', 'auto-16')).toBe('auto-16')
    expect(tierFor('auto', undefined)).toBe('standard-16')
    expect(tierFor('standard', 'auto-18', true)).toBe('fast-14')
  })

  it('the EngineProfile carries the tier limits and the device MultiPV', () => {
    const p = engineProfileFor({ ...desktop, multiPv: 1 }, 'auto-16')
    expect(p.limits).toEqual({ depth: 16, movetimeMs: 400, multiPv: 1 })
    expect(p.tier).toBe('auto-16')
    expect(p.workers).toBe(4)
    expect(engineProfileFor(desktop, 'deep-20').limits).toEqual({ depth: 20, movetimeMs: 6000, multiPv: 2 })
  })

  it('Auto is the default on phones and tablets, Standard on desktop', () => {
    expect(defaultProfileFor(desktop)).toBe('standard')
    expect(defaultProfileFor({ ...desktop, isMobile: true })).toBe('auto')
  })
})

describe('gameIdOf', () => {
  it('derives the id before any request when the input names the kind', () => {
    expect(gameIdOf({ kind: 'chesscom', cckind: 'live', id: '129688175007' })).toBe('cc:live:129688175007')
    expect(gameIdOf({ kind: 'lichess', id: '4S1PZUvW' })).toBe('li:4S1PZUvW')
    expect(gameIdOf({ kind: 'chesscom', cckind: 'unknown', id: '1' })).toBeNull()
    expect(gameIdOf({ kind: 'pgn', pgn: '1. e4' })).toBeNull()
  })
})
