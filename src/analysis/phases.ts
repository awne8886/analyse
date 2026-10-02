// R22 / B.7: the lichess Divider on the board before each ply, and the phase grade bands.
import type { Classification, Phase } from '../types/review'
import { REVIEW_CONFIG } from './config'

/** 8x8 board from a FEN, board[rank][file] with rank 0 = rank 1; cells hold the piece letter (upper = White). */
function parseBoard(fen: string): (string | null)[][] {
  const rows = fen.split(' ')[0].split('/')
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null))
  rows.forEach((row, i) => {
    let file = 0
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') file += Number(ch)
      else board[7 - i][file++] = ch
    }
  })
  return board
}
const isWhite = (p: string): boolean => p === p.toUpperCase()

export function majorsAndMinors(fen: string): number {
  return parseBoard(fen)
    .flat()
    .filter((p) => p !== null && !'kKpP'.includes(p)).length
}

export function backrankSparse(fen: string): boolean {
  const b = parseBoard(fen)
  const whiteOnFirst = b[0].filter((p) => p !== null && isWhite(p)).length
  const blackOnEighth = b[7].filter((p) => p !== null && !isWhite(p)).length
  return whiteOnFirst < 4 || blackOnEighth < 4
}

/** B.7 region score; `y` is the 1-based region row (1..7). */
function regionScore(y: number, white: number, black: number): number {
  switch (white) {
    case 0:
      if (black === 1) return 1 + y
      if (black === 2) return y < 6 ? 2 + (6 - y) : 0
      if (black === 3 || black === 4) return y < 7 ? 3 + (7 - y) : 0
      return 0
    case 1:
      if (black === 0) return 1 + (8 - y)
      if (black === 1) return 5 + Math.abs(4 - y)
      if (black === 2) return 4 + (7 - y)
      if (black === 3) return 5 + (7 - y)
      return 0
    case 2:
      if (black === 0) return y > 2 ? 2 + (y - 2) : 0
      if (black === 1) return 4 + (y - 1)
      if (black === 2) return 7
      return 0
    case 3:
      if (black === 0) return y > 1 ? 3 + (y - 1) : 0
      if (black === 1) return 5 + (y - 1)
      return 0
    case 4:
      return black === 0 && y > 1 ? 3 + (y - 1) : 0
    default:
      return 0
  }
}

export function mixedness(fen: string): number {
  const b = parseBoard(fen)
  let total = 0
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      let white = 0
      let black = 0
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const p = b[y + dy][x + dx]
        if (p === null) continue
        if (isWhite(p)) white++
        else black++
      }
      total += regionScore(y + 1, white, black)
    }
  return total
}

/** Lichess Divider over the boards before each ply (`beforeFens[i]` is the board before ply i + 1); the result
 *  is an index into that array. */
export function dividePhases(beforeFens: string[]): { middlegame?: number; endgame?: number } {
  const mm = beforeFens.map(majorsAndMinors)
  const middlegame = beforeFens.findIndex((f, i) => mm[i] <= 10 || backrankSparse(f) || mixedness(f) > 150)
  const endgame = mm.findIndex((n) => n <= 6)
  const out: { middlegame?: number; endgame?: number } = {}
  if (endgame >= 0) out.endgame = endgame
  if (middlegame >= 0 && (endgame < 0 || endgame > middlegame)) out.middlegame = middlegame
  return out
}

/** Phase of ply `ply` (1-based): the board before it has index ply - 1 (spec-gap 5). */
export function phaseOfPly(ply: number, starts: { middlegame?: number; endgame?: number }): Phase {
  if (starts.endgame !== undefined && ply - 1 >= starts.endgame) return 'endgame'
  if (starts.middlegame !== undefined && ply - 1 >= starts.middlegame) return 'middlegame'
  return 'opening'
}

/** R22 phase grade icon: >= 90 Best, >= 80 Excellent, >= 70 Good, >= 55 Inaccuracy, >= 40 Mistake, else Blunder. */
export function phaseGrade(accuracy: number): Classification {
  const grades: Classification[] = ['best', 'excellent', 'good', 'inaccuracy', 'mistake']
  const i = REVIEW_CONFIG.phaseGradeBands.findIndex((band) => accuracy >= band)
  return i < 0 ? 'blunder' : grades[i]
}
