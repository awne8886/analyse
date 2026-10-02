// Pure display helpers: eval text (F.4), graph/bar scaling (G.9, G.19), move labels (E.6), results (F.4).
import type { Score } from '../types/engine'
import type { GameMove, ImportedGame } from '../types/game'
import { REVIEW_CONFIG } from '../analysis'
import type { Classification, GameReview, PlyReview } from '../types/review'
import { UI_STRINGS } from './strings'

/** The eval graph and the eval bar are clamped to +-5 pawns; mates are drawn at the full bar (G.9). */
export const EVAL_CLAMP_PAWNS = 5

/** `+1.3`, `-0.8`, `0.0`, `M3`, `-M2` (White perspective; F.4). */
export function formatEval(score: Score): string {
  if (score.type === 'mate') return score.value < 0 ? `-M${-score.value}` : `M${score.value}`
  const pawns = Math.round(score.value / 10) / 10
  if (pawns === 0) return '0.0'
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`
}

/** White-perspective pawns clamped to +-5. A mate is +-5; `mate 0` (a checkmated board) is full for `mover`. */
export function evalToPawns(score: Score, mover?: 'w' | 'b'): number {
  if (score.type === 'mate') {
    if (score.value === 0) return mover === 'b' ? -EVAL_CLAMP_PAWNS : EVAL_CLAMP_PAWNS
    return score.value > 0 ? EVAL_CLAMP_PAWNS : -EVAL_CLAMP_PAWNS
  }
  return Math.max(-EVAL_CLAMP_PAWNS, Math.min(EVAL_CLAMP_PAWNS, score.value / 100))
}

/** White's share of the eval bar in percent (50 = level; 100 = mate for White). */
export function whiteBarPercent(score: Score, mover?: 'w' | 'b'): number {
  return 50 + (50 * evalToPawns(score, mover)) / EVAL_CLAMP_PAWNS
}

const hasEval = (p: PlyReview | undefined) =>
  p !== undefined && (p.status === 'done' || p.status === 'refining')

/** The White-perspective evaluation of position n (0 = start, k = after ply k), when analysed. */
export function positionScore(review: GameReview | undefined, n: number): Score | undefined {
  if (!review) return undefined
  if (n === 0) {
    const first = review.plies[0]
    return hasEval(first) ? first.evalBefore : undefined
  }
  const p = review.plies[n - 1]
  return hasEval(p) ? p.evalAfter : undefined
}

/** The full-move number of a move, from its `before` FEN (custom starts keep their own numbering). */
export function moveNumber(move: Pick<GameMove, 'before'>): number {
  return Number(move.before.split(' ')[5]) || 1
}

/** `12.Nf3` / `12...Nf6` (E.6). */
export function moveLabel(move: Pick<GameMove, 'before' | 'color' | 'san'>): string {
  return `${moveNumber(move)}${move.color === 'w' ? '.' : '...'}${move.san}`
}

const RESULT_KEY: Record<ImportedGame['result'], string> = {
  '1-0': 'whiteWins',
  '0-1': 'blackWins',
  '1/2-1/2': 'draw',
  '*': 'unknown',
}

/** Eval bar text after the last move: `1-0`, `0-1`, `1/2-1/2` or `*`. */
export function evalBarResult(result: ImportedGame['result']): string {
  return UI_STRINGS[`evalbar.${RESULT_KEY[result]}`]
}

/** Players-row result: `1-0` / `0-1` / `½-½` / `*`. */
export function playersRowResult(result: ImportedGame['result']): string {
  return UI_STRINGS[`result.${RESULT_KEY[result]}`]
}

/** One decimal, as accuracies are shown (G.11). */
export const oneDecimal = (x: number): string => x.toFixed(1)

/** Graph samples: one per position 0..N up to the last analysed ply. Not-analysed plies are interpolated
 *  between their neighbours and flagged `hollow`. */
export interface GraphPoint {
  x: number
  pawns: number
  hollow: boolean
}
export function graphPoints(review: GameReview | undefined): GraphPoint[] {
  if (!review || !review.plies.length) return []
  const raw: Array<number | null> = []
  const first = review.plies[0]
  if (first.status === 'pending') return []
  raw.push(hasEval(first) ? evalToPawns(first.evalBefore) : null)
  for (const p of review.plies) {
    if (p.status === 'pending') break
    raw.push(hasEval(p) ? evalToPawns(p.evalAfter, p.color) : null)
  }
  return raw.map((v, x) => {
    if (v !== null) return { x, pawns: v, hollow: false }
    let l = x - 1
    while (l >= 0 && raw[l] === null) l--
    let r = x + 1
    while (r < raw.length && raw[r] === null) r++
    const lv = l >= 0 ? (raw[l] as number) : null
    const rv = r < raw.length ? (raw[r] as number) : null
    const pawns = lv !== null && rv !== null ? lv + ((rv - lv) * (x - l)) / (r - l) : (lv ?? rv ?? 0)
    return { x, pawns, hollow: true }
  })
}

/** Phase grade icon by accuracy band (R22): >= 90 Best, >= 80 Excellent, >= 70 Good, >= 55 Inaccuracy,
 *  >= 40 Mistake, below that Blunder. */
export function phaseGradeClass(accuracy: number): Classification {
  const grades: Classification[] = ['best', 'excellent', 'good', 'inaccuracy', 'mistake']
  const i = REVIEW_CONFIG.phaseGradeBands.findIndex((band) => accuracy >= band)
  return i === -1 ? 'blunder' : grades[i]
}
