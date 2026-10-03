// Stepping through the game (G.23, G.24, R29): one place that moves the ply, writes `&ply=` and plays sounds.
import { buildShareLink, useReviewStore, useSettingsStore, writeUrlState } from '../state'
import type { GameReview } from '../types/review'
import { playSound, soundFor } from './sounds'

export function goToPly(target: number): void {
  const store = useReviewStore.getState()
  const { game, review } = store
  if (!game) return
  const before = store.ply
  store.setPly(target)
  const ply = useReviewStore.getState().ply
  writeUrlState({ game: game.id, ply })
  if (ply === before || ply === 0 || !useSettingsStore.getState().sounds) return
  const move = game.moves[ply - 1]
  playSound(soundFor(move, ply === game.moves.length && !game.inProgress))
  const c = review?.plies[ply - 1]?.classification
  const done = review?.plies[ply - 1]?.status === 'done'
  if (done && (c === 'brilliant' || c === 'great') && move.color === useSettingsStore.getState().userColor) {
    playSound('brilliant')
  }
}

export const step = (delta: number) => goToPly(useReviewStore.getState().ply + delta)
export const toFirst = () => goToPly(0)
export const toLast = () => goToPly(useReviewStore.getState().game?.moves.length ?? 0)

/** The next key moment of the user's colour after `ply`, wrapping around (R23 "Key Moves"); null when none. */
export function nextKeyMoment(
  review: GameReview | undefined,
  ply: number,
  userColor: 'w' | 'b',
): number | null {
  const mine = (review?.keyMoments ?? []).filter((k) => review?.plies[k - 1]?.color === userColor)
  if (!mine.length) return null
  return mine.find((k) => k > ply) ?? mine[0]
}

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** Global review hotkeys (G.23): Left/Right, Home/End, `f` flip, `e` Explain. Returns true when handled. Keys a
 *  focused widget already handled (the eval graph slider) and keys on the board (a piece drag in Retry, a11y M5)
 *  are left alone. */
export function handleKey(
  e: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'target'> & {
    defaultPrevented?: boolean
  },
): boolean {
  if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return false
  const target = e.target as HTMLElement | null
  if (target && (TYPING.has(target.tagName) || target.isContentEditable)) return false
  if (target?.closest?.('[data-testid="board"]')) return false
  const { screen, game } = useReviewStore.getState()
  if (!game || (screen !== 'moves' && screen !== 'overview')) return false
  switch (e.key) {
    case 'ArrowLeft':
      step(-1)
      return true
    case 'ArrowRight':
      step(1)
      return true
    case 'Home':
      toFirst()
      return true
    case 'End':
      toLast()
      return true
    case 'f':
    case 'F':
      useReviewStore.getState().toggleFlip()
      return true
    case 'e':
    case 'E':
      useSettingsStore.getState().toggleExplain()
      return true
    default:
      return false
  }
}

/** Share (G.27): `location.origin + BASE_URL + ?game=&ply=` to the clipboard, then "Link copied". */
export async function copyShareLink(): Promise<string | null> {
  const { game, ply } = useReviewStore.getState()
  if (!game) return null
  const link = buildShareLink(game.id, ply, window.location.origin, import.meta.env.BASE_URL)
  try {
    await navigator.clipboard.writeText(link)
  } catch {
    /* clipboard unavailable: the link is still in the address bar */
  }
  useReviewStore.getState().patch({ linkCopied: true })
  setTimeout(() => useReviewStore.getState().patch({ linkCopied: false }), 2000)
  return link
}
