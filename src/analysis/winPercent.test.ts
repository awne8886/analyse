// R18: one win-probability curve for everything; B.2 last paragraph for winPctWhite on a checkmate terminal.
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { clamp, REVIEW_CONFIG, winPct, winPctWhite } from './index'

type Score = Parameters<typeof winPct>[0]
type PositionEval = Exclude<Parameters<typeof winPctWhite>[0], Score>

const cp = (value: number): Score => ({ type: 'cp', value })
const mate = (value: number): Score => ({ type: 'mate', value })

const terminalEval = (fen: string, terminal: 'checkmate' | 'stalemate'): PositionEval => ({
  fen,
  lines: [],
  depth: 0,
  multiPv: 2,
  bestmove: null,
  terminal,
})

describe('winPct (R18)', () => {
  it('0 cp is 50', () => {
    expect(winPct(cp(0))).toBeCloseTo(50, 10)
  })

  it('+1000 cp is 97.54 and -1000 cp is 2.46 (2 decimals)', () => {
    expect(winPct(cp(1000))).toBeCloseTo(97.54, 2)
    expect(winPct(cp(-1000))).toBeCloseTo(2.46, 2)
  })

  it('mate 0 (the side to move is mated) is 0', () => {
    expect(winPct(mate(0))).toBe(0)
  })

  it('a mate for the side to move is 100 and a mate against it is 0, whatever the distance', () => {
    for (const n of [1, 2, 5, 30]) {
      expect(winPct(mate(n))).toBe(100)
      expect(winPct(mate(-n))).toBe(0)
    }
  })

  it('clamps cp beyond +-1000 to the value at +-1000', () => {
    expect(winPct(cp(5000))).toBe(winPct(cp(1000)))
    expect(winPct(cp(1001))).toBe(winPct(cp(1000)))
    expect(winPct(cp(-5000))).toBe(winPct(cp(-1000)))
    expect(winPct(cp(-1001))).toBe(winPct(cp(-1000)))
  })

  it('follows the logistic curve with k = REVIEW_CONFIG.winCurveK on the open interval', () => {
    for (const v of [-999, -400, -37, 1, 20, 150, 733]) {
      const expected = 50 + 50 * (2 / (1 + Math.exp(-REVIEW_CONFIG.winCurveK * clamp(v, -1000, 1000))) - 1)
      expect(winPct(cp(v))).toBeCloseTo(expected, 10)
    }
  })

  it('is strictly increasing in cp and symmetric around 50', () => {
    let prev = winPct(cp(-1000))
    for (let v = -900; v <= 1000; v += 100) {
      const w = winPct(cp(v))
      expect(w).toBeGreaterThan(prev)
      prev = w
    }
    for (const v of [10, 123, 480, 999]) {
      expect(winPct(cp(v)) + winPct(cp(-v))).toBeCloseTo(100, 10)
    }
  })
})

describe('winPctWhite (B.2: White perspective, checkmate terminal carries no sign in Score)', () => {
  // Qg7# on 7k/5Q2/5K2/8/8/8/8/8 w: Black (to move) is mated
  const blackMatedFen = (() => {
    const c = new Chess('7k/5Q2/5K2/8/8/8/8/8 w - - 0 1')
    c.move('Qg7#')
    return c.fen()
  })()
  // fool's mate: White (to move) is mated
  const whiteMatedFen = (() => {
    const c = new Chess()
    for (const san of ['f3', 'e5', 'g4', 'Qh4#']) c.move(san)
    return c.fen()
  })()

  it('a checkmate terminal with Black to move is 100 for White', () => {
    expect(blackMatedFen.split(' ')[1]).toBe('b')
    expect(winPctWhite(terminalEval(blackMatedFen, 'checkmate'), blackMatedFen)).toBe(100)
  })

  it('a checkmate terminal with White to move is 0 for White', () => {
    expect(whiteMatedFen.split(' ')[1]).toBe('w')
    expect(winPctWhite(terminalEval(whiteMatedFen, 'checkmate'), whiteMatedFen)).toBe(0)
  })

  it('a non-terminal PositionEval applies the curve to line 1 as it stands (White perspective)', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    const ev: PositionEval = {
      fen,
      lines: [{ multipv: 1, depth: 16, score: cp(-120), pv: ['f1b5'] }],
      depth: 16,
      multiPv: 2,
      bestmove: 'f1b5',
    }
    expect(winPctWhite(ev, fen)).toBeCloseTo(winPct(cp(-120)), 10)
    expect(winPctWhite(cp(-120), fen)).toBeCloseTo(winPct(cp(-120)), 10)
  })

  it('a White-perspective mate score is 100 when White mates and 0 when Black mates', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    expect(winPctWhite(mate(3), fen)).toBe(100)
    expect(winPctWhite(mate(-3), fen)).toBe(0)
  })

  it('a stalemate (0 cp) is 50 whichever side is to move', () => {
    const fen = '7k/8/5KQ1/8/8/8/8/8 b - - 1 1'
    expect(winPctWhite(cp(0), fen)).toBeCloseTo(50, 10)
  })
})
