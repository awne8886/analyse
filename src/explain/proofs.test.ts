// Regression tests for the explanation proof gaps of docs/review/correctness.md (H2, H3, M1, M2, L1, L5 to L9):
// a sentence claims material, mate or a tactic only when the engine line proves it, and quotes exactly the plies the
// claim was counted on (R24, E.2, E.3, E.6).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import type { MoveFacts } from '../types/explain'
import { materialAlong } from './facts'
import { buildMoveFacts, explain } from './index'
import { makeReview, moveFacts } from './test-helpers'

const CLAIMS =
  /\b(wins?|won|ahead|nets|loses|lose|costs|drops|gives up|forking|pinning|skewering|uncovering)\b/i
const sentences = (f: MoveFacts) =>
  (['personal', 'impersonal'] as const).flatMap(
    (v) => explain({ ...f, isUserMove: v === 'personal' }, v).sentences,
  )

describe('H2: an unanswered final capture by the mover is not a gain', () => {
  // 1.Ke2 (not the engine's choice) Ke7 2.Rd1 Ke6 3.Rxd5: the PV ends on Rxd5 before Nxd5 or Kxd5 can answer it.
  const review = makeReview(
    [
      { san: 'Ke2', classification: 'excellent', bestPv: ['a1a7'], loss: 1 },
      { san: 'Ke7', bestPv: ['e8e7', 'a1d1', 'e7e6', 'd1d5'] },
    ],
    { startFen: '4k3/8/1n6/3p4/8/8/8/R3K3 w - - 0 1' },
  )

  it('the loss measure keeps the final capture, the gain measure drops it', () => {
    const f = buildMoveFacts(review, 1, 'w')
    expect(f.playedPv).toEqual(['Ke7', 'Rd1', 'Ke6', 'Rxd5'])
    expect(f.playedMaterialLoss).toBe(-1)
    expect(materialAlong(f.fenBefore!, [f.san, ...f.playedPv], 'w', 'gain').net).toBe(0)
  })

  it('no "wins material" sentence for the played move', () => {
    const f = buildMoveFacts(review, 1, 'w')
    expect(explain(f, 'personal').reasonCode).not.toBe('WinsMaterial')
    for (const s of sentences(f)) expect(s).not.toMatch(CLAIMS)
  })
})

describe('H3: {pv} is exactly the counted window', () => {
  const start = '4k3/8/8/7p/8/8/8/4K2R w - - 0 1'

  it('a gain counted over more than 5 plies is not claimed with a shorter excerpt', () => {
    // 1.Kd2 Kd8 2.Kc2 Kc8 3.Kb3 Kb8 4.Rxh5 Kc8: the pawn falls on ply 7, past any 5-ply {pvShort}.
    const review = makeReview(
      [{ san: 'Kd2', bestPv: ['e1d2', 'e8d8', 'd2c2', 'd8c8', 'c2b3', 'c8b8', 'h1h5', 'b8c8'] }],
      { startFen: start },
    )
    const f = buildMoveFacts(review, 1, 'w')
    expect(f.bestMaterialGain).toBe(1)
    expect(explain(f, 'impersonal').reasonCode).not.toBe('WinsMaterial')
    for (const s of sentences(f)) expect(s).not.toMatch(CLAIMS)
  })

  it('the quoted line holds the capture and ends where the count settled', () => {
    // 1.Kd2 Kd7 2.Rxh5 Kc6 3.Kc3 Kb6 4.Kb4: the count settles on 2...Kc6, the quiet reply to the capture.
    const review = makeReview(
      [{ san: 'Kd2', bestPv: ['e1d2', 'e8d7', 'h1h5', 'd7c6', 'd2c3', 'c6b6', 'c3b4'] }],
      { startFen: start },
    )
    const e = explain(buildMoveFacts(review, 1, 'w'), 'impersonal')
    expect(e.reasonCode).toBe('WinsMaterial')
    expect(e.sentences[0]).toBe('This nets a pawn; the point is 1.Kd2 Kd7 2.Rxh5 Kc6.')
    // Re-counting exactly the quoted plies gives the claimed figure.
    expect(materialAlong(start, ['Kd2', 'Kd7', 'Rxh5', 'Kc6'], 'w', 'gain').net).toBe(1)
  })

  it('materialAlong reports the window, and re-counting the window reproduces the figure', () => {
    const fen = new Chess().fen()
    const lines: Array<[string[], 'w' | 'b']> = [
      [['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4'], 'w'],
      [['e4', 'd5', 'exd5', 'Nf6', 'c4', 'c6', 'dxc6'], 'w'],
      [['e4', 'd5', 'exd5', 'Qxd5'], 'b'],
    ]
    for (const [sans, mover] of lines)
      for (const measure of ['gain', 'loss'] as const) {
        const ml = materialAlong(fen, sans, mover, measure)
        expect(materialAlong(fen, sans.slice(0, ml.window), mover, measure).net).toBe(ml.net)
        for (const t of ml.taken) expect(t.ply).toBeLessThan(ml.window)
      }
    expect(materialAlong(fen, lines[0][0], 'w', 'gain')).toMatchObject({ net: 0, window: 5 })
    expect(materialAlong(fen, lines[1][0], 'w', 'gain')).toMatchObject({ net: 1, window: 6 })
  })
})

describe('M1: material is counted to the end of the PV, not to the first quiet move', () => {
  it('2...Nf6 3.d4 exd4 4.Nf3 d5 5.Nxd4 nets nothing for Black', () => {
    const c = new Chess()
    for (const san of ['g3', 'e5', 'Bg2']) c.move(san)
    expect(materialAlong(c.fen(), ['Nf6', 'd4', 'exd4', 'Nf3', 'd5', 'Nxd4'], 'b', 'gain').net).toBe(0)
  })

  it('a gain the PV gives back two plies later is not claimed', () => {
    // 1.Rxh5 Kd7 2.Kd2 Rh8 3.Kc3 Rxh5: the rook comes back for the pawn's capturer.
    const review = makeReview(
      [{ san: 'Rxh5', bestPv: ['h1h5', 'e8d7', 'e1d2', 'a8h8', 'd2c3', 'h8h5', 'c3b4'] }],
      { startFen: 'r3k3/8/8/7p/8/8/8/4K2R w - - 0 1' },
    )
    const f = buildMoveFacts(review, 1, 'w')
    expect(f.bestMaterialGain).toBe(-4)
    for (const s of sentences(f)) expect(s).not.toMatch(/\b(wins?|ahead|nets|free)\b/i)
  })
})

describe('M2: a tactic sentence needs the motif’s own consequence', () => {
  // 1.Rxd5 takes a loose knight and pins d7 against d8, but the engine line never cashes in the pin.
  const fen = '3qk3/3p4/8/3n4/8/8/8/3RK3 w - - 0 1'
  const after = (() => {
    const c = new Chess(fen)
    c.move('Rxd5')
    return c.fen()
  })()
  const facts = (bestPv: string[], bestMaterialGain: number) =>
    moveFacts({
      classification: 'best',
      san: 'Rxd5',
      uci: 'd1d5',
      piece: 'r',
      from: 'd1',
      to: 'd5',
      captured: 'n',
      fenBefore: fen,
      fenAfter: after,
      bestSan: 'Rxd5',
      bestPv,
      bestMaterialGain,
      motifsPlayed: [{ type: 'pin', absolute: false, by: 'd5', pinned: 'd7', to: 'd8' }],
    })

  it('the knight on d5 is the only gain: no "pinning" sentence, the material claim instead', () => {
    const e = explain(facts(['Rxd5', 'Ke7', 'Kd2'], 3), 'impersonal')
    expect(e.reasonCode).toBe('WinsMaterial')
    expect(e.sentences.join(' ')).not.toMatch(/pin/i)
  })

  it('the pin is named when the line wins on a pinned or rear square', () => {
    // 1.Rxd5 d6 2.Rxd6: the pinned pawn advances and is taken on the file.
    const e = explain(facts(['Rxd5', 'd6', 'Rxd6', 'Qe7'], 4), 'impersonal')
    expect(e.reasonCode).toBe('Fork|Pin|Skewer|Discovered')
    expect(e.sentences[0]).toContain('pinning the pawn against the queen')
  })

  it('a missed tactic is not credited with unrelated material in the best line', () => {
    const f = moveFacts({
      classification: 'inaccuracy',
      winBefore: 54,
      winAfter: 46,
      loss: 8,
      san: 'Ke2',
      uci: 'e1e2',
      piece: 'k',
      from: 'e1',
      to: 'e2',
      fenBefore: fen,
      bestSan: 'Rxd5',
      bestPv: ['Rxd5', 'Ke7', 'Kd2'],
      bestMaterialGain: 3,
      motifsBest: [{ type: 'pin', absolute: false, by: 'd5', pinned: 'd7', to: 'd8' }],
    })
    const e = explain(f, 'impersonal')
    expect(e.reasonCode).toBe('Generic')
    expect(e.sentences.join(' ')).not.toMatch(/pin/i)
  })
})

describe('L1: facts.ts takes the mover POV from src/analysis and negates nothing itself', () => {
  it('imports toMover and carries no negation of a score value', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/explain/facts.ts'), 'utf8')
    expect(src).toMatch(/import \{[^}]*\btoMover\b[^}]*\} from '\.\.\/analysis'/)
    // No unary minus applied to a score value (a cp difference between two scores is not a negation).
    expect(src).not.toMatch(/(^|[(=,:?]|return)\s*-\s*[\w.]+\.value\b/m)
  })

  it('Black scores are converted to the mover', () => {
    const review = makeReview([
      { san: 'e4' },
      { san: 'e5', evalBefore: { type: 'cp', value: 35 }, evalAfter: { type: 'mate', value: -3 } },
    ])
    const f = buildMoveFacts(review, 2, 'w')
    expect(f.povBefore).toEqual({ type: 'cp', value: -35 })
    expect(f.povAfter).toEqual({ type: 'mate', value: 3 })
    expect(f.mateAfter).toBe(3)
  })
})

describe('L5: Inaccuracy and Mistake use exactly their E.4 rule lists', () => {
  const mating: Partial<MoveFacts> = {
    replyIsMate: true,
    replySan: 'Kxg2',
    playedPv: ['Kxg2', 'Kf5'],
    opponentMateIn: 10,
    bestLeadsToMateIn: 3,
    bestSan: 'Kf5',
    bestPv: ['Kf5'],
    winBefore: 50,
    winAfter: 10,
  }

  it('inaccuracy: MissedTactic, AllowsCounterplay, SlowerMate or the generic sentence (daily ply 125)', () => {
    const e = explain(moveFacts({ classification: 'inaccuracy', loss: 8, ...mating }), 'personal')
    expect(['MissedTactic', 'AllowsCounterplay', 'SlowerMate', 'Generic']).toContain(e.reasonCode)
    expect(e.sentences.join(' ')).not.toMatch(/mate in/i)
    // A crossed bucket still adds the E.7 swing as the second sentence.
    expect(e.sentences[1]).toBe('From a level game, you have slipped into a lost position.')
  })

  it('mistake: no HangsMate, GettingMated or MissedMate', () => {
    const e = explain(moveFacts({ classification: 'mistake', loss: 12, ...mating }), 'impersonal')
    expect(['HangsMate', 'GettingMated', 'MissedMate']).not.toContain(e.reasonCode)
  })
})

describe('L6: HangsPiece honours the PV-length guard', () => {
  it('a one-ply played line proves nothing about the reply', () => {
    const f = moveFacts({
      classification: 'blunder',
      winBefore: 58,
      winAfter: 42,
      loss: 16,
      motifsAllowed: [{ type: 'hangs', squares: ['f3'] }],
      replySan: 'Qxf3',
      playedPv: ['Qxf3'],
      playedMaterialLoss: 3,
    })
    expect(explain(f, 'impersonal').reasonCode).not.toBe('HangsPiece')
    expect(explain({ ...f, playedPv: ['Qxf3', 'gxf3'] }, 'impersonal').reasonCode).toBe('HangsPiece')
  })
})

describe('L7: {material} names unequal trades (E.6)', () => {
  it('rook for bishop is "the exchange"', () => {
    const review = makeReview(
      [
        { san: 'Bxd7+', bestPv: ['b5d7', 'e8d7', 'h1g2'] },
        { san: 'Kxd7', bestPv: ['e8d7', 'h1g2'] },
      ],
      { startFen: '4k3/3r4/8/1B6/8/8/8/7K w - - 0 1' },
    )
    const e = explain(buildMoveFacts(review, 1, 'w'), 'personal')
    expect(e.reasonCode).toBe('WinsMaterial')
    expect(e.sentences[0]).toBe('You come out ahead by the exchange after 1.Bxd7+ Kxd7 2.Kg2.')
  })
})

describe('L8: {materialDetail} holds the capture it describes', () => {
  const blunder = (startFen: string, played: string, bestUci: string, reply: string[]) =>
    makeReview(
      [
        { san: played, classification: 'blunder', bestPv: [bestUci], winBefore: 50, winAfter: 30, loss: 20 },
        { san: new Chess(startFen).move(played) && reply[0], bestPv: reply },
      ],
      { startFen },
    )

  it('the loss line runs through the capture', () => {
    const review = blunder('3qk3/8/8/8/3P4/8/8/4K3 w - - 0 1', 'Kf1', 'd4d5', ['d8d4', 'f1g2'])
    const e = explain(buildMoveFacts(review, 1, 'w'), 'impersonal')
    expect(e.reasonCode).toBe('LosesMaterial')
    expect(e.sentences[0]).toMatch(/a pawn\b.*\bQxd4 Kg2\b/)
  })

  it('a capture beyond the 3-ply detail is not claimed with a shorter line', () => {
    // 1.Kf1 Kd7 2.Kf2 Kc6 3.Kg3 Kb5 4.Kh4 Kxb4 5.Kg5: the pawn falls on the seventh ply after the move.
    const review = blunder('4k3/8/8/8/1P6/8/8/4K3 w - - 0 1', 'Kf1', 'b4b5', [
      'e8d7',
      'f1f2',
      'd7c6',
      'f2g3',
      'c6b5',
      'g3h4',
      'b5b4',
      'h4g5',
    ])
    const f = buildMoveFacts(review, 1, 'w')
    expect(f.playedMaterialLoss).toBe(1)
    const e = explain(f, 'impersonal')
    expect(e.reasonCode).not.toBe('LosesMaterial')
    expect(e.sentences.join(' ')).not.toMatch(/a pawn/)
  })
})

describe('L9: Brilliant "forces mate in {n}" uses the played move’s mate distance', () => {
  const brilliant = (overrides: Partial<MoveFacts>) =>
    moveFacts({
      classification: 'brilliant',
      fenBefore: new Chess().fen(),
      bestLeadsToMateIn: 2,
      motifsPlayed: [{ type: 'sacrifice', square: 'f3', value: 3 }],
      ...overrides,
    })

  it('mateAfter is the distance quoted', () => {
    const e = explain(brilliant({ mateAfter: 4 }), 'impersonal')
    expect(e.reasonCode).toBe('Brilliant(Sacrifice)+Mate')
    expect(e.sentences[0]).toContain('mate in 4')
  })

  it('no mate after the played move: no mate claim', () => {
    const e = explain(brilliant({ povAfter: { type: 'cp', value: 900 } }), 'impersonal')
    expect(e.reasonCode).not.toBe('Brilliant(Sacrifice)+Mate')
    expect(e.sentences.join(' ')).not.toMatch(/mate in/i)
  })
})
