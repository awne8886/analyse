// B.10 summary sentence.
import { describe, expect, it } from 'vitest'
import { CLASSIFICATIONS, type Classification, type GameReview } from '../types/review'
import { summarySentence } from './index'

const counts = (c: Partial<Record<Classification, number>>): Record<Classification, number> =>
  Object.fromEntries(CLASSIFICATIONS.map((k) => [k, c[k] ?? 0])) as Record<Classification, number>

function review(
  accuracy: GameReview['accuracy'],
  white: Partial<Record<Classification, number>>,
  black: Partial<Record<Classification, number>> = {},
): GameReview {
  return {
    gameId: 'pgn:summary',
    schema: 1,
    engine: {
      name: 'Stockfish 19 Lite WASM',
      build: 'lite-single',
      tier: 'standard-16',
      depth: 16,
      multiPv: 2,
    },
    plies: [],
    complete: true,
    notAnalysed: [],
    accuracy,
    phaseAccuracy: { white: {}, black: {} },
    phaseStarts: {},
    tally: { white: counts(white), black: counts(black) },
    rating: { method: 'none' },
    keyMoments: [],
    summary: '',
    createdAt: 0,
  }
}

describe('summarySentence (B.10)', () => {
  it('lists the non-zero Brilliant, Great, Miss and Blunder counts in that order', () => {
    const r = review(
      { white: 85.04, black: 70 },
      { blunder: 1, brilliant: 1, miss: 2, best: 9, inaccuracy: 3 },
    )
    expect(summarySentence(r, 'w', 'impersonal')).toBe(
      'White played with 85.0% accuracy: 1 brilliant move, 2 misses, and 1 blunder.',
    )
    expect(summarySentence(r, 'w', 'personal')).toBe(
      'You played with 85.0% accuracy: 1 brilliant move, 2 misses, and 1 blunder.',
    )
  })

  it('joins two items with "and" and pluralises', () => {
    const r = review({ white: 60, black: 91.26 }, {}, { great: 2, blunder: 3 })
    expect(summarySentence(r, 'b', 'impersonal')).toBe(
      'Black played with 91.3% accuracy: 2 great moves and 3 blunders.',
    )
  })

  it('all four counts zero: "... and no blunders."', () => {
    const r = review({ white: 99.96, black: 72.16 }, { best: 20 }, { mistake: 4 })
    expect(summarySentence(r, 'b', 'impersonal')).toBe('Black played with 72.2% accuracy and no blunders.')
    expect(summarySentence(r, 'w', 'personal')).toBe('You played with 100.0% accuracy and no blunders.')
  })

  it('reads the user colour only', () => {
    const r = review({ white: 80, black: 80 }, { blunder: 1 }, { miss: 1 })
    expect(summarySentence(r, 'w', 'impersonal')).toBe('White played with 80.0% accuracy: 1 blunder.')
    expect(summarySentence(r, 'b', 'impersonal')).toBe('Black played with 80.0% accuracy: 1 miss.')
  })

  it('a side without analysed moves has no accuracy to report', () => {
    expect(summarySentence(review({}, {}), 'w', 'impersonal')).toBe('White has no analysed moves yet.')
    expect(summarySentence(review({}, {}), 'b', 'personal')).toBe('You have no analysed moves yet.')
  })
})
