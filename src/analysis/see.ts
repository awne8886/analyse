// Copy of the PROMPT.md Appendix E.1 detectors that the classifier needs (PLAN Assumption 9: src/analysis keeps its
// own copy because only entry-point exports cross module boundaries). Piece values come from config.ts.
import { Chess, type Color, type Square } from 'chess.js'
import { REVIEW_CONFIG } from './config'

const VAL = REVIEW_CONFIG.pieceValues
const RAY = new Set(['q', 'r', 'b'])
export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')

/** NOTE: chess.attackers() is pseudo-legal (includes pinned pieces and the king). */
export function isDefended(chess: Chess, square: Square): boolean {
  const piece = chess.get(square)!
  if (chess.attackers(square, piece.color).length) return true
  for (const a of chess.attackers(square, other(piece.color))) {
    // lichess "ray defence"
    if (RAY.has(chess.get(a)!.type)) {
      const c = new Chess(chess.fen(), { skipValidation: true })
      c.remove(a)
      if (c.attackers(square, piece.color).length) return true
    }
  }
  return false
}

export function canBeTakenByLowerPiece(c: Chess, s: Square): boolean {
  const p = c.get(s)!
  return c.attackers(s, other(p.color)).some((a) => {
    const ap = c.get(a)!
    return ap.type !== 'k' && VAL[ap.type] < VAL[p.type]
  })
}

/** Static Exchange Evaluation of capturing on `square`, `color` captures first. Swap-list algorithm,
 *  least-valuable-attacker first, x-rays via remove()+re-query, pins ignored (acceptable: engine PV is the arbiter). */
export function see(chess: Chess, square: Square, color: Color): number {
  const b = new Chess(chess.fen(), { skipValidation: true })
  const target = b.get(square)
  if (!target) return 0
  const gains: number[] = []
  let side = color
  let onSquare = VAL[target.type]
  for (let d = 0; d < 32; d++) {
    const atts = b
      .attackers(square, side)
      .map((s) => ({ s, v: VAL[b.get(s)!.type] }))
      .sort((x, y) => x.v - y.v)
    if (!atts.length) break
    const lva = atts[0]
    if (b.get(lva.s)!.type === 'k' && b.attackers(square, other(side)).length) break // king may not take a defended piece
    gains.push(onSquare)
    onSquare = lva.v
    b.remove(lva.s)
    side = other(side)
  }
  if (!gains.length) return 0
  let rest = 0
  for (let i = gains.length - 1; i >= 1; i--) rest = Math.max(0, gains[i] - rest)
  return gains[0] - rest
}

export const enPrise = (c: Chess, s: Square): boolean => see(c, s, other(c.get(s)!.color)) > 0

export function materialCount(c: Chess, color: Color): number {
  let s = 0
  for (const row of c.board())
    for (const p of row) if (p && p.color === color && p.type !== 'k') s += VAL[p.type]
  return s
}
export const materialDiff = (c: Chess, color: Color): number =>
  materialCount(c, color) - materialCount(c, other(color))
