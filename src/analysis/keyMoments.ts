// R23 / B.10: key moments.
import type { PlyReview } from '../types/review'
import { REVIEW_CONFIG } from './config'

const K = REVIEW_CONFIG.keyMoments

/** White-perspective win% before and after a ply, from the mover-POV values of the PlyReview (B.2). */
export const whiteWins = (p: PlyReview): [number, number] =>
  p.color === 'w' ? [p.winBefore, p.winAfter] : [100 - p.winBefore, 100 - p.winAfter]

/** Score of a key-moment candidate, or null when the ply is not a candidate. */
export function keyMomentScore(p: PlyReview): number | null {
  if (p.status !== 'done') return null
  const [before, after] = whiteWins(p)
  const swing = Math.abs(after - before)
  const c = p.classification
  const candidate =
    c === 'brilliant' ||
    c === 'great' ||
    c === 'miss' ||
    c === 'blunder' ||
    (c === 'mistake' && swing >= K.mistakeMinSwing)
  if (!candidate) return null
  let score = swing
  if (c === 'brilliant' || c === 'great') score += K.bonusBrilliantGreat
  if (c === 'miss') score += K.bonusMiss
  if ((before - 50) * (after - 50) < 0) score += K.bonusCross50
  return score
}

/** Key-moment ply numbers (PlyReview.ply), in ply order (B.10): candidates by score (ties: earlier ply first), a
 *  candidate within `dedupePlies` of a higher-scored KEPT one is dropped, at most `cap` are kept. */
export function keyMoments(plies: PlyReview[]): number[] {
  const candidates = plies
    .map((p) => ({ ply: p.ply, score: keyMomentScore(p) }))
    .filter((c): c is { ply: number; score: number } => c.score !== null)
    .sort((a, b) => b.score - a.score || a.ply - b.ply)
  const kept: number[] = []
  for (const c of candidates) {
    if (kept.length >= K.cap) break
    if (kept.some((ply) => Math.abs(ply - c.ply) <= K.dedupePlies)) continue
    kept.push(c.ply)
  }
  return kept.sort((a, b) => a - b)
}
