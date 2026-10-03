// PROMPT.md Appendix A.2: the TCN decoder with castling normalisation, verbatim, plus the five required
// modifications: (1) a drop anywhere rejects the whole list before any move is applied (I-13); (2) tcnToSanList is
// renamed tcnToMoves and returns the verbose history once at the end; (3) applyTcnMove failures become I-11b with
// the ply number; (4) plyCount === moveList.length / 2 is cross-checked when plyCount is present; (5) `as any` is
// replaced by `as Square`.
import { Chess, type Move, type Square } from 'chess.js'
import { ImportFailure } from './errors'
import { replay, type Replay } from './replay'

export const TCN_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++='
const PROMO = 'qnrbkp'
export interface TcnMove {
  from?: string
  to: string
  promotion?: string
  drop?: string
}
const sq = (i: number) => 'abcdefgh'[i % 8] + (Math.floor(i / 8) + 1)

export function decodeTcn(tcn: string): TcnMove[] {
  const out: TcnMove[] = []
  for (let i = 0; i + 1 < tcn.length; i += 2) {
    const a = TCN_ALPHABET.indexOf(tcn[i])
    let b = TCN_ALPHABET.indexOf(tcn[i + 1])
    if (a < 0 || b < 0) throw new Error(`bad TCN char at ${i}`)
    const m: TcnMove = { to: '' }
    if (b > 63) {
      // promotion
      m.promotion = PROMO[Math.floor((b - 64) / 3)]
      b = a + (a < 16 ? -8 : 8) + ((b - 1) % 3) - 1
    }
    if (a > 75) m.drop = PROMO[a - 79]
    else m.from = sq(a)
    m.to = sq(b)
    out.push(m)
  }
  return out
}

// Apply with castling normalisation (king -> rook square => standard castling target).
export function applyTcnMove(chess: Chess, m: TcnMove): Move {
  try {
    return chess.move({ from: m.from!, to: m.to, promotion: m.promotion })
  } catch (e) {
    const p = chess.get(m.from as Square)
    if (p && p.type === 'k') {
      const r = m.from![1]
      if (m.to === 'h' + r) return chess.move({ from: m.from!, to: 'g' + r })
      if (m.to === 'a' + r) return chess.move({ from: m.from!, to: 'c' + r })
    }
    throw e
  }
}

/** Decodes and gates a whole TCN list: bad characters are I-11b, any drop is bughouse (I-13), and a `plyCount`
 *  that disagrees with the list length fails the import (I-11b at the first ply the two disagree on). */
export function decodeTcnChecked(tcn: string, plyCount?: number): TcnMove[] {
  let moves: TcnMove[]
  try {
    moves = decodeTcn(tcn)
  } catch (e) {
    const at = Number(/at (\d+)$/.exec((e as Error).message)?.[1] ?? 0)
    throw new ImportFailure('decode_failed', { n: Math.floor(at / 2) + 1 })
  }
  if (moves.some((m) => m.drop !== undefined))
    throw new ImportFailure('variant_unsupported', {}, { key: 'I-13' })
  if (plyCount !== undefined && plyCount !== tcn.length / 2) {
    throw new ImportFailure('decode_failed', { n: Math.min(plyCount, moves.length) + 1 })
  }
  return moves
}

/** One replay of a decoded TCN list (used by importGame, which also needs the terminal flags). */
export function replayTcn(tcn: string, initialFen?: string, plyCount?: number): Replay {
  const decoded = decodeTcnChecked(tcn, plyCount)
  return replay(initialFen || new Chess().fen(), decoded, applyTcnMove)
}

export function tcnToMoves(tcn: string, initialFen?: string): Move[] {
  return replayTcn(tcn, initialFen).moves
}
