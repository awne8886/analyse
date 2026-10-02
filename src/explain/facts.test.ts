// buildMoveFacts on hand-built GameReview objects (PROMPT.md Appendix E.1, E.2; docs/notes/contracts.md section 3).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Score } from '../types/engine'

const opening = vi.hoisted(() => ({
  lookup: vi.fn<(epd: string) => { eco: string; name: string } | undefined>(),
}))
vi.mock('../analysis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../analysis')>()
  const K = actual.REVIEW_CONFIG.winCurveK
  return {
    ...actual,
    // Test-local B.2 curve: src/analysis owns the real one.
    winPct: (s: Score) =>
      s.type === 'mate'
        ? s.value > 0
          ? 100
          : 0
        : 50 + 50 * (2 / (1 + Math.exp(-K * Math.max(-1000, Math.min(1000, s.value)))) - 1),
    lookupOpening: (epd: string) => opening.lookup(epd),
  }
})

import { materialAlong } from './facts'
import { buildMoveFacts, explain } from './index'
import { makeReview } from './test-helpers'

const START_EPD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'
const E4_EPD = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -'

beforeEach(() => {
  opening.lookup.mockReset()
  opening.lookup.mockImplementation(() => {
    throw new Error('not implemented') // what the Phase 0 stub does
  })
})

describe('buildMoveFacts: hangs mate (Scholar mate)', () => {
  const review = makeReview([
    { san: 'e4' },
    { san: 'e5' },
    { san: 'Qh5' },
    { san: 'Nc6' },
    { san: 'Bc4' },
    {
      san: 'Nf6',
      classification: 'blunder',
      evalBefore: { type: 'cp', value: 60 },
      evalAfter: { type: 'mate', value: 1 },
      winBefore: 44,
      winAfter: 0,
      loss: 44,
      bestPv: ['d8e7', 'g1f3'],
    },
    { san: 'Qxf7#' },
  ])

  it('reads the reply from the next ply, converts the scores to the mover and runs the detectors', () => {
    const f = buildMoveFacts(review, 6, 'b')
    expect(f).toMatchObject({
      ply: 6,
      color: 'b',
      san: 'Nf6',
      uci: 'g8f6',
      piece: 'n',
      from: 'g8',
      to: 'f6',
      isCheck: false,
      isMate: false,
      isUserMove: true,
      classification: 'blunder',
      povBefore: { type: 'cp', value: -60 },
      povAfter: { type: 'mate', value: -1 },
      mateAfter: -1,
      opponentMateIn: 1,
      bestSan: 'Qe7',
      bestPv: ['Qe7', 'Nf3'],
      playedPv: ['Qxf7#'],
      replySan: 'Qxf7#',
      replyIsMate: true,
      depthReached: 18,
      depthTarget: 18,
      fenBefore: review.plies[5].before,
      fenAfter: review.plies[5].after,
    })
    expect(f.mateBefore).toBeUndefined()
    expect(f.bestLeadsToMateIn).toBeUndefined()
    expect(f.previous).toMatchObject({ classification: 'best', san: 'Bc4' })
    expect(f.opening).toBeUndefined() // lookupOpening throws in this worktree: tolerated as "no opening"
  })

  it('explains it as HangsMate with the reply arrow and the best line', () => {
    const e = explain(buildMoveFacts(review, 6, 'b'), 'personal')
    expect(e.headline).toBe('Nf6 is a blunder')
    expect(e.reasonCode).toBe('HangsMate')
    expect(e.sentences[0]).toBe('Oh no, Qxf7# would be checkmate.')
    expect(e.sentences[1]).toBe('From a level game, you have slipped into a lost position.')
    expect(e.bestLine).toBe('Best was Qe7')
    expect(e.arrows).toEqual([
      { from: 'g8', to: 'f6', kind: 'played' },
      { from: 'h5', to: 'f7', kind: 'reply' },
    ])
  })

  it('the mating move itself is a checkmate (last ply, no played line)', () => {
    const f = buildMoveFacts(review, 7, 'b')
    expect(f).toMatchObject({
      isMate: true,
      isCheck: true,
      isUserMove: false,
      playedPv: [],
      replyIsMate: false,
    })
    const e = explain(f, 'impersonal')
    expect(e.reasonCode).toBe('Checkmate')
    expect(e.sentences).toEqual(['Checkmate ends the game.'])
  })
})

describe('buildMoveFacts: a knight fork', () => {
  const review = makeReview(
    [
      { san: 'Nc7+', bestPv: ['b5c7', 'e8d7', 'c7a8', 'd7c6'] },
      { san: 'Kd7', bestPv: ['e8d7', 'c7a8', 'd7c6'] },
    ],
    { startFen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1' },
  )

  it('records the fork, the PV material and the played line', () => {
    const f = buildMoveFacts(review, 1, 'w')
    expect(f.motifsPlayed).toContainEqual({ type: 'fork', by: 'c7', targets: ['a8', 'e8'] })
    expect(f.bestPv).toEqual(['Nc7+', 'Kd7', 'Nxa8', 'Kc6'])
    expect(f.bestMaterialGain).toBe(5)
    expect(f.playedPv).toEqual(['Kd7', 'Nxa8', 'Kc6'])
    expect(f.playedMaterialLoss).toBe(-5)
    expect(f.legalMoveCount).toBeGreaterThan(1)
  })

  it('explains the best move with the fork it creates', () => {
    const e = explain(buildMoveFacts(review, 1, 'w'), 'impersonal')
    expect(e.reasonCode).toBe('Fork|Pin|Skewer|Discovered')
    expect(e.sentences[0]).toContain('forking the rook and king')
    expect(e.highlights).toEqual(['c7', 'a8', 'e8'])
  })

  it('a PV that ends on a capture does not count that capture as a gain', () => {
    const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1'
    expect(materialAlong(fen, ['Nc7+', 'Kd7', 'Nxa8'], 'w', 'gain').net).toBe(0)
    expect(materialAlong(fen, ['Nc7+', 'Kd7', 'Nxa8', 'Kc6'], 'w', 'gain')).toMatchObject({
      net: 5,
      gained: ['r'],
      lost: [],
      captures: 1,
    })
    // Measured as a loss for Black, the unanswered final capture is not counted either (no unproven loss claims);
    // measured as a gain for Black it is kept, so a "wins" claim is never overstated.
    expect(materialAlong(fen, ['Nc7+', 'Kd7', 'Nxa8'], 'b', 'loss').net).toBe(0)
    expect(materialAlong(fen, ['Nc7+', 'Kd7', 'Nxa8'], 'b', 'gain').net).toBe(-5)
  })
})

describe('buildMoveFacts: a hanging bishop', () => {
  const review = makeReview([
    { san: 'e4' },
    { san: 'e5' },
    { san: 'Ba6', classification: 'blunder', winBefore: 55, winAfter: 20, loss: 35, bestPv: ['g1f3'] },
    { san: 'bxa6', bestPv: ['b7a6', 'g1f3'] },
    { san: 'Nf3' },
  ])

  it('lists the newly hanging bishop and the material lost along the played line', () => {
    const f = buildMoveFacts(review, 3, 'w')
    expect(f.motifsAllowed).toContainEqual({ type: 'hangs', squares: ['a6'] })
    expect(f.replySan).toBe('bxa6')
    expect(f.playedPv).toEqual(['bxa6', 'Nf3'])
    expect(f.playedMaterialLoss).toBe(3)
  })

  it('explains it as HangsPiece in both voices', () => {
    const f = buildMoveFacts(review, 3, 'w')
    const imp = explain({ ...f, isUserMove: false }, 'impersonal')
    expect(imp.reasonCode).toBe('HangsPiece')
    expect(imp.sentences).toEqual([
      'The bishop on a6 is left loose, and bxa6 picks it off.',
      'From a level game, White has slipped into a lost position.',
    ])
    expect(imp.highlights).toEqual(['a6'])
    expect(imp.bestLine).toBe('Best was Nf3')
    const per = explain(f, 'personal')
    expect(per.sentences[0]).toBe('Your bishop on a6 is left loose, and bxa6 picks it off.')
  })
})

describe('buildMoveFacts: recapture, previous move and castling rights', () => {
  it('Qxd5 takes back on the square the opponent just captured on', () => {
    const review = makeReview([{ san: 'e4' }, { san: 'd5' }, { san: 'exd5' }, { san: 'Qxd5' }])
    const f = buildMoveFacts(review, 4, 'w')
    expect(f.captured).toBe('p')
    expect(f.motifsPlayed).toContainEqual({ type: 'recapture' })
    expect(f.previous).toEqual({ classification: 'best', san: 'exd5', loss: 0, opponentGain: 0 })
    const e = explain(f, 'impersonal')
    expect(e.reasonCode).toBe('Recapture')
    expect(e.sentences).toEqual(['Takes back the pawn.'])
  })

  it('Ke2 gives up castling; a Mistake says so', () => {
    const review = makeReview([
      { san: 'e4' },
      { san: 'e5' },
      { san: 'Ke2', classification: 'mistake', winBefore: 56, winAfter: 44, loss: 12, bestPv: ['g1f3'] },
    ])
    const f = buildMoveFacts(review, 3, 'w')
    const e = explain(f, 'personal')
    expect(e.reasonCode).toBe('LosesCastling')
    expect(e.sentences).toEqual(['This costs you the right to castle.'])
  })

  it('develops and castling motifs', () => {
    const review = makeReview([
      { san: 'e4' },
      { san: 'e5' },
      { san: 'Nf3' },
      { san: 'Nc6' },
      { san: 'Bc4' },
      { san: 'Bc5' },
      { san: 'O-O' },
    ])
    expect(buildMoveFacts(review, 3, 'w').motifsPlayed).toContainEqual({ type: 'develops' })
    expect(buildMoveFacts(review, 7, 'w').motifsPlayed).toContainEqual({ type: 'castleKing' })
  })
})

describe('buildMoveFacts: data sources', () => {
  it('gapToSecondBest compares the first and second line from the mover POV', () => {
    const review = makeReview([
      { san: 'e4' },
      {
        san: 'e5',
        evalBefore: { type: 'cp', value: -80 },
        secondLine: { multipv: 2, depth: 18, score: { type: 'cp', value: 250 }, pv: ['c7c5'] },
        depth: 12,
      },
    ])
    const f = buildMoveFacts(review, 2, 'w')
    expect(f.povBefore).toEqual({ type: 'cp', value: 80 })
    expect(f.gapToSecondBest?.cp).toBe(330)
    expect(f.gapToSecondBest?.winPct).toBeCloseTo(28.83, 1) // B.2 curve: 57.35 - 28.52
    expect(f.isUserMove).toBe(false)
    expect(f.depthReached).toBe(12)
  })

  it('the last ply reads its played line from playedLine.pv.slice(1)', () => {
    const review = makeReview([
      {
        san: 'e4',
        playedLine: { multipv: 1, depth: 18, score: { type: 'cp', value: 30 }, pv: ['e2e4', 'e7e5', 'g1f3'] },
      },
    ])
    const f = buildMoveFacts(review, 1, 'w')
    expect(f.playedPv).toEqual(['e5', 'Nf3'])
    expect(f.replySan).toBe('e5')
  })

  it('opening via lookupOpening: name, ECO and whether the name changed on this move', () => {
    opening.lookup.mockImplementation((epd) =>
      epd === E4_EPD
        ? { eco: 'B00', name: "King's Pawn Opening" }
        : epd === START_EPD
          ? undefined
          : undefined,
    )
    const review = makeReview([{ san: 'e4', classification: 'book' }])
    const f = buildMoveFacts(review, 1, 'w')
    expect(f.opening).toEqual({ eco: 'B00', name: "King's Pawn Opening", isNewName: true })
    expect(opening.lookup).toHaveBeenCalledWith(E4_EPD)
    const e = explain(f, 'impersonal')
    expect(e.sentences).toEqual([
      "A known opening move. The game follows the King's Pawn Opening (B00).",
      "This enters the King's Pawn Opening.",
    ])
  })

  it('throws for a ply that is not in the review', () => {
    expect(() => buildMoveFacts(makeReview([{ san: 'e4' }]), 5, 'w')).toThrow(/no ply 5/)
  })
})
