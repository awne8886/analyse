// Eval formatter (F.4), graph/bar clamping (G.9, G.19), results, move labels, phase grades, sounds (G.24).
import { describe, expect, it } from 'vitest'
import {
  EVAL_CLAMP_PAWNS,
  evalBarResult,
  evalToPawns,
  formatEval,
  graphPoints,
  moveLabel,
  phaseGradeClass,
  playersRowResult,
  positionScore,
  whiteBarPercent,
} from './format'
import { soundFor } from './sounds'
import { fixtureGame, fixtureReview } from './test-fixtures'

describe('formatEval (F.4)', () => {
  it.each([
    [{ type: 'cp', value: 130 }, '+1.3'],
    [{ type: 'cp', value: -80 }, '-0.8'],
    [{ type: 'cp', value: 0 }, '0.0'],
    [{ type: 'cp', value: -4 }, '0.0'],
    [{ type: 'cp', value: 1234 }, '+12.3'],
    [{ type: 'mate', value: 3 }, 'M3'],
    [{ type: 'mate', value: -2 }, '-M2'],
  ] as const)('%o -> %s', (score, text) => {
    expect(formatEval(score)).toBe(text)
  })

  it('eval bar text after the last move is the result', () => {
    expect(evalBarResult('1-0')).toBe('1-0')
    expect(evalBarResult('0-1')).toBe('0-1')
    expect(evalBarResult('1/2-1/2')).toBe('1/2-1/2')
    expect(evalBarResult('*')).toBe('*')
  })

  it('players row result uses the half sign for draws', () => {
    expect(playersRowResult('1/2-1/2')).toBe('½-½')
    expect(playersRowResult('1-0')).toBe('1-0')
    expect(playersRowResult('*')).toBe('*')
  })
})

describe('graph and bar clamping (G.9)', () => {
  it('clamps cp to +-5 pawns', () => {
    expect(EVAL_CLAMP_PAWNS).toBe(5)
    expect(evalToPawns({ type: 'cp', value: 900 })).toBe(5)
    expect(evalToPawns({ type: 'cp', value: -1200 })).toBe(-5)
    expect(evalToPawns({ type: 'cp', value: -300 })).toBe(-3)
    expect(evalToPawns({ type: 'cp', value: 45 })).toBeCloseTo(0.45)
  })

  it('draws mates at the full bar', () => {
    expect(evalToPawns({ type: 'mate', value: 7 })).toBe(5)
    expect(evalToPawns({ type: 'mate', value: -1 })).toBe(-5)
    expect(whiteBarPercent({ type: 'mate', value: 2 })).toBe(100)
    expect(whiteBarPercent({ type: 'mate', value: -2 })).toBe(0)
    expect(whiteBarPercent({ type: 'cp', value: 0 })).toBe(50)
  })

  it('a mated board (mate 0) is full for the side that delivered mate', () => {
    expect(evalToPawns({ type: 'mate', value: 0 }, 'w')).toBe(5)
    expect(evalToPawns({ type: 'mate', value: 0 }, 'b')).toBe(-5)
  })

  it('graphPoints: one point per position 0..N, clamped', () => {
    const pts = graphPoints(fixtureReview())
    expect(pts).toHaveLength(13)
    expect(pts.map((p) => p.pawns)).toEqual([0.2, 0.3, 0.25, 0.35, 0.3, 1.3, -0.8, 0.4, 2.5, 1.2, 5, 5, -5])
    expect(pts.every((p) => !p.hollow)).toBe(true)
  })

  it('graphPoints stops at the first pending ply', () => {
    expect(graphPoints(fixtureReview(fixtureGame(), 5))).toHaveLength(5)
    expect(graphPoints(fixtureReview(fixtureGame(), 1))).toHaveLength(0)
  })

  it('not-analysed plies are interpolated and hollow', () => {
    const review = fixtureReview()
    review.plies[4].status = 'not-analysed' // position 5 (+1.3) unknown, neighbours +0.3 and -0.8
    const pts = graphPoints(review)
    expect(pts[5].hollow).toBe(true)
    expect(pts[5].pawns).toBeCloseTo(-0.25)
  })

  it('positionScore reads evalBefore of ply 1 for the start and evalAfter for later positions', () => {
    const review = fixtureReview()
    expect(positionScore(review, 0)).toEqual({ type: 'cp', value: 20 })
    expect(positionScore(review, 10)).toEqual({ type: 'mate', value: 3 })
    expect(positionScore(fixtureReview(fixtureGame(), 3), 4)).toBeUndefined()
  })
})

describe('moveLabel (E.6)', () => {
  it('numbers from the FEN: 1.e4, 1...e5, 6.Nxf7', () => {
    const g = fixtureGame()
    expect(moveLabel(g.moves[0])).toBe('1.e4')
    expect(moveLabel(g.moves[1])).toBe('1...e5')
    expect(moveLabel(g.moves[10])).toBe('6.Nxf7')
  })
})

describe('phase grade icon bands (R22)', () => {
  it.each([
    [95, 'best'],
    [90, 'best'],
    [85, 'excellent'],
    [72, 'good'],
    [60, 'inaccuracy'],
    [40, 'mistake'],
    [39.9, 'blunder'],
  ] as const)('%d -> %s', (acc, c) => {
    expect(phaseGradeClass(acc)).toBe(c)
  })
})

describe('soundFor (G.24)', () => {
  it('picks game end, check, promotion, castling, capture, move in that order', () => {
    expect(soundFor({ san: 'Qxf7#', captured: 'p' }, true)).toBe('game-end')
    expect(soundFor({ san: 'Qxf7+', captured: 'p' }, false)).toBe('check')
    expect(soundFor({ san: 'e8=Q', promotion: 'q' }, false)).toBe('promote')
    expect(soundFor({ san: 'O-O-O' }, false)).toBe('castle')
    expect(soundFor({ san: 'Nxd5', captured: 'p' }, false)).toBe('capture')
    expect(soundFor({ san: 'Nf3' }, false)).toBe('move')
  })
})
