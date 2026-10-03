// Boot idempotence (risk 12, D.8): renderApp twice creates one store, one engine pool and one import; a cached
// complete review renders without booting the engine (R16, DoD item 9); window.__ANALYSE_ENGINE_STATS__.
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeGame } from '../analysis'
import { calibrate, createEnginePool } from '../engine'
import { importGame } from '../import'
import type { DeviceProfile } from '../types/engine'
import type { EngineHandle } from '../engine'
import { fixtureGame, fixtureReview } from './test-fixtures'

vi.mock('../import', () => ({
  parseInput: vi.fn(),
  importGame: vi.fn(),
  confirmInProgress: vi.fn(),
  IMPORT_STRINGS: {},
}))
vi.mock('../engine', () => ({
  deviceProfile: vi.fn(),
  createEnginePool: vi.fn(),
  calibrate: vi.fn(),
  ENGINE_STRINGS: { 'E-7': 'Enabling multi-core analysis…' },
}))
vi.mock('../analysis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../analysis')>()),
  analyzeGame: vi.fn(),
  summarySentence: vi.fn(() => 'White played with 87.0% accuracy.'),
}))
vi.mock('../explain', () => ({ buildMoveFacts: vi.fn(), explain: vi.fn() }))

const DESKTOP: DeviceProfile = {
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

function fakePool(): EngineHandle {
  return {
    measureNps: vi.fn(async () => 1_000_000),
    init: vi.fn(async () => undefined),
    evaluate: vi.fn(),
    stop: vi.fn(async () => undefined),
    dispose: vi.fn(),
    stats: { workersCreated: 4, uciSent: 21 },
  }
}

// renderApp mounts its own root, which testing-library's cleanup never sees: unmount it after each test so no
// React work outlives the jsdom environment.
let unmountApp: (() => void) | undefined

async function freshBoot() {
  vi.resetModules()
  const { renderApp, unmountApp: unmount } = await import('./renderApp')
  unmountApp = unmount
  const state = await import('../state')
  return { renderApp, state }
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  localStorage.clear()
  vi.mocked(importGame).mockReset()
  vi.mocked(createEnginePool).mockReset()
  vi.mocked(calibrate).mockReset()
  vi.mocked(analyzeGame).mockReset()
})
afterEach(async () => {
  await act(async () => {
    unmountApp?.()
  })
  unmountApp = undefined
  cleanup()
})

describe('renderApp idempotence (risk 12)', () => {
  it('called twice: one root, one store, one import, one engine pool', async () => {
    const game = fixtureGame({ id: 'cc:live:111111111111' })
    const review = fixtureReview(game)
    window.history.replaceState(null, '', '/?game=cc:live:111111111111')
    vi.mocked(importGame).mockResolvedValue({ ok: true, game, via: 'proxy' })
    const pool = fakePool()
    vi.mocked(createEnginePool).mockReturnValue(pool)
    vi.mocked(calibrate).mockResolvedValue('auto-18')
    vi.mocked(analyzeGame).mockImplementation(async (_g, _e, _p, opts) => {
      opts.onPly?.(review.plies[0], { ...review, complete: false })
      return review
    })
    const { renderApp, state } = await freshBoot()
    const storeBefore = state.useReviewStore
    await act(async () => {
      renderApp(DESKTOP)
      renderApp(DESKTOP)
    })
    await waitFor(() => expect(state.useReviewStore.getState().phase).toBe('complete'))
    expect(importGame).toHaveBeenCalledTimes(1)
    expect(createEnginePool).toHaveBeenCalledTimes(1)
    expect(calibrate).toHaveBeenCalledTimes(1)
    expect(analyzeGame).toHaveBeenCalledTimes(1)
    expect(state.useReviewStore).toBe(storeBefore)
    expect(document.querySelectorAll('[data-testid="review"]')).toHaveLength(1)
    expect(screen.getByTestId('review')).toHaveAttribute('data-complete', 'true')
    expect(screen.getByTestId('review')).toHaveAttribute('data-game-id', 'cc:live:111111111111')
    expect(window.__ANALYSE_ENGINE_STATS__?.()).toEqual({ workersCreated: 4, uciSent: 21 })
    // the final profile: Standard on desktop (device default) with the device MultiPV
    expect(vi.mocked(analyzeGame).mock.calls[0][2].limits).toEqual({
      depth: 16,
      movetimeMs: 1500,
      multiPv: 2,
    })
    // persisted incrementally and at the end
    expect((await state.loadReview('cc:live:111111111111'))?.complete).toBe(true)
    expect(window.location.search).toBe('?game=cc:live:111111111111')
  })

  it('a cached complete review renders the requested ply without creating an engine pool (DoD 9)', async () => {
    const game = fixtureGame({ id: 'cc:live:222222222222' })
    const { renderApp, state } = await freshBoot()
    await state.saveGame(game)
    await state.persistReview({ ...fixtureReview(game), gameId: game.id })
    window.history.replaceState(null, '', '/?game=cc:live:222222222222&ply=10')
    await act(async () => {
      renderApp(DESKTOP)
    })
    await waitFor(() => expect(screen.getByTestId('move-10')).toHaveAttribute('aria-current', 'true'))
    expect(createEnginePool).not.toHaveBeenCalled()
    expect(importGame).not.toHaveBeenCalled()
    expect(window.__ANALYSE_ENGINE_STATS__?.()).toEqual({ workersCreated: 0, uciSent: 0 })
    expect(screen.getByTestId('review')).toHaveAttribute('data-complete', 'true')
  })

  it('a partial review on reload resumes in fast-14 with E-3', async () => {
    const game = fixtureGame({ id: 'cc:live:333333333333' })
    const partial = { ...fixtureReview(game, 6), gameId: game.id }
    const { renderApp, state } = await freshBoot()
    await state.saveGame(game)
    await state.persistReview(partial)
    window.history.replaceState(null, '', '/?game=cc:live:333333333333')
    vi.mocked(createEnginePool).mockReturnValue(fakePool())
    vi.mocked(calibrate).mockResolvedValue('auto-18')
    vi.mocked(analyzeGame).mockResolvedValue({ ...fixtureReview(game), gameId: game.id })
    await act(async () => {
      renderApp(DESKTOP)
    })
    await waitFor(() => expect(analyzeGame).toHaveBeenCalledTimes(1))
    const [, , profile, opts] = vi.mocked(analyzeGame).mock.calls[0]
    expect(profile.tier).toBe('fast-14')
    expect(opts.resumeFrom?.plies[4].status).toBe('done')
    expect(state.useReviewStore.getState().resumedFrom).toBe(6)
  })

  it('without SIMD the engine status is E-1 and no pool is created', async () => {
    window.history.replaceState(null, '', '/')
    const { renderApp, state } = await freshBoot()
    await act(async () => {
      renderApp(null)
    })
    expect(state.useReviewStore.getState().engine).toMatchObject({ phase: 'error', key: 'E-1' })
    expect(createEnginePool).not.toHaveBeenCalled()
  })
})
