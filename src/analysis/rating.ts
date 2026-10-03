// R21 / B.9: estimated game rating.
import type { Score } from '../types/engine'
import { clamp, REVIEW_CONFIG } from './config'
import type { RatingInput } from './types'
import { stmOf } from './winPercent'

const R = REVIEW_CONFIG.rating

export function estimateRating(input: RatingInput): {
  value?: number
  method: 'regression' | 'acpl' | 'none'
} {
  if (input.moveCount < REVIEW_CONFIG.ratingMinMoves) return { method: 'none' }
  if (input.rating !== undefined) {
    const raw = clamp(R.a + R.b * input.rating + R.c * input.accuracy, R.clamp[0], R.clamp[1])
    return { value: Math.round(raw / R.round) * R.round, method: 'regression' }
  }
  return { value: R.fallbackNoRating(input.acpl), method: 'acpl' }
}

/** White-perspective centipawns for ACPL (spec-gap 6): cp clamped to +-1000, a mate is +-1000, and `mate 0` (which
 *  carries no sign) counts against the side to move of `fen`, the mated side. */
export function acplCp(score: Score, fen: string): number {
  const cap = R.acplCpClamp
  if (score.type === 'cp') return clamp(score.value, -cap, cap)
  if (score.value === 0) return stmOf(fen) === 'w' ? -cap : cap
  return score.value > 0 ? cap : -cap
}

/** Centipawn loss of one move, mover POV: max(0, min(1000, (before - after) * sign)). */
export const moveCpLoss = (before: number, after: number, color: 'w' | 'b'): number =>
  Math.max(0, Math.min(R.acplMaxPerMove, (before - after) * (color === 'w' ? 1 : -1)))
