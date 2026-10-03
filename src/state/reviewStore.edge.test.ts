// Edge cases of the per-game reset in the review store: the E-3 "resuming from move n" state belongs to one game
// and must not leak onto the next game or back to the import screen (R16, G.4).
import { beforeEach, describe, expect, it } from 'vitest'
import { fixtureGame, fixtureReview } from '../ui/test-fixtures'
import { useReviewStore } from './index'

beforeEach(() => {
  useReviewStore.getState().reset()
})

describe('resumedFrom (E-3) is per game', () => {
  it('openGame of another game clears it', () => {
    const store = useReviewStore.getState()
    const game = fixtureGame()
    store.openGame(game, fixtureReview(game, 6), 0)
    store.patch({ resumedFrom: 6 })
    expect(useReviewStore.getState().resumedFrom).toBe(6)
    store.openGame(fixtureGame({ id: 'cc:live:999' }))
    expect(useReviewStore.getState().resumedFrom).toBeUndefined()
  })

  it('reset (New game) clears it, together with the review, the game and the progress', () => {
    const store = useReviewStore.getState()
    const game = fixtureGame()
    store.openGame(game, fixtureReview(game, 6), 4)
    store.patch({
      resumedFrom: 6,
      phase: 'analysing',
      progress: { done: 3, total: 10, etaMs: null, refining: 0 },
    })
    store.reset()
    const s = useReviewStore.getState()
    expect(s.resumedFrom).toBeUndefined()
    expect(s.game).toBeUndefined()
    expect(s.review).toBeUndefined()
    expect(s.progress).toBeUndefined()
    expect(s.phase).toBe('idle')
    expect(s.screen).toBe('import')
  })

  it('stepping through plies keeps it (the banner stays while the run is going)', () => {
    const store = useReviewStore.getState()
    const game = fixtureGame()
    store.openGame(game, fixtureReview(game, 6), 0)
    store.patch({ resumedFrom: 6 })
    store.setPly(3)
    store.setPly(5)
    expect(useReviewStore.getState().resumedFrom).toBe(6)
  })
})
