// R22 and Appendix B.7: lichess Divider, evaluated on the board before each ply.
// (The pinned middlegame/endgame start plies of cc:live:129688175007 are added by the lead in Phase 3.)
import { loadNetworkFixture } from '../test/loadFixture'
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { backrankSparse, dividePhases, majorsAndMinors, mixedness } from './index'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// 11 pieces that are not kings or pawns, both back ranks intact enough (no trigger)
const ELEVEN = 'rnbqk3/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1'
// exactly 10 (middlegame trigger by piece count only)
const TEN = 'rnb1k3/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1'
// 7, still a middlegame position only
const SEVEN = 'rnb1k3/pppppppp/8/8/8/8/PPPPPPPP/RNBQK3 w - - 0 1'
// hand-built board with 6 non-king non-pawn pieces (R, N, B for each side): endgame condition
const SIX = 'rnb1k3/pppppppp/8/8/8/8/PPPPPPPP/RNB1K3 w - - 0 1'
// 3 white pieces on rank 1 (R, K, R): backrankSparse for White
const WHITE_SPARSE = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w kq - 0 1'
// 3 black pieces on rank 8 (r, k, r): backrankSparse for Black
const BLACK_SPARSE = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1'
// exactly 4 white pieces on rank 1 (R, K, B, R): not sparse
const WHITE_FOUR = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R3KB1R w kq - 0 1'
// 14 majors and minors, 3 white pieces on rank 1, nothing else triggers (mixedness 51): the sparse back rank alone
const SPARSE_ONLY = 'rnbqkbnr/pppppppp/8/8/8/NBQ2NB1/PPPPPPPP/R3K2R w kq - 0 1'
// 14 majors and minors, back ranks of 5 and 6 pieces, mixedness 163 (> 150): the mixedness trigger alone
const MIXED_HIGH = 'rn1qkb2/3p1pp1/b1p1pn1r/pp2N2p/5P1P/1PP5/PB1PP1P1/RN1QKBR1 b Qq - 0 9'
// 14 majors and minors, back ranks of 4 and 4, mixedness 117 (<= 150): no trigger
const MIXED_MID = 'r2q1rk1/1b2bppp/p1n1pn2/1pp5/3PP3/2N2N2/PP1BBPPP/R2Q1RK1 w - - 0 10'
// 14 majors and minors, back ranks of 5 and 5, mixedness 87: no trigger
const MIXED_LOW = 'r1bq1rk1/pp2bppp/2n1pn2/2pp4/2PP4/2N1PN2/PP2BPPP/R1BQ1RK1 w - - 0 8'

describe('majorsAndMinors (B.7)', () => {
  it('counts every piece that is not a king and not a pawn, both colours: 14 at the start position', () => {
    expect(majorsAndMinors(START)).toBe(14)
  })

  it('counts hand-built boards', () => {
    expect(majorsAndMinors(ELEVEN)).toBe(11)
    expect(majorsAndMinors(TEN)).toBe(10)
    expect(majorsAndMinors(SEVEN)).toBe(7)
    expect(majorsAndMinors(SIX)).toBe(6)
    expect(majorsAndMinors('8/8/8/8/3k4/8/R7/R3K3 w Q - 0 1')).toBe(2)
  })
})

describe('backrankSparse (B.7)', () => {
  it('is false at the start position', () => {
    expect(backrankSparse(START)).toBe(false)
  })

  it('is true with 3 white pieces on rank 1', () => {
    expect(backrankSparse(WHITE_SPARSE)).toBe(true)
  })

  it('is true with 3 black pieces on rank 8', () => {
    expect(backrankSparse(BLACK_SPARSE)).toBe(true)
  })

  it('is false with exactly 4 pieces on the back rank', () => {
    expect(backrankSparse(WHITE_FOUR)).toBe(false)
  })
})

describe('mixedness (B.7)', () => {
  it('is 0 at the start position', () => {
    expect(mixedness(START)).toBe(0)
  })

  it('sums the 2x2 region scores of the B.7 table (hand-computed from the table)', () => {
    expect(mixedness(SPARSE_ONLY)).toBe(51)
    expect(mixedness(MIXED_LOW)).toBe(87)
    expect(mixedness(MIXED_MID)).toBe(117)
    expect(mixedness(MIXED_HIGH)).toBe(163)
    expect(mixedness('8/8/8/8/3k4/8/R7/R3K3 w Q - 0 1')).toBe(41)
  })
})

describe('dividePhases (B.7)', () => {
  it('a game with neither trigger is all opening', () => {
    expect(dividePhases([START, START, ELEVEN])).toEqual({})
  })

  it('middlegame starts at the first board with at most 10 majors and minors', () => {
    expect(dividePhases([START, ELEVEN, TEN, SEVEN])).toEqual({ middlegame: 2 })
  })

  it('endgame starts at the first board with at most 6 majors and minors, after the middlegame', () => {
    expect(dividePhases([START, ELEVEN, TEN, SIX])).toEqual({ middlegame: 2, endgame: 3 })
  })

  it('a board with 6 non-king non-pawn pieces triggers the endgame condition', () => {
    expect(majorsAndMinors(SIX)).toBe(6)
    // the middlegame index is the same ply, not strictly before, so the middlegame start is dropped
    expect(dividePhases([START, START, SIX])).toEqual({ endgame: 2 })
  })

  it('a sparse back rank starts the middlegame', () => {
    expect(dividePhases([START, SPARSE_ONLY])).toEqual({ middlegame: 1 })
  })

  it('mixedness above 150 starts the middlegame, 150 or below does not', () => {
    expect(dividePhases([START, MIXED_HIGH])).toEqual({ middlegame: 1 })
    expect(dividePhases([START, MIXED_MID, MIXED_LOW])).toEqual({})
  })

  it('an endgame index that is not strictly after the middlegame index drops the middlegame start', () => {
    expect(dividePhases([SIX])).toEqual({ endgame: 0 })
    expect(dividePhases([START, SIX, SIX])).toEqual({ endgame: 1 })
  })

  it('4S1PZUvW: a custom start with at most 6 pieces is endgame from ply 0 (phaseStarts = { endgame: 0 })', () => {
    const c = new Chess('8/8/8/8/3k4/8/R7/R3K3 w Q - 0 1')
    const fens = [c.fen()]
    for (const san of ['Ra4+', 'Kc5', 'R4a5+', 'Kb6', 'Ra6+', 'Kb7']) {
      c.move(san)
      fens.push(c.fen())
    }
    expect(dividePhases(fens)).toEqual({ endgame: 0 })
  })
})

// Pinned regression (R22), added by the lead in Phase 3 from the merged implementation: the Divider boundaries
// of cc:live:129688175007 (expected windows 18 to 40 and 50 to 112; values recorded in PROGRESS.md).
describe('pinned phase starts of cc:live:129688175007', () => {
  it('middlegame starts at board index 30 and endgame at 76', () => {
    const month = loadNetworkFixture('api.chess.com-month-hikaru-2025-01').body as {
      games: { url: string; pgn: string }[]
    }
    const chess = new Chess()
    chess.loadPgn(month.games.find((g) => g.url.endsWith('/129688175007'))!.pgn)
    const beforeFens = chess.history({ verbose: true }).map((m) => m.before)
    expect(beforeFens).toHaveLength(112)
    expect(dividePhases(beforeFens)).toEqual({ middlegame: 30, endgame: 76 })
  })
})
