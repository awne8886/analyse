// R23 and Appendix B.10: key moments from hand-built PlyReview arrays.
// Candidates: every Brilliant, Great, Miss and Blunder ply, plus Mistakes with |white win% swing| >= 15.
// Score = |swing| + 10 (Brilliant, Great) + 5 (Miss) + 5 (white win% crossed 50). Sort by score, drop any candidate
// within 2 plies of a higher-scored one already kept, keep the top 8, return the ply numbers in ply order.
import { describe, expect, it } from 'vitest'
import { keyMoments, REVIEW_CONFIG } from './index'

type PlyReview = Parameters<typeof keyMoments>[0][number]
type Classification = PlyReview['classification']

/** What a test says about one ply: its class and the mover-POV win% before and after the move. */
interface Spec {
  cls: Classification
  wb: number
  wa: number
}

const K = REVIEW_CONFIG.winCurveK
// inverse of the win% curve, so evalBefore/evalAfter agree with winBefore/winAfter whichever one the implementation
// reads (keep the win% values inside (2.46, 97.54), the range the clamped curve can produce)
const cpForWin = (win: number): number => (2 / K) * Math.atanh((win - 50) / 50)

/** Ply n (1-based); odd plies are White's. winBefore/winAfter are mover POV, evalBefore/evalAfter White POV. */
function ply(n: number, { cls, wb, wa }: Spec): PlyReview {
  const color = n % 2 === 1 ? 'w' : 'b'
  const sign = color === 'w' ? 1 : -1
  return {
    ply: n,
    color,
    san: 'Nf3',
    uci: 'g1f3',
    before: '',
    after: '',
    status: 'done',
    evalBefore: { type: 'cp', value: sign * cpForWin(wb) },
    evalAfter: { type: 'cp', value: sign * cpForWin(wa) },
    winBefore: wb,
    winAfter: wa,
    loss: Math.max(0, wb - wa),
    bestUci: null,
    bestSan: null,
    bestPv: [],
    classification: cls,
    reasonCode: 'Band',
    accuracy: 100,
    depth: 16,
    multiPv: 2,
    phase: 'middlegame',
    isKeyMoment: false,
    explanation: { headline: '', sentences: [], arrows: [], highlights: [], reasonCode: '' },
  }
}

const FILLER: Spec = { cls: 'best', wb: 60, wa: 60 }

/** `count` quiet plies (swing 0, no candidate) with the given plies replaced. */
function game(count: number, at: Record<number, Spec>): PlyReview[] {
  return Array.from({ length: count }, (_, i) => ply(i + 1, at[i + 1] ?? FILLER))
}

/** A blunder with the given swing, from 95 so that it never crosses 50 (swing up to 40). */
const blunder = (swing: number): Spec => ({ cls: 'blunder', wb: 95, wa: 95 - swing })

describe('keyMoments: candidates (B.10)', () => {
  it('a game with no Brilliant, Great, Miss, Blunder or big Mistake has no key moment', () => {
    expect(keyMoments(game(30, {}))).toEqual([])
    expect(keyMoments([])).toEqual([])
  })

  it('every Brilliant, Great, Miss and Blunder is a candidate, whatever its swing', () => {
    const plies = game(30, {
      3: { cls: 'brilliant', wb: 60, wa: 58 },
      9: { cls: 'great', wb: 60, wa: 58 },
      15: { cls: 'miss', wb: 60, wa: 58 },
      21: { cls: 'blunder', wb: 60, wa: 58 },
    })
    expect(keyMoments(plies)).toEqual([3, 9, 15, 21])
  })

  it('a Mistake is a candidate from a swing of 15 win% points (white or black mover), not below', () => {
    const plies = game(45, {
      3: { cls: 'mistake', wb: 80, wa: 64.9 }, // swing 15.1, White
      12: { cls: 'mistake', wb: 80, wa: 64.9 }, // swing 15.1, Black
      21: { cls: 'mistake', wb: 80, wa: 65.1 }, // swing 14.9, White
      30: { cls: 'mistake', wb: 80, wa: 65.1 }, // swing 14.9, Black
      39: { cls: 'mistake', wb: 57, wa: 43 }, // swing 14 that crosses 50: the bonus does not make it a candidate
    })
    expect(keyMoments(plies)).toEqual([3, 12])
  })

  it('Inaccuracy, Excellent, Good, Best, Book and Forced plies are never candidates, even with a big swing', () => {
    const big = (cls: Classification): Spec => ({ cls, wb: 85, wa: 55 })
    const plies = game(40, {
      3: big('inaccuracy'),
      9: big('excellent'),
      15: big('good'),
      21: big('best'),
      27: big('book'),
      33: big('forced'),
    })
    expect(keyMoments(plies)).toEqual([])
  })
})

describe('keyMoments: score bonuses (B.10)', () => {
  /** Two adjacent candidates (ply 3 and ply 4) in an otherwise quiet game: which one survives? */
  const survivor = (a: Spec, b: Spec): number[] => keyMoments(game(8, { 3: a, 4: b }))

  it('Brilliant and Great get a bonus of 10: swing 3 beats a Blunder of swing 12 but not one of swing 14', () => {
    for (const cls of ['brilliant', 'great'] as const) {
      const bonus: Spec = { cls, wb: 60, wa: 57 }
      expect(survivor(bonus, blunder(12))).toEqual([3])
      expect(survivor(bonus, blunder(14))).toEqual([4])
      expect(survivor(blunder(12), bonus)).toEqual([4])
      expect(survivor(blunder(14), bonus)).toEqual([3])
    }
  })

  it('Miss gets a bonus of 5: swing 8 beats a Blunder of swing 12 but not one of swing 14', () => {
    const miss: Spec = { cls: 'miss', wb: 60, wa: 52 }
    expect(survivor(miss, blunder(12))).toEqual([3])
    expect(survivor(miss, blunder(14))).toEqual([4])
    expect(survivor(blunder(12), miss)).toEqual([4])
    expect(survivor(blunder(14), miss)).toEqual([3])
  })

  it('crossing 50% in White win% gets a bonus of 5: a crossing swing of 8 beats a swing of 12 but not 14', () => {
    const crossing: Spec = { cls: 'blunder', wb: 55, wa: 47 }
    expect(survivor(crossing, blunder(12))).toEqual([3])
    expect(survivor(crossing, blunder(14))).toEqual([4])
    expect(survivor(blunder(12), crossing)).toEqual([4])
    expect(survivor(blunder(14), crossing)).toEqual([3])
  })

  it('the swing is the absolute White win% change, so Black movers rank the same as White movers', () => {
    // ply 3 is White's (odd), ply 4 is Black's: a Black blunder of swing 20 beats a White one of swing 19
    expect(survivor(blunder(19), blunder(20))).toEqual([4])
    expect(survivor(blunder(20), blunder(19))).toEqual([3])
  })
})

describe('keyMoments: de-duplication, cap and order (B.10)', () => {
  it('a candidate within 2 plies of a higher-scored one is dropped, the higher score is kept', () => {
    expect(keyMoments(game(20, { 10: blunder(30), 12: blunder(25) }))).toEqual([10])
    expect(keyMoments(game(20, { 10: blunder(20), 12: blunder(30) }))).toEqual([12])
    expect(keyMoments(game(20, { 10: blunder(30), 11: blunder(25) }))).toEqual([10])
  })

  it('3 plies apart is not a duplicate', () => {
    expect(keyMoments(game(20, { 10: blunder(30), 13: blunder(25) }))).toEqual([10, 13])
  })

  it('a dropped candidate does not shield its neighbours: only higher-scored KEPT ones drop a candidate', () => {
    // 10 (30) keeps, 12 (25) is dropped by 10, 14 (20) is 4 plies from 10 and so survives
    expect(keyMoments(game(20, { 10: blunder(30), 12: blunder(25), 14: blunder(20) }))).toEqual([10, 14])
  })

  it('keeps the 8 best of 10 candidates and returns them in ply order', () => {
    // swings in ply order, plies 3, 6, ..., 30; the two lowest (20 at ply 6, 21 at ply 15) are cut
    const swings = [33, 20, 38, 35, 21, 39, 32, 36, 34, 37]
    const at: Record<number, Spec> = {}
    swings.forEach((s, i) => {
      at[3 * (i + 1)] = blunder(s)
    })
    expect(keyMoments(game(33, at))).toEqual([3, 9, 12, 18, 21, 24, 27, 30])
  })

  it('the cap applies after de-duplication', () => {
    // 4 pairs of adjacent candidates (a swing-40 and a swing-30 blunder; the 40 survives), then 6 lone candidates
    // of swings 21 to 26: after de-duplication there are 10, the cap keeps the 4 highs and the best 4 lone ones
    const at: Record<number, Spec> = {
      3: blunder(40),
      4: blunder(30),
      9: blunder(30),
      10: blunder(40),
      15: blunder(40),
      16: blunder(30),
      21: blunder(30),
      22: blunder(40),
      28: blunder(24),
      31: blunder(21),
      34: blunder(26),
      37: blunder(22),
      40: blunder(25),
      43: blunder(23),
    }
    expect(keyMoments(game(45, at))).toEqual([3, 10, 15, 22, 28, 34, 40, 43])
  })

  it('returns ply numbers (PlyReview.ply), not array indices', () => {
    const plies = game(12, { 7: blunder(30) }).map((p) => ({ ...p, ply: p.ply + 100 }))
    expect(keyMoments(plies)).toEqual([107])
  })
})
