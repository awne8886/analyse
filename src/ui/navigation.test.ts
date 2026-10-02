// Keyboard handling (G.23), stepping with sounds (G.24), `&ply=` in the URL (R29), Key Moves (R23).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReviewStore, useSettingsStore } from '../state'
import { goToPly, handleKey, nextKeyMoment } from './navigation'
import { playSound } from './sounds'
import { fixtureGame, fixtureReview } from './test-fixtures'

vi.mock('./sounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sounds')>()),
  playSound: vi.fn(),
}))

const key = (k: string, target: Partial<HTMLElement> | null = null, mods: Partial<KeyboardEvent> = {}) =>
  handleKey({ key: k, altKey: false, ctrlKey: false, metaKey: false, target: target as EventTarget, ...mods })

beforeEach(() => {
  vi.mocked(playSound).mockClear()
  window.history.replaceState(null, '', '/')
  localStorage.clear()
  useSettingsStore.getState().update({ explain: true, sounds: true, userColor: 'w' })
  const game = fixtureGame()
  useReviewStore.getState().openGame(game, fixtureReview(game))
  useReviewStore.getState().setScreen('moves')
})

describe('handleKey (G.23)', () => {
  it('Right / Left step one ply and write &ply=', () => {
    expect(key('ArrowRight')).toBe(true)
    expect(key('ArrowRight')).toBe(true)
    expect(useReviewStore.getState().ply).toBe(2)
    expect(window.location.search).toBe('?game=cc:live:129688175007&ply=2')
    expect(key('ArrowLeft')).toBe(true)
    expect(useReviewStore.getState().ply).toBe(1)
  })

  it('Home / End jump to the first and last ply', () => {
    key('End')
    expect(useReviewStore.getState().ply).toBe(12)
    key('Home')
    expect(useReviewStore.getState().ply).toBe(0)
    key('ArrowLeft')
    expect(useReviewStore.getState().ply).toBe(0)
  })

  it('f flips the board, e toggles Explain (persisted setting)', () => {
    key('f')
    expect(useReviewStore.getState().flipped).toBe(true)
    key('f')
    expect(useReviewStore.getState().flipped).toBe(false)
    key('e')
    expect(useSettingsStore.getState().explain).toBe(false)
    key('e')
    expect(useSettingsStore.getState().explain).toBe(true)
  })

  it('ignores keys typed into inputs and keys with modifiers', () => {
    expect(key('ArrowRight', { tagName: 'INPUT' })).toBe(false)
    expect(key('e', { tagName: 'TEXTAREA' })).toBe(false)
    expect(key('ArrowRight', null, { ctrlKey: true })).toBe(false)
    expect(useReviewStore.getState().ply).toBe(0)
    expect(useSettingsStore.getState().explain).toBe(true)
  })

  it('does nothing on the import screen or for other keys', () => {
    expect(key('x')).toBe(false)
    useReviewStore.getState().setScreen('import')
    expect(key('ArrowRight')).toBe(false)
    expect(useReviewStore.getState().ply).toBe(0)
  })
})

describe('stepping sounds (G.24)', () => {
  it('plays the move sound, the capture sound, the brilliant chime on the user own Brilliant, game end last', () => {
    goToPly(1)
    expect(playSound).toHaveBeenLastCalledWith('move')
    goToPly(9) // exd5
    expect(playSound).toHaveBeenLastCalledWith('capture')
    vi.mocked(playSound).mockClear()
    goToPly(11) // Nxf7, White's Brilliant, the user plays White
    expect(vi.mocked(playSound).mock.calls).toEqual([['capture'], ['brilliant']])
    vi.mocked(playSound).mockClear()
    goToPly(12)
    expect(vi.mocked(playSound).mock.calls).toEqual([['game-end']])
  })

  it('no chime for the opponent Brilliant, and silence when Sounds is off', () => {
    useSettingsStore.getState().update({ userColor: 'b' })
    goToPly(11)
    expect(vi.mocked(playSound).mock.calls).toEqual([['capture']])
    vi.mocked(playSound).mockClear()
    useSettingsStore.getState().update({ sounds: false })
    goToPly(3)
    expect(playSound).not.toHaveBeenCalled()
  })
})

describe('nextKeyMoment (R23 Key Moves)', () => {
  it('steps through the key moments of the user colour, wrapping around', () => {
    const review = fixtureReview()
    // key moments 10 (Black) and 11 (White)
    expect(nextKeyMoment(review, 0, 'w')).toBe(11)
    expect(nextKeyMoment(review, 11, 'w')).toBe(11)
    expect(nextKeyMoment(review, 0, 'b')).toBe(10)
    expect(nextKeyMoment({ ...review, keyMoments: [] }, 0, 'w')).toBeNull()
  })
})
