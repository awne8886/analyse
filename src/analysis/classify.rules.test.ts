// B.3 rules not exercised by the 19 B.5 fixtures (hand-made engine numbers, White perspective).
import { describe, expect, it } from 'vitest'
import type { Score } from '../types/engine'
import { classifyPly, type ClassifyContext } from './index'
import { isRefineCandidate } from './classify'
import { cp, lineEval, makeGame, mate } from './test-helpers'

function ctx(
  sans: string[],
  beforeLines: [string, Score][],
  afterLines: [string, Score][],
  opts: { startFen?: string; previous?: ClassifyContext['previous'] } = {},
): ClassifyContext {
  const game = makeGame(sans, { customStart: true, ...(opts.startFen ? { startFen: opts.startFen } : {}) })
  const move = game.moves[game.moves.length - 1]
  return {
    move,
    before: lineEval(move.before, beforeLines),
    after: lineEval(move.after, afterLines),
    isBook: false,
    ...(opts.previous ? { previous: opts.previous } : {}),
  }
}

describe('classifyPly: soft cap (B.3 step 6)', () => {
  it('a Blunder from a lost position (winBefore <= 3) becomes Good', () => {
    // Ra6?? (fixture 6 board) but Black was already at -1000 cp: the cp-to-mate table says Blunder
    const r = classifyPly(
      ctx(
        ['Ra6'],
        [
          ['g8f8', cp(1000)],
          ['a8c8', cp(1000)],
        ],
        [['e1e8', mate(1)]],
        { startFen: 'r5k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1' },
      ),
    )
    expect(r.classification).toBe('good')
    expect(r.reasonCode).toBe('SoftCap')
  })
})

describe('classifyPly: Great exclusions (B.3 step 9)', () => {
  it('a recapture of an undefended piece with a big gap to line 2 is Best, not Great', () => {
    // 1.e4 d5 2.exd5 Qxd5: Black's only good move recaptures on d5
    const r = classifyPly(
      ctx(
        ['e4', 'd5', 'exd5', 'Qxd5'],
        [
          ['d8d5', cp(-30)],
          ['g8f6', cp(400)],
        ],
        [['b1c3', cp(30)]],
        { previous: { winBefore: 47, winAfter: 47, uci: 'e4d5', to: 'd5', captured: 'p' } },
      ),
    )
    expect(r.classification).toBe('best')
    expect(r.reasonCode).toBe('BestTop')
  })

  it('the same gap on a quiet move is Great', () => {
    const r = classifyPly(
      ctx(
        ['e4', 'd5', 'Nc3'],
        [
          ['b1c3', cp(30)],
          ['e4d5', cp(-400)],
        ],
        [['d5d4', cp(30)]],
      ),
    )
    expect(r.classification).toBe('great')
    expect(r.reasonCode).toBe('Great:gap')
  })
})

describe('classifyPly: Brilliant sacrifice (B.3 step 8)', () => {
  const bxf7 = (lines: [string, Score][]) =>
    ctx(['e4', 'e5', 'Bc4', 'Nc6', 'Bxf7+'], lines, [['e8f7', cp(-50)]])

  it('Bxf7+ as the top move leaves the bishop en prise to the king (SEE 3 - 1 = 2): Brilliant:a', () => {
    const r = classifyPly(
      bxf7([
        ['c4f7', cp(50)],
        ['g1f3', cp(30)],
      ]),
    )
    expect(r.classification).toBe('brilliant')
    expect(r.reasonCode).toBe('Brilliant:a')
  })

  it('the same sacrifice is not Brilliant when it loses more than 2 win%', () => {
    const r = classifyPly(
      bxf7([
        ['g1f3', cp(50)],
        ['d2d3', cp(40)],
      ]),
    )
    expect(r.loss).toBeGreaterThan(2)
    expect(r.classification).toBe('inaccuracy')
  })

  it('not when the position was already winning (line 2 >= 700 cp for the mover)', () => {
    const r = classifyPly(
      bxf7([
        ['c4f7', cp(50)],
        ['g1f3', cp(700)],
      ]),
    )
    expect(r.classification).toBe('best')
  })
})

describe('isRefineCandidate (R15)', () => {
  const quiet = (beforeTop: [string, Score], previous?: ClassifyContext['previous']) =>
    ctx(['e4', 'd5', 'Nc3'], [beforeTop], [['d5d4', cp(100)]], previous ? { previous } : {})

  it('a base Best or Excellent is a candidate; a Mistake without the Miss or mate precondition is not', () => {
    const best = quiet(['b1c3', cp(30)])
    expect(isRefineCandidate(best, classifyPly(best))).toBe(true)
    const mistake = quiet(['g1f3', cp(300)])
    const res = classifyPly(mistake)
    expect(res.classification).toBe('mistake')
    expect(isRefineCandidate(mistake, res)).toBe(false)
  })

  it("the opponent's previous move raising the mover's win% by 10 makes a candidate", () => {
    const c = quiet(['g1f3', cp(300)], { winBefore: 50, winAfter: 25, uci: 'd7d5', to: 'd5' })
    expect(isRefineCandidate(c, classifyPly(c))).toBe(true)
  })

  it('a mate in at most 5 for the mover before the move makes a candidate', () => {
    const c = quiet(['g1f3', mate(5)])
    expect(isRefineCandidate(c, classifyPly(c))).toBe(true)
    const far = quiet(['g1f3', mate(6)])
    expect(isRefineCandidate(far, classifyPly(far))).toBe(false)
  })
})
