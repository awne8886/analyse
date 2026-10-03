// Controller flows fixed after the Phase 4 reviews: E-2 Retry boots a fresh pool (performance H2), no engine for a
// stored review that covers every move (performance M3), init per game (R17), a storage failure is not an engine
// failure (performance L3), explanations rebuilt once the next ply exists (correctness L2), and the "You played"
// toggle during the in-progress confirmation (parity GAP-3).
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { analyzeGame } from '../analysis'
import { calibrate, createEnginePool, type EngineHandle } from '../engine'
import { buildMoveFacts, explain } from '../explain'
import { importGame, parseInput } from '../import'
import type { DeviceProfile } from '../types/engine'
import type { MoveFacts } from '../types/explain'
import type { GameReview } from '../types/review'
import { ImportScreen } from '../ui/ImportScreen'
import { fixtureGame, fixtureReview } from '../ui/test-fixtures'
import { __resetSessionForTests, needsEngine } from './controller'
import {
  bootApp,
  chooseGame,
  loadReview,
  newGame,
  persistReview,
  retryEngine,
  saveGame,
  submitInput,
  useReviewStore,
  useSettingsStore,
} from './index'
import * as persistence from './persistence'

vi.mock('../import', () => ({
  parseInput: vi.fn(),
  importGame: vi.fn(),
  confirmInProgress: vi.fn((g) => g),
  IMPORT_STRINGS: {},
}))
vi.mock('../engine', () => ({
  deviceProfile: vi.fn(),
  createEnginePool: vi.fn(),
  calibrate: vi.fn(),
  ENGINE_STRINGS: {},
}))
vi.mock('../analysis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../analysis')>()),
  analyzeGame: vi.fn(),
}))
vi.mock('../explain', () => ({ buildMoveFacts: vi.fn(), explain: vi.fn() }))
vi.mock('./persistence', async (importOriginal) => {
  const real = await importOriginal<typeof import('./persistence')>()
  return { ...real, persistReview: vi.fn(real.persistReview) }
})

const DESKTOP = {
  build: 'lite-single',
  workers: 2,
  threads: 1,
  hashMb: 64,
  multiPv: 2,
  isMobile: false,
} as DeviceProfile

function fakePool(): EngineHandle {
  return {
    measureNps: vi.fn(async () => 1_000_000),
    init: vi.fn(async () => undefined),
    evaluate: vi.fn(),
    stop: vi.fn(async () => undefined),
    dispose: vi.fn(),
    stats: { workersCreated: 2, uciSent: 10 },
  }
}

const store = () => useReviewStore.getState()

beforeEach(() => {
  __resetSessionForTests()
  store().reset()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.mocked(createEnginePool).mockReset()
  vi.mocked(calibrate).mockReset().mockResolvedValue('standard-16')
  vi.mocked(analyzeGame).mockReset()
  vi.mocked(importGame).mockReset()
  vi.mocked(parseInput).mockReset()
  vi.mocked(buildMoveFacts).mockReset()
  vi.mocked(explain).mockReset()
  vi.mocked(persistence.persistReview).mockClear()
})
afterEach(cleanup)

describe('E-2 Retry (performance H2)', () => {
  it('disposes the failed pool, boots a new one and restarts the analysis', async () => {
    const game = fixtureGame({ id: 'cc:live:500000000001' })
    const review = { ...fixtureReview(game), gameId: game.id }
    const first = fakePool()
    const second = fakePool()
    vi.mocked(createEnginePool).mockReturnValueOnce(first).mockReturnValueOnce(second)
    vi.mocked(analyzeGame).mockRejectedValueOnce(new Error('worker died')).mockResolvedValueOnce(review)
    bootApp(DESKTOP)
    await chooseGame(game)
    expect(store().engine).toMatchObject({ phase: 'error', key: 'E-2', message: 'worker died' })
    expect(store().phase).toBe('idle')
    expect(first.dispose).toHaveBeenCalledTimes(1)

    await retryEngine()
    expect(createEnginePool).toHaveBeenCalledTimes(2)
    expect(vi.mocked(analyzeGame).mock.calls[1][1]).toBe(second)
    expect(second.dispose).not.toHaveBeenCalled()
    expect(store().phase).toBe('complete')
    expect(store().engine.phase).toBe('ready')
  })
})

describe('per-game engine options (R17, C.1 item 5)', () => {
  it('calls pool.init with the final profile at the start of every analysis run', async () => {
    const pool = fakePool()
    vi.mocked(createEnginePool).mockReturnValue(pool)
    vi.mocked(analyzeGame).mockImplementation(async (g) => ({ ...fixtureReview(g), gameId: g.id }))
    bootApp(DESKTOP)
    await chooseGame(fixtureGame({ id: 'cc:live:500000000002' }))
    await chooseGame(fixtureGame({ id: 'cc:live:500000000003' }))
    expect(createEnginePool).toHaveBeenCalledTimes(1)
    const finalProfile = vi.mocked(analyzeGame).mock.calls[0][2]
    // the provisional boot, then once per game with the profile the game is analysed with
    expect(pool.init).toHaveBeenCalledTimes(3)
    expect(
      vi
        .mocked(pool.init)
        .mock.calls.slice(1)
        .map(([p]) => p.limits),
    ).toEqual([finalProfile.limits, finalProfile.limits])
  })
})

describe('no engine for a stored review that covers every move (performance M3)', () => {
  it('a complete review of an accepted in-progress game renders without a worker and without E-3', async () => {
    const game = fixtureGame({ id: 'cc:daily:500000000004', kind: 'daily', inProgress: true, result: '*' })
    await saveGame(game)
    await persistReview({ ...fixtureReview(game), gameId: game.id })
    window.history.replaceState(null, '', '/?game=cc:daily:500000000004')
    bootApp(DESKTOP)
    await vi.waitFor(() => expect(store().phase).toBe('complete'))
    expect(createEnginePool).not.toHaveBeenCalled()
    expect(analyzeGame).not.toHaveBeenCalled()
    expect(store().resumedFrom).toBeUndefined()
    expect(window.__ANALYSE_ENGINE_STATS__?.()).toEqual({ workersCreated: 0, uciSent: 0 })
  })

  it('needsEngine: only when a move has no finished ply', () => {
    const game = fixtureGame()
    expect(needsEngine(game, undefined)).toBe(true)
    expect(needsEngine(game, fixtureReview(game))).toBe(false)
    expect(needsEngine(game, fixtureReview(game, 6))).toBe(true)
    const longer = fixtureGame({ moves: game.moves })
    expect(needsEngine({ ...longer, moves: [...game.moves, game.moves[0]] }, fixtureReview(game))).toBe(true)
  })
})

describe('storage failures (performance L3)', () => {
  it('a failed IndexedDB write still completes the review and is not reported as E-2', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const game = fixtureGame({ id: 'cc:live:500000000005' })
    const review = { ...fixtureReview(game), gameId: game.id }
    const pool = fakePool()
    vi.mocked(createEnginePool).mockReturnValue(pool)
    const realPersist = vi.mocked(persistence.persistReview).getMockImplementation()
    onTestFinished(() => {
      vi.mocked(persistence.persistReview).mockImplementation(realPersist!)
    })
    vi.mocked(persistence.persistReview).mockRejectedValue(new Error('QuotaExceededError'))
    vi.mocked(analyzeGame).mockImplementation(async (_g, _e, _p, opts) => {
      opts.onPly?.(review.plies[0], { ...review, complete: false })
      return review
    })
    bootApp(DESKTOP)
    await chooseGame(game)
    expect(store().phase).toBe('complete')
    expect(store().review).toEqual(review)
    expect(store().engine.phase).toBe('ready')
    expect(pool.dispose).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('explanations use the next ply (correctness L2)', () => {
  it('re-explains ply k once ply k + 1 is emitted, in every partial and in the stored review', async () => {
    const game = fixtureGame({ id: 'cc:live:500000000006' })
    const full = { ...fixtureReview(game), gameId: game.id }
    // facts record whether the next ply's line was available when the explanation was built
    vi.mocked(buildMoveFacts).mockImplementation(
      (rev: GameReview, ply: number) =>
        ({ ply, playedPv: rev.plies[ply]?.bestPv ?? [] }) as unknown as MoveFacts,
    )
    vi.mocked(explain).mockImplementation((f) => ({
      headline: `ply ${(f as unknown as { ply: number }).ply} reply ${f.playedPv.length}`,
      sentences: [],
      arrows: [],
      highlights: [],
      reasonCode: 'test',
    }))
    const stale = { headline: 'stale', sentences: [], arrows: [], highlights: [], reasonCode: 'stale' }
    const pending = { ...full.plies[1], status: 'pending' as const, bestPv: [] }
    const partial1: GameReview = {
      ...full,
      complete: false,
      plies: [{ ...full.plies[0], explanation: stale }, pending, ...full.plies.slice(2)],
    }
    const partial2: GameReview = {
      ...full,
      plies: [{ ...full.plies[0], explanation: stale }, ...full.plies.slice(1)],
    }
    vi.mocked(createEnginePool).mockReturnValue(fakePool())
    const seen: string[] = []
    vi.mocked(analyzeGame).mockImplementation(async (_g, _e, _p, opts) => {
      opts.onPly?.(partial1.plies[0], partial1)
      seen.push(store().review?.plies[0].explanation.headline ?? '')
      opts.onPly?.(partial2.plies[1], partial2)
      seen.push(store().review?.plies[0].explanation.headline ?? '')
      return partial2
    })
    bootApp(DESKTOP)
    await chooseGame(game)
    expect(seen).toEqual(['stale', 'ply 1 reply 1'])
    expect(store().review?.plies[0].explanation.headline).toBe('ply 1 reply 1')
    expect((await loadReview(game.id))?.plies[0].explanation.headline).toBe('ply 1 reply 1')
  })
})

describe('"You played" during the in-progress confirmation (parity GAP-3)', () => {
  it('preselects the username colour with the note, and New game drops the note', async () => {
    const game = fixtureGame({ id: 'cc:daily:500000000007', kind: 'daily', inProgress: true, result: '*' })
    vi.mocked(parseInput).mockReturnValue({ kind: 'chesscom', cckind: 'daily', id: '500000000007' })
    vi.mocked(importGame).mockResolvedValue({
      ok: true,
      game,
      via: 'proxy',
      pendingConfirmation: 'in_progress_daily',
    })
    useSettingsStore.getState().update({ username: 'hikaru', userColor: 'w' })
    bootApp(DESKTOP)
    render(<ImportScreen />)
    await submitInput('https://www.chess.com/game/daily/500000000007')
    expect(store().pending?.key).toBe('I-4')
    expect(await screen.findByText('from username')).toBeInTheDocument()
    expect(screen.getByTestId('color-black')).toHaveAttribute('aria-pressed', 'true')
    act(() => newGame())
    expect(store().colorFromUsername).toBe(false)
    expect(screen.queryByText('from username')).toBeNull()
  })
})
