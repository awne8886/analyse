// R21 and Appendix B.9: estimated game rating.
import { describe, expect, it } from 'vitest'
import { clamp, estimateRating, REVIEW_CONFIG } from './index'

const round50 = (x: number): number => Math.round(x / 50) * 50

describe('estimateRating (R21, B.9)', () => {
  it('rating 1500 with accuracy 80 gives 1750 (regression)', () => {
    const r = estimateRating({ rating: 1500, accuracy: 80, acpl: 25, moveCount: 30 })
    expect(r.method).toBe('regression')
    expect(r.value).toBe(1750)
  })

  it('is round50(clamp(-1613.3 + 0.72597 * rating + 28.179 * accuracy, 100, 3200))', () => {
    const { a, b, c } = REVIEW_CONFIG.rating
    for (const [rating, accuracy] of [
      [800, 55],
      [1200, 71.3],
      [1850, 88.8],
      [2400, 93.4],
    ] as const) {
      const r = estimateRating({ rating, accuracy, acpl: 40, moveCount: 25 })
      expect(r.method).toBe('regression')
      expect(r.value).toBe(round50(clamp(a + b * rating + c * accuracy, 100, 3200)))
      expect((r.value as number) % 50).toBe(0)
    }
  })

  it('clamps the regression to 100 at the bottom and 3200 at the top', () => {
    expect(estimateRating({ rating: 100, accuracy: 0, acpl: 500, moveCount: 20 }).value).toBe(100)
    expect(estimateRating({ rating: 3000, accuracy: 100, acpl: 0, moveCount: 60 }).value).toBe(3200)
  })

  it('the regression ignores ACPL', () => {
    const lo = estimateRating({ rating: 1500, accuracy: 80, acpl: 5, moveCount: 30 })
    const hi = estimateRating({ rating: 1500, accuracy: 80, acpl: 400, moveCount: 30 })
    expect(lo.value).toBe(hi.value)
  })

  it('fewer than 10 moves by the side gives method none and no value', () => {
    const r = estimateRating({ rating: 1500, accuracy: 80, acpl: 25, moveCount: 9 })
    expect(r.method).toBe('none')
    expect(r.value).toBeUndefined()
    const noRating = estimateRating({ accuracy: 80, acpl: 25, moveCount: 9 })
    expect(noRating.method).toBe('none')
    expect(noRating.value).toBeUndefined()
  })

  it('exactly 10 moves is enough', () => {
    expect(estimateRating({ rating: 1500, accuracy: 80, acpl: 25, moveCount: 10 }).method).toBe('regression')
    expect(estimateRating({ accuracy: 80, acpl: 25, moveCount: 10 }).method).toBe('acpl')
  })

  it('without the side own rating the ACPL fallback 3100 * exp(-0.01 * ACPL) is used (rough estimate)', () => {
    // B.9 gives round50 only for the regression; the fallback is stated as 3100 * exp(-0.01 * ACPL) and is not
    // rounded here.
    for (const acpl of [0, 12.5, 30, 80, 150]) {
      const r = estimateRating({ accuracy: 70, acpl, moveCount: 30 })
      expect(r.method).toBe('acpl')
      expect(r.value).toBeCloseTo(3100 * Math.exp(-0.01 * acpl), 6)
    }
  })

  it('the ACPL fallback ignores the accuracy and falls in a plausible range', () => {
    const a = estimateRating({ accuracy: 40, acpl: 30, moveCount: 30 })
    const b = estimateRating({ accuracy: 99, acpl: 30, moveCount: 30 })
    expect(a.value).toBe(b.value)
    expect(a.value as number).toBeGreaterThan(100)
    expect(a.value as number).toBeLessThanOrEqual(3200)
  })
})
