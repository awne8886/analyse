// R18: the one win-probability curve (lichess), B.2.
import type { PositionEval, Score } from '../types/engine'
import { clamp, REVIEW_CONFIG } from './config'

export const stmOf = (fen: string): 'w' | 'b' => (fen.split(' ')[1] === 'b' ? 'b' : 'w')

/** Win% of a score from the perspective it is expressed in (mate 0 = side to move mated = 0). */
export function winPct(score: Score): number {
  if (score.type === 'mate') return score.value > 0 ? 100 : 0
  const cp = clamp(score.value, -REVIEW_CONFIG.cpClamp, REVIEW_CONFIG.cpClamp)
  return 50 + 50 * (2 / (1 + Math.exp(-REVIEW_CONFIG.winCurveK * cp)) - 1)
}

/** White-perspective win% of a PositionEval or a White-perspective Score. A checkmate (terminal flag, or a
 *  `mate 0` score, which carries no sign) is scored for the side NOT to move in `fen` (B.2). */
export function winPctWhite(ev: PositionEval | Score, fen: string): number {
  if ('lines' in ev) {
    if (ev.terminal === 'checkmate') return stmOf(fen) === 'b' ? 100 : 0
    if (ev.terminal) return 50
    const top = ev.lines[0]
    return top ? winPctWhite(top.score, fen) : 50
  }
  if (ev.type === 'mate' && ev.value === 0) return stmOf(fen) === 'b' ? 100 : 0
  return winPct(ev)
}
