// explain() fixtures with hand-written MoveFacts (PROMPT.md R24, R25, section 3.8, Appendix E.3 to E.7).
// Phase 0b: red against the stubs; these tests are the binding contract for impl-explain.
import { describe, expect, it } from 'vitest'
import type { Classification } from '../types/review'
import type { Explanation, MoveFacts, Voice } from '../types/explain'
import { explain } from './index'

/** Neutral facts: no proof of any kind holds, every score and win% is level, the depth gate is open. */
function facts(overrides: Partial<MoveFacts> = {}): MoveFacts {
  return {
    ply: 20,
    color: 'w',
    san: 'Nf3',
    uci: 'g1f3',
    piece: 'n',
    from: 'g1',
    to: 'f3',
    isCheck: false,
    isMate: false,
    isUserMove: true,
    classification: 'good',
    reasonCode: 'test',
    povBefore: { type: 'cp', value: 0 },
    povAfter: { type: 'cp', value: 0 },
    winBefore: 50,
    winAfter: 50,
    loss: 0,
    bestSan: 'Nc3',
    bestPv: ['Nc3'],
    bestMaterialGain: 0,
    playedPv: [],
    playedMaterialLoss: 0,
    replyIsMate: false,
    legalMoveCount: 30,
    motifsPlayed: [],
    motifsAllowed: [],
    motifsBest: [],
    depthReached: 18,
    depthTarget: 18,
    ...overrides,
  }
}

const VOICES: Voice[] = ['impersonal', 'personal']
const voiceFor = (v: Voice): Partial<MoveFacts> => ({ isUserMove: v === 'personal' })
const run = (f: MoveFacts, v: Voice): Explanation => explain(f, v)
const text = (e: Explanation): string => [e.headline, ...e.sentences, e.bestLine ?? ''].join(' ')

/** R25: the 11 headline suffixes, exactly. */
const HEADLINES: Array<[Classification, string]> = [
  ['brilliant', 'is brilliant'],
  ['great', 'is a great move'],
  ['best', 'is best'],
  ['excellent', 'is excellent'],
  ['good', 'is good'],
  ['book', 'is a book move'],
  ['inaccuracy', 'is an inaccuracy'],
  ['mistake', 'is a mistake'],
  ['miss', 'is a miss'],
  ['blunder', 'is a blunder'],
  ['forced', 'is forced'],
]

const NAJDORF = { eco: 'B90', name: 'Sicilian Defense: Najdorf Variation', isNewName: false }

/** Class-specific neutral overrides so that the hand-written facts are coherent (same win% bucket, no swing). */
const CLASS_BASE: Partial<Record<Classification, Partial<MoveFacts>>> = {
  blunder: { winBefore: 58, winAfter: 42, loss: 16 },
  mistake: { winBefore: 56, winAfter: 44, loss: 12 },
  inaccuracy: { winBefore: 54, winAfter: 46, loss: 8 },
  miss: { winBefore: 58, winAfter: 45, loss: 13 },
  good: { winBefore: 53, winAfter: 48, loss: 5 },
  book: { opening: NAJDORF },
  forced: { legalMoveCount: 1 },
}
const base = (classification: Classification, overrides: Partial<MoveFacts> = {}): MoveFacts =>
  facts({ classification, ...CLASS_BASE[classification], ...overrides })

/** Facts on which many proofs hold at once, to stress the 2-sentence cap and placeholder substitution. */
function rich(classification: Classification, overrides: Partial<MoveFacts> = {}): MoveFacts {
  return base(classification, {
    san: 'Qxf7+',
    uci: 'd5f7',
    piece: 'q',
    from: 'd5',
    to: 'f7',
    captured: 'p',
    isCheck: true,
    bestSan: 'Qh7#',
    bestPv: ['Qh7#'],
    bestLeadsToMateIn: 1,
    bestMaterialGain: 5,
    playedPv: ['Kxf7', 'Rf1+'],
    replySan: 'Kxf7',
    playedMaterialLoss: 5,
    replyIsMate: true,
    opponentMateIn: 2,
    winBefore: 85,
    winAfter: 15,
    loss: 70,
    gapToSecondBest: { winPct: 25, cp: 400 },
    motifsPlayed: [
      { type: 'fork', by: 'f7', targets: ['e8', 'h8'] },
      { type: 'sacrifice', square: 'f7', value: 9 },
    ],
    motifsAllowed: [
      { type: 'fork', by: 'f7', targets: ['d8', 'h8'] },
      { type: 'pin', absolute: true, by: 'b5', pinned: 'c6', to: 'e8' },
      { type: 'hangs', squares: ['f7'] },
    ],
    motifsBest: [
      { type: 'freePiece', square: 'f7' },
      { type: 'mateThreat', san: 'Qh7#' },
    ],
    previous: { classification: 'blunder', san: 'Nxe4', loss: 30, opponentGain: 3 },
    opening: { ...NAJDORF, isNewName: true },
    ...overrides,
  })
}

describe('explain: headlines (R25)', () => {
  it.each(HEADLINES)('%s -> "<SAN> %s", in both voices', (classification, suffix) => {
    for (const voice of VOICES) {
      const e = run(base(classification, { san: 'Nf3', ...voiceFor(voice) }), voice)
      expect(e.headline).toBe(`Nf3 ${suffix}`)
    }
  })

  it('keeps check and mate marks in the SAN of the headline', () => {
    expect(run(base('best', { san: 'Qxf7#', isMate: true, isCheck: true }), 'impersonal').headline).toBe(
      'Qxf7# is best',
    )
    expect(run(base('great', { san: 'Bb5+', isCheck: true }), 'personal').headline).toBe(
      'Bb5+ is a great move',
    )
  })
})

describe('explain: the E.5 fixtures', () => {
  it('blunder + replyIsMate + replySan Qxf7#: headline ends "is a blunder" and a sentence contains Qxf7#', () => {
    for (const voice of VOICES) {
      const e = run(
        base('blunder', { replyIsMate: true, replySan: 'Qxf7#', playedPv: ['Qxf7#'], ...voiceFor(voice) }),
        voice,
      )
      expect(e.headline.endsWith('is a blunder')).toBe(true)
      expect(e.sentences.some((s) => s.includes('Qxf7#'))).toBe(true)
    }
  })

  it('blunder + replyIsMate uses the HangsMate catalogue sentences (E.4 rule 1), per voice', () => {
    const impersonal = ['This hangs mate: Qxf7# is checkmate.', 'After this, Qxf7# ends the game.']
    const personal = ['Oh no, Qxf7# would be checkmate.', 'This walks into Qxf7#, checkmate.']
    for (let ply = 1; ply <= 8; ply++) {
      const f = base('blunder', { ply, replyIsMate: true, replySan: 'Qxf7#', playedPv: ['Qxf7#'] })
      expect(impersonal).toContain(run({ ...f, isUserMove: false }, 'impersonal').sentences[0])
      expect(personal).toContain(run({ ...f, isUserMove: true }, 'personal').sentences[0])
    }
  })

  it('miss + bestLeadsToMateIn 1 + bestSan Qh7#: a sentence contains "mate in one" and "Qh7#"', () => {
    for (const voice of VOICES) {
      const e = run(
        base('miss', { bestLeadsToMateIn: 1, bestSan: 'Qh7#', bestPv: ['Qh7#'], ...voiceFor(voice) }),
        voice,
      )
      expect(e.headline).toBe('Nf3 is a miss')
      expect(e.sentences.some((s) => s.includes('mate in one') && s.includes('Qh7#'))).toBe(true)
    }
  })

  it('miss + bestLeadsToMateIn 3 says "mate in 3" and names the move', () => {
    for (const voice of VOICES) {
      const e = run(
        base('miss', { bestLeadsToMateIn: 3, bestSan: 'Qh7+', bestPv: ['Qh7+'], ...voiceFor(voice) }),
        voice,
      )
      expect(e.sentences.some((s) => s.includes('mate in 3') && s.includes('Qh7+'))).toBe(true)
    }
  })

  it('book + Sicilian Najdorf B90: names the opening and uses no engine words', () => {
    for (const voice of VOICES) {
      const e = run(base('book', { san: 'a6', color: 'b', ...voiceFor(voice) }), voice)
      const all = text(e)
      expect(all).toContain('Sicilian Defense: Najdorf Variation')
      expect(all).toContain('B90')
      expect(all).toContain('A known opening move.')
      expect(all).not.toMatch(/best|engine|eval|mate/i)
      expect(e.bestLine).toBeUndefined()
      expect(e.sentences.length).toBeLessThanOrEqual(2)
    }
  })

  it('book: "This enters the <name>." appears only when the name changed on this move', () => {
    const fresh = run(base('book', { opening: { ...NAJDORF, isNewName: true } }), 'impersonal')
    expect(fresh.sentences.join(' ')).toContain(`This enters the ${NAJDORF.name}.`)
    const same = run(base('book', { opening: { ...NAJDORF, isNewName: false } }), 'impersonal')
    expect(same.sentences.join(' ')).not.toContain('This enters')
  })

  it('book stays free of engine words even when the facts carry mate and best-move data', () => {
    const e = run(
      base('book', { bestLeadsToMateIn: 2, bestSan: 'Qh7#', replyIsMate: true, replySan: 'Qxf7#' }),
      'impersonal',
    )
    expect(e.sentences.join(' ')).not.toMatch(/best|engine|eval|mate/i)
    expect(e.bestLine).toBeUndefined()
  })

  it('forced: the only legal move, no best line', () => {
    for (const voice of VOICES) {
      const e = run(base('forced', { san: 'Kg1', bestSan: 'Kg1', ...voiceFor(voice) }), voice)
      expect(e.headline).toBe('Kg1 is forced')
      expect(e.sentences).toEqual(['The only legal move.'])
      expect(e.bestLine).toBeUndefined()
    }
  })
})

/** E.4 generic sentences, with `Nc3` as the best move. [impersonal, personal] */
const GENERIC: Array<[Classification, string, string]> = [
  [
    'blunder',
    'A costly move; Nc3 kept everything under control.',
    'That one hurts: Nc3 was the move to play.',
  ],
  ['mistake', 'A clear step down from Nc3.', 'Not what the position asked for; Nc3 was clearly stronger.'],
  [
    'inaccuracy',
    'Slightly imprecise; Nc3 keeps more of the position.',
    'Playable, though Nc3 was the more accurate move.',
  ],
  ['miss', 'There was a winning move here: Nc3.', 'You had a winning move here: Nc3.'],
  ['good', 'A reasonable move, though Nc3 was stronger.', 'A fair move, though Nc3 was stronger.'],
  [
    'brilliant',
    'A hard-to-find sacrifice and the strongest move in the position.',
    'A hard-to-find sacrifice, and the strongest move you had.',
  ],
  [
    'great',
    'A great find that changes the course of the game.',
    'A great find; this move changes the course of the game.',
  ],
  ['best', 'The strongest move in the position.', 'The strongest move you had; well spotted.'],
]
const NEEDS_BEST = new Set<Classification>(['inaccuracy', 'mistake', 'blunder', 'miss', 'good'])

describe('explain: facts without proofs fall back to the generic sentence of the class (E.4)', () => {
  it.each(GENERIC)('%s: generic sentence', (classification, impersonal, personal) => {
    const imp = run(base(classification, { isUserMove: false }), 'impersonal')
    expect(imp.sentences).toEqual([impersonal])
    const per = run(base(classification, { isUserMove: true }), 'personal')
    expect(per.sentences).toEqual([personal])
  })

  it.each([...NEEDS_BEST])('%s: bestLine is "Best was <bestSan>"', (classification) => {
    for (const voice of VOICES) {
      const e = run(base(classification, { bestSan: 'Nc3', ...voiceFor(voice) }), voice)
      expect(e.bestLine).toBe('Best was Nc3')
    }
  })

  it.each(['brilliant', 'great', 'best', 'book', 'forced'] as Classification[])(
    '%s: never has a bestLine, even when bestSan differs from the played move',
    (classification) => {
      for (const voice of VOICES) {
        const e = run(base(classification, { bestSan: 'Nc3', ...voiceFor(voice) }), voice)
        expect(e.bestLine).toBeUndefined()
      }
    },
  )

  it('excellent: a bestLine only when a tactic description exists for the best move', () => {
    const plain = run(base('excellent'), 'impersonal')
    expect(plain.bestLine).toBeUndefined()
    const tactic = run(
      base('excellent', {
        bestMaterialGain: 3,
        motifsBest: [{ type: 'fork', by: 'c3', targets: ['d5', 'b5'] }],
      }),
      'impersonal',
    )
    expect(tactic.bestLine).toBe('Best was Nc3')
  })

  it('the generic rule always produces a non-empty sentence and a reason code, for every class', () => {
    for (const [classification] of HEADLINES) {
      for (const voice of VOICES) {
        const e = run(base(classification, voiceFor(voice)), voice)
        expect(e.sentences.length).toBeGreaterThanOrEqual(1)
        expect(e.sentences.every((s) => s.trim().length > 0)).toBe(true)
        expect(typeof e.reasonCode).toBe('string')
        expect(e.reasonCode.length).toBeGreaterThan(0)
        expect(Array.isArray(e.arrows)).toBe(true)
        expect(Array.isArray(e.highlights)).toBe(true)
      }
    }
  })
})

describe('explain: bestLine', () => {
  it.each(HEADLINES.map(([c]) => c))('%s: absent when bestSan equals the played san', (classification) => {
    for (const voice of VOICES) {
      const e = run(
        base(classification, { san: 'Nf3', bestSan: 'Nf3', bestPv: ['Nf3'], ...voiceFor(voice) }),
        voice,
      )
      expect(e.bestLine).toBeUndefined()
    }
  })

  it.each([...NEEDS_BEST])('%s: absent when there is no best move', (classification) => {
    const e = run(base(classification, { bestSan: null, bestPv: [] }), 'impersonal')
    expect(e.bestLine).toBeUndefined()
  })

  it('is kept when the proof sentence is used (the chip is separate from the sentences)', () => {
    const e = run(
      base('blunder', { replyIsMate: true, replySan: 'Qxf7#', playedPv: ['Qxf7#'], bestSan: 'Nd2' }),
      'impersonal',
    )
    expect(e.bestLine).toBe('Best was Nd2')
    expect(e.sentences.join(' ')).not.toContain('Best was')
  })
})

describe('explain: voice switching (R25)', () => {
  /** The E.7 swing sentences carry {Color}: "White"/"Black" impersonal, "You"/"you" personal. */
  const swingFacts = (color: 'w' | 'b', isUserMove: boolean) =>
    base('blunder', {
      color,
      isUserMove,
      replyIsMate: true,
      replySan: 'Qxf7#',
      playedPv: ['Qxf7#'],
      winBefore: 85,
      winAfter: 35,
    })

  it.each([
    ['w', 'White'],
    ['b', 'Black'],
  ] as const)('impersonal voice names %s as "%s", never "you"', (color, name) => {
    const e = run(swingFacts(color, false), 'impersonal')
    const body = e.sentences.join(' ')
    expect(body).toContain(name)
    expect(body).not.toMatch(/\byou(r|rs|rself)?\b/i)
  })

  it.each(['w', 'b'] as const)(
    'personal voice for the %s mover says "you", never White or Black',
    (color) => {
      const e = run(swingFacts(color, true), 'personal')
      const body = e.sentences.join(' ')
      expect(body).toMatch(/\byou\b/i)
      expect(body).not.toMatch(/\b(White|Black)\b/)
    },
  )

  it('a hanging-piece blunder switches between "your" and neutral wording', () => {
    const hang = (isUserMove: boolean) =>
      base('blunder', {
        isUserMove,
        motifsAllowed: [{ type: 'hangs', squares: ['f3'] }],
        replySan: 'Qxf3',
        playedPv: ['Qxf3', 'gxf3'],
        playedMaterialLoss: 3,
      })
    const personal = run(hang(true), 'personal')
    const impersonal = run(hang(false), 'impersonal')
    expect(
      personal.sentences.some((s) => /\byour\b/i.test(s) && s.includes('f3') && s.includes('Qxf3')),
    ).toBe(true)
    expect(impersonal.sentences.some((s) => s.includes('f3') && s.includes('Qxf3'))).toBe(true)
    expect(impersonal.sentences.join(' ')).not.toMatch(/\byour?\b/i)
    expect(personal.sentences.join(' ')).not.toBe(impersonal.sentences.join(' '))
  })

  it('the generic sentences differ between the two voices', () => {
    for (const [classification] of GENERIC) {
      const imp = run(base(classification, { isUserMove: false }), 'impersonal')
      const per = run(base(classification, { isUserMove: true }), 'personal')
      expect(per.sentences[0]).not.toBe(imp.sentences[0])
    }
  })

  it('the headline does not depend on the voice', () => {
    for (const [classification] of HEADLINES) {
      expect(run(base(classification, { isUserMove: true }), 'personal').headline).toBe(
        run(base(classification, { isUserMove: false }), 'impersonal').headline,
      )
    }
  })
})

describe('explain: other proof rules from E.4', () => {
  it('blunder + opponentMateIn 3 (no mate before): names the reply and "mate in 3"', () => {
    for (const voice of VOICES) {
      const e = run(
        base('blunder', { opponentMateIn: 3, replySan: 'Qxf7+', playedPv: ['Qxf7+'], ...voiceFor(voice) }),
        voice,
      )
      expect(e.sentences.some((s) => s.includes('Qxf7+') && /mate in 3|checkmate in 3/.test(s))).toBe(true)
    }
  })

  it('blunder + best leads to mate in 2 and the played move is no mate: "mate in 2" and the best move', () => {
    for (const voice of VOICES) {
      const e = run(
        base('blunder', { bestLeadsToMateIn: 2, bestSan: 'Qh7+', bestPv: ['Qh7+'], ...voiceFor(voice) }),
        voice,
      )
      expect(e.sentences.some((s) => s.includes('Qh7+') && s.includes('mate in 2'))).toBe(true)
    }
  })

  it('brilliant sacrifice that forces mate: mentions "mate in 3" and the square', () => {
    for (const voice of VOICES) {
      const e = run(
        base('brilliant', {
          bestLeadsToMateIn: 3,
          motifsPlayed: [{ type: 'sacrifice', square: 'f3', value: 3 }],
          ...voiceFor(voice),
        }),
        voice,
      )
      expect(e.sentences.some((s) => s.includes('mate in 3') && s.includes('f3'))).toBe(true)
    }
  })

  it('great move with a clear gap to the second best: says it was the only move', () => {
    for (const voice of VOICES) {
      const e = run(base('great', { gapToSecondBest: { winPct: 25, cp: 400 }, ...voiceFor(voice) }), voice)
      expect(e.sentences[0]).toMatch(/\bonly\b/i)
    }
  })

  it('best move that checkmates: "Checkmate."', () => {
    const imp = run(
      base('best', { san: 'Qxf7#', isMate: true, isCheck: true, isUserMove: false }),
      'impersonal',
    )
    expect(imp.sentences).toEqual(['Checkmate. Game over.'])
    const per = run(base('best', { san: 'Qxf7#', isMate: true, isCheck: true, isUserMove: true }), 'personal')
    expect(per.sentences).toEqual(['Checkmate. Well played.'])
  })

  it('best move that keeps the mating attack on track: "mate in 2"', () => {
    for (const voice of VOICES) {
      const e = run(base('best', { mateBefore: 3, mateAfter: 2, bestSan: 'Nf3', ...voiceFor(voice) }), voice)
      expect(e.sentences[0]).toContain('mate in 2')
    }
  })
})

describe('explain: eval-swing second sentence (E.7)', () => {
  const color = (c: 'w' | 'b') => (c === 'w' ? 'White' : 'Black')
  // [winBefore, winAfter, sentence with {C} for the colour]
  const WORSENING: Array<[number, number, string]> = [
    [85, 65, '{C} was winning; the game is now much closer.'],
    [85, 50, '{C} was winning; the game is now much closer.'],
    [85, 35, '{C} was winning and is now the side under pressure.'],
    [85, 15, '{C} was winning and is now the side under pressure.'],
    [70, 50, 'The edge {C} held is gone; the position is roughly level.'],
    [70, 30, '{C} has gone from better to worse in one move.'],
    [70, 10, '{C} has gone from better to worse in one move.'],
    [50, 30, 'From a level game, {C} is now the side with problems.'],
    [50, 10, 'From a level game, {C} has slipped into a lost position.'],
    [30, 10, '{C} was already worse; now the position is lost.'],
  ]
  const IMPROVING: Array<[number, number, string]> = [
    [30, 50, '{C} has climbed back to a level game.'],
    [50, 70, '{C} now holds the upper hand.'],
    [70, 85, 'The advantage {C} held has grown into a winning one.'],
  ]

  it.each(WORSENING)(
    'blunder %i -> %i: the second sentence is the E.7 swing (impersonal)',
    (before, after, tpl) => {
      for (const c of ['w', 'b'] as const) {
        const e = run(
          base('blunder', {
            color: c,
            isUserMove: false,
            replyIsMate: true,
            replySan: 'Qxf7#',
            playedPv: ['Qxf7#'],
            winBefore: before,
            winAfter: after,
          }),
          'impersonal',
        )
        expect(e.sentences).toHaveLength(2)
        expect(e.sentences[1]).toBe(tpl.replace('{C}', color(c)))
      }
    },
  )

  it.each(WORSENING)('blunder %i -> %i: the personal swing sentence speaks to "you"', (before, after) => {
    const e = run(
      base('blunder', {
        isUserMove: true,
        replyIsMate: true,
        replySan: 'Qxf7#',
        playedPv: ['Qxf7#'],
        winBefore: before,
        winAfter: after,
      }),
      'personal',
    )
    expect(e.sentences).toHaveLength(2)
    expect(e.sentences[1]).toMatch(/\byou\b/i)
    expect(e.sentences[1]).not.toMatch(/\b(White|Black)\b/)
  })

  it.each(IMPROVING)(
    'best %i -> %i: the swing sentence is added in the other direction',
    (before, after, tpl) => {
      const e = run(base('best', { isUserMove: false, winBefore: before, winAfter: after }), 'impersonal')
      expect(e.sentences).toHaveLength(2)
      expect(e.sentences[1]).toBe(tpl.replace('{C}', 'White'))
    },
  )

  it('a blunder with no other proof can be explained by the swing alone (never more than 2 sentences)', () => {
    const e = run(base('blunder', { isUserMove: false, winBefore: 85, winAfter: 35 }), 'impersonal')
    expect(e.sentences.length).toBeLessThanOrEqual(2)
    expect(e.sentences).toContain('White was winning and is now the side under pressure.')
  })

  it('no bucket boundary crossed: no second sentence', () => {
    for (const [classification] of GENERIC) {
      const e = run(base(classification), 'impersonal')
      expect(e.sentences).toHaveLength(1)
    }
  })
})

describe('explain: at most 2 sentences, no unresolved placeholders', () => {
  it.each(HEADLINES.map(([c]) => c))('%s with many proofs at once', (classification) => {
    for (const voice of VOICES) {
      for (const ply of [1, 2, 3, 4, 17, 40]) {
        const e = run(rich(classification, { ply, ...voiceFor(voice) }), voice)
        expect(e.sentences.length).toBeGreaterThanOrEqual(1)
        expect(e.sentences.length).toBeLessThanOrEqual(2)
        expect(text(e)).not.toMatch(/undefined|null|NaN|\{|\}|\[object/)
        expect(e.sentences.every((s) => s.trim().length > 0)).toBe(true)
      }
    }
  })

  it('every sentence of a rich blunder, mistake or inaccuracy never calls the move something else', () => {
    for (const [classification, word] of [
      ['blunder', /\b(brilliant|great move|excellent)\b/i],
      ['mistake', /\b(brilliant|great move|excellent|blunder)\b/i],
      ['inaccuracy', /\b(brilliant|great move|excellent|blunder)\b/i],
    ] as const) {
      for (const voice of VOICES) {
        const e = run(rich(classification, voiceFor(voice)), voice)
        expect(e.sentences.join(' ')).not.toMatch(word)
      }
    }
  })
})

describe('explain: a Blunder never yields a sentence containing "wins"', () => {
  // The E.4 HangsPiece impersonal variant ("simply wins it") is deliberately not part of this set: see the report notes.
  const BLUNDERS: Array<[string, Partial<MoveFacts>]> = [
    ['hangs mate', { replyIsMate: true, replySan: 'Qxf7#', playedPv: ['Qxf7#'] }],
    ['gets mated', { opponentMateIn: 3, replySan: 'Qxf7+', playedPv: ['Qxf7+'] }],
    [
      'permits a fork',
      {
        motifsAllowed: [{ type: 'fork', by: 'e5', targets: ['c4', 'g4'] }],
        replySan: 'Ne5',
        playedPv: ['Ne5', 'Bd6'],
        playedMaterialLoss: 3,
      },
    ],
    [
      'permits a pin',
      {
        motifsAllowed: [{ type: 'pin', absolute: false, by: 'b5', pinned: 'c6', to: 'e8' }],
        replySan: 'Bb5',
        playedPv: ['Bb5', 'a6'],
        playedMaterialLoss: 3,
      },
    ],
    [
      'allows a discovered attack',
      {
        motifsAllowed: [{ type: 'discoveredAttack', target: 'd8', by: ['d1'] }],
        replySan: 'Nc5',
        playedPv: ['Nc5'],
        playedMaterialLoss: 5,
      },
    ],
    ['loses material', { replySan: 'Qxf3', playedPv: ['Qxf3', 'gxf3'], playedMaterialLoss: 3 }],
    ['misses a mate', { bestLeadsToMateIn: 2, bestSan: 'Qh7+' }],
    ['misses a win', { bestMaterialGain: 5, bestSan: 'Qxd8+', winBefore: 90, winAfter: 55 }],
    ['eval swing', { winBefore: 85, winAfter: 35 }],
    ['generic', {}],
  ]

  it.each(BLUNDERS)('%s', (_name, overrides) => {
    for (const voice of VOICES) {
      for (const ply of [1, 2, 3, 4, 5, 6]) {
        const e = run(base('blunder', { ply, ...overrides, ...voiceFor(voice) }), voice)
        for (const s of e.sentences) expect(s).not.toMatch(/wins/i)
      }
    }
  })

  it('also holds for the facts with many proofs at once', () => {
    for (const voice of VOICES) {
      for (let ply = 1; ply <= 6; ply++) {
        const e = run(rich('blunder', { ply, ...voiceFor(voice) }), voice)
        for (const s of e.sentences) expect(s).not.toMatch(/wins/i)
      }
    }
  })
})

describe('explain: determinism and seeded variants (seededIndex = ply % n)', () => {
  it('the same facts twice give identical output, for every class and voice', () => {
    for (const [classification] of HEADLINES) {
      for (const voice of VOICES) {
        const f = rich(classification, voiceFor(voice))
        expect(run(f, voice)).toEqual(run(f, voice))
        const g = base(classification, voiceFor(voice))
        expect(run(g, voice)).toEqual(run(g, voice))
      }
    }
  })

  it('does not mutate the facts', () => {
    const f = rich('blunder')
    const copy = structuredClone(f)
    run(f, 'personal')
    run(f, 'impersonal')
    expect(f).toEqual(copy)
  })

  it('the variant depends only on ply modulo the variant count: ply and ply + 60 agree', () => {
    // 60 is a multiple of every variant count from 1 to 6. The HangsMate sentences carry no move number.
    for (const voice of VOICES) {
      for (let ply = 1; ply <= 12; ply++) {
        const mk = (p: number) =>
          base('blunder', {
            ply: p,
            replyIsMate: true,
            replySan: 'Qxf7#',
            playedPv: ['Qxf7#'],
            ...voiceFor(voice),
          })
        const a = run(mk(ply), voice)
        const b = run(mk(ply + 60), voice)
        expect(b.sentences).toEqual(a.sentences)
        expect(b.reasonCode).toBe(a.reasonCode)
      }
    }
  })

  it('plies of different parity are each stable and stay inside the catalogue', () => {
    const catalogue = [
      'This hangs mate: Qxf7# is checkmate.',
      'After this, Qxf7# ends the game.',
      'Oh no, Qxf7# would be checkmate.',
      'This walks into Qxf7#, checkmate.',
    ]
    for (const voice of VOICES) {
      for (const ply of [10, 11]) {
        const f = base('blunder', {
          ply,
          replyIsMate: true,
          replySan: 'Qxf7#',
          playedPv: ['Qxf7#'],
          ...voiceFor(voice),
        })
        const first = run(f, voice)
        expect(run(f, voice)).toEqual(first)
        expect(catalogue).toContain(first.sentences[0])
      }
    }
  })
})

describe('explain: depth gate (section 3.8, depthReached >= min(depthTarget, 14))', () => {
  const GATE: Array<[number, number, boolean]> = [
    [10, 16, false],
    [13, 16, false],
    [14, 16, true],
    [14, 20, true],
    [18, 18, true],
    [10, 10, true],
    [12, 12, true],
    [11, 12, false],
  ]
  const generic = (voice: Voice) =>
    voice === 'personal'
      ? 'That one hurts: Nc3 was the move to play.'
      : 'A costly move; Nc3 kept everything under control.'

  it.each(GATE)(
    'replyIsMate with depthReached %i / depthTarget %i: tactical proof used = %s',
    (reached, target, used) => {
      for (const voice of VOICES) {
        const e = run(
          base('blunder', {
            replyIsMate: true,
            replySan: 'Qxf7#',
            playedPv: ['Qxf7#'],
            depthReached: reached,
            depthTarget: target,
            ...voiceFor(voice),
          }),
          voice,
        )
        if (used) {
          expect(e.sentences.some((s) => s.includes('Qxf7#'))).toBe(true)
        } else {
          expect(e.sentences).toEqual([generic(voice)])
          expect(e.bestLine).toBe('Best was Nc3')
        }
      }
    },
  )

  it('below the gate every tactical blunder rule is skipped: only the generic sentence and the Best-was line', () => {
    const tactical: Array<Partial<MoveFacts>> = [
      { replyIsMate: true, replySan: 'Qxf7#', playedPv: ['Qxf7#'] },
      { opponentMateIn: 3, replySan: 'Qxf7+', playedPv: ['Qxf7+'] },
      {
        motifsAllowed: [{ type: 'fork', by: 'e5', targets: ['c4', 'g4'] }],
        replySan: 'Ne5',
        playedPv: ['Ne5', 'Bd6'],
        playedMaterialLoss: 3,
      },
      {
        motifsAllowed: [{ type: 'hangs', squares: ['f3'] }],
        replySan: 'Qxf3',
        playedPv: ['Qxf3'],
        playedMaterialLoss: 3,
      },
      { replySan: 'Qxf3', playedPv: ['Qxf3', 'gxf3'], playedMaterialLoss: 3 },
      { bestLeadsToMateIn: 2, bestSan: 'Nc3' },
      { bestMaterialGain: 5 },
    ]
    for (const overrides of tactical) {
      for (const voice of VOICES) {
        const e = run(
          base('blunder', {
            ...overrides,
            bestSan: 'Nc3',
            depthReached: 10,
            depthTarget: 16,
            ...voiceFor(voice),
          }),
          voice,
        )
        expect(e.sentences).toEqual([generic(voice)])
        expect(e.bestLine).toBe('Best was Nc3')
      }
    }
  })

  it('a miss with a forced mate below the gate falls back to the generic sentence plus the Best-was line', () => {
    for (const voice of VOICES) {
      const e = run(
        base('miss', {
          bestLeadsToMateIn: 1,
          bestSan: 'Qh7#',
          bestPv: ['Qh7#'],
          depthReached: 10,
          depthTarget: 16,
          ...voiceFor(voice),
        }),
        voice,
      )
      expect(e.sentences.join(' ')).not.toMatch(/mate in/i)
      expect(e.sentences).toHaveLength(1)
      expect(e.bestLine).toBe('Best was Qh7#')
    }
  })

  it('book and forced explanations need no depth', () => {
    for (const voice of VOICES) {
      const book = run(base('book', { depthReached: 1, depthTarget: 16, ...voiceFor(voice) }), voice)
      expect(book.sentences.join(' ')).toContain(NAJDORF.name)
      const forced = run(base('forced', { depthReached: 1, depthTarget: 16, ...voiceFor(voice) }), voice)
      expect(forced.sentences).toEqual(['The only legal move.'])
    }
  })
})
