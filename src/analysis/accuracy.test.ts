// R20 and Appendix B.6 (accuracy fixture, real game 184475402332, 29 plies).
import { describe, expect, it } from 'vitest'
import { clamp, gameAccuracy, LICHESS_PRESET, moveAccuracy, type AccuracyInput } from './index'

// B.6: per-move drops (mover POV win% points) for plies 1 to 29; plies alternate, White first.
const B6_DROPS = [
  0, 0, 0.46, 5.37, 0.27, 1.88, 2.78, 0, 9.81, 0.73, 0.64, 3.31, 2.48, 0.55, 1.84, 2.39, 5.2, 1.45, 1.72, 0, 1.43,
  2.15, 0, 50.14, 0, 0.65, 0.06, 3.8, 0,
]
// B.6: White win% (lichess curve, clamp +-1000) of positions 0 to 29.
const B6_WHITE_WIN = [
  52.39, 53.31, 52.67, 52.21, 57.58, 57.31, 59.19, 56.41, 55.86, 46.05, 46.78, 46.14, 49.45, 46.97, 47.52, 45.68,
  48.07, 42.87, 44.32, 42.6, 41.97, 40.54, 42.69, 42.78, 92.92, 93.15, 93.8, 93.74, 97.54, 97.54,
]

const b6Moves = (): AccuracyInput[] =>
  B6_DROPS.map((loss, i) => ({ color: i % 2 === 0 ? 'w' : 'b', loss }) satisfies AccuracyInput)

const within = (actual: number | undefined, expected: number, tolerance: number): void => {
  expect(actual).toBeDefined()
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(tolerance)
}

describe('moveAccuracy (R20)', () => {
  it('a move that lost nothing is exactly 100', () => {
    expect(moveAccuracy(0)).toBe(100)
  })

  it('follows clamp(103.1668 * exp(-0.06 * loss) - 3.1669 + 1, 0, 100) with the default preset', () => {
    for (const loss of [0.27, 1, 2.5, 5.37, 9.81, 20, 34.9]) {
      expect(moveAccuracy(loss)).toBeCloseTo(clamp(103.1668 * Math.exp(-0.06 * loss) - 3.1669 + 1, 0, 100), 8)
    }
  })

  it('is clamped to [0, 100] and never rises with the loss', () => {
    expect(moveAccuracy(100)).toBe(0)
    let prev = moveAccuracy(0)
    for (const loss of [0.01, 0.5, 1, 3, 8, 15, 30, 60, 100]) {
      const a = moveAccuracy(loss)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThanOrEqual(100)
      expect(a).toBeLessThanOrEqual(prev)
      prev = a
    }
  })

  it('uses the preset decay when one is given (lichess preset)', () => {
    const { decay } = LICHESS_PRESET.accuracy
    for (const loss of [1, 5, 12]) {
      expect(moveAccuracy(loss, LICHESS_PRESET.accuracy)).toBeCloseTo(
        clamp(103.1668 * Math.exp(-decay * loss) - 3.1669 + 1, 0, 100),
        8,
      )
    }
    expect(moveAccuracy(0, LICHESS_PRESET.accuracy)).toBe(100)
  })
})

describe('gameAccuracy: Appendix B.6 fixture', () => {
  it('shipped config (decay 0.06, harmonic mean of max(acc, 20)): White 89.0, Black 72.2 (tolerance 0.1)', () => {
    const acc = gameAccuracy(b6Moves())
    within(acc.white, 89.0, 0.1) // exact 89.02
    within(acc.black, 72.2, 0.1) // exact 72.16: Black's ply 24 drop of 50.14 is floored to 20
  })

  it('lichess preset with the White win% series: White 88.16, Black 54.22 (tolerance 0.1)', () => {
    const acc = gameAccuracy(b6Moves(), { preset: LICHESS_PRESET.accuracy, whiteWinSeries: B6_WHITE_WIN })
    within(acc.white, 88.16, 0.1)
    within(acc.black, 54.22, 0.1)
  })
})

describe('gameAccuracy: aggregation rules (R20)', () => {
  it('Book and Forced moves count as 100 whatever their loss', () => {
    const acc = gameAccuracy([
      { color: 'w', loss: 50, classification: 'book' },
      { color: 'w', loss: 30, classification: 'forced' },
      { color: 'b', loss: 40, classification: 'forced' },
      { color: 'b', loss: 25, classification: 'book' },
    ])
    expect(acc.white).toBeCloseTo(100, 8)
    expect(acc.black).toBeCloseTo(100, 8)
  })

  it('without a Book or Forced label the same large loss is floored at 20 and drags the mean down', () => {
    const acc = gameAccuracy([{ color: 'w', loss: 100 }])
    expect(acc.white).toBeCloseTo(20, 8)
  })

  it('a zero-loss move scores 100 and the aggregate is the harmonic mean of max(acc, 20)', () => {
    // moves with accuracy 100 (loss 0) and 0 (loss 100, floored to 20)
    const acc = gameAccuracy([
      { color: 'w', loss: 0 },
      { color: 'w', loss: 100 },
    ])
    expect(acc.white).toBeCloseTo(2 / (1 / 100 + 1 / 20), 8)
  })

  it('the two colours are aggregated separately', () => {
    const acc = gameAccuracy([
      { color: 'w', loss: 0 },
      { color: 'b', loss: 100 },
      { color: 'w', loss: 0 },
      { color: 'b', loss: 100 },
    ])
    expect(acc.white).toBeCloseTo(100, 8)
    expect(acc.black).toBeCloseTo(20, 8)
  })

  it('a colour with no moves has no accuracy', () => {
    const acc = gameAccuracy([{ color: 'w', loss: 1 }])
    expect(acc.white).toBeDefined()
    expect(acc.black).toBeUndefined()
  })

  it('plies marked notAnalysed are excluded (R20)', () => {
    const analysed: AccuracyInput[] = [
      { color: 'w', loss: 0 },
      { color: 'b', loss: 3 },
      { color: 'w', loss: 12 },
      { color: 'b', loss: 0 },
    ]
    const withGaps: AccuracyInput[] = [
      ...analysed,
      { color: 'w', loss: 100, notAnalysed: true },
      { color: 'b', loss: 100, notAnalysed: true },
    ]
    const expected = gameAccuracy(analysed)
    const actual = gameAccuracy(withGaps)
    expect(actual.white).toBeCloseTo(expected.white as number, 10)
    expect(actual.black).toBeCloseTo(expected.black as number, 10)
  })

  it('a colour whose plies are all notAnalysed has no accuracy', () => {
    const acc = gameAccuracy([
      { color: 'w', loss: 0 },
      { color: 'b', loss: 100, notAnalysed: true },
    ])
    expect(acc.white).toBeCloseTo(100, 8)
    expect(acc.black).toBeUndefined()
  })
})
