// Move sounds (G.24; Kenney CC0 mp3s under public/sounds/, Appendix H.2). Muted by the persisted "Sounds" setting.
import type { GameMove } from '../types/game'

export type SoundName =
  'move' | 'capture' | 'castle' | 'check' | 'promote' | 'game-end' | 'brilliant' | 'illegal' | 'notify'

/** The sound of stepping onto a move: game end on the last move, then check, promotion, castling, capture. */
export function soundFor(move: Pick<GameMove, 'san' | 'captured' | 'promotion'>, isLast: boolean): SoundName {
  if (isLast) return 'game-end'
  if (/[+#]/.test(move.san)) return 'check'
  if (move.promotion) return 'promote'
  if (move.san.startsWith('O-O')) return 'castle'
  if (move.captured) return 'capture'
  return 'move'
}

const cache = new Map<SoundName, HTMLAudioElement>()

export function playSound(name: SoundName): void {
  if (typeof Audio === 'undefined') return
  let audio = cache.get(name)
  if (!audio) {
    audio = new Audio(`${import.meta.env.BASE_URL}sounds/${name}.mp3`)
    audio.preload = 'auto'
    cache.set(name, audio)
  }
  try {
    audio.currentTime = 0
    const p = audio.play() as Promise<void> | undefined
    p?.catch(() => {
      /* autoplay blocked or decoding failed: sounds are optional */
    })
  } catch {
    /* not supported in this environment */
  }
}
