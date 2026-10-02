// R19 / PROMPT.md Appendix B.5 items 1 to 19: the engine numbers are hard-coded, the tests never run Stockfish.
// Inputs are built as B.2 and the B.5 heading say: raw UCI numbers are side-to-move; the "before" PositionEval is
// built with toWhite(raw, stmOf(fen)), the "after" one with toWhite(raw, otherColor); classifyPly then applies the
// single mover-POV rule (B.2).
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { classifyPly, type ClassifyContext } from './index'

type GameMove = ClassifyContext['move']
type PositionEval = ClassifyContext['before']
type EngineLine = PositionEval['lines'][number]
type Score = EngineLine['score']
type Color = 'w' | 'b'

const cp = (value: number): Score => ({ type: 'cp', value })
const mate = (value: number): Score => ({ type: 'mate', value })

// Local one-liners (src/engine belongs to another module and is not imported here).
const toWhite = (raw: Score, stm: Color): Score => ({ type: raw.type, value: stm === 'w' ? raw.value : -raw.value })
const stmOf = (fen: string): Color => (fen.split(' ')[1] === 'b' ? 'b' : 'w')
const otherColor = (c: Color): Color => (c === 'w' ? 'b' : 'w')

/** One engine line exactly as B.5 prints it: UCI move and the score from the side to move of that FEN. */
interface Raw {
  uci: string
  score: Score
}
const line = (uci: string, score: Score): Raw => ({ uci, score })

const DEPTH = 18

function positionEval(fen: string, raws: Raw[], stm: Color): PositionEval {
  return {
    fen,
    lines: raws.map((r, i) => ({ multipv: i + 1, depth: DEPTH, score: toWhite(r.score, stm), pv: [r.uci] })),
    depth: DEPTH,
    multiPv: 2,
    bestmove: raws[0]?.uci ?? null,
  }
}

interface Fixture {
  fen: string
  uci: string
  before: Raw[] // position k, side to move = mover
  after?: Raw[] // position k+1, opponent to move; omitted when the move ends the game (terminal)
  isBook?: boolean
  previous?: ClassifyContext['previous']
}

function buildContext(fx: Fixture): ClassifyContext {
  const chess = new Chess(fx.fen)
  const m = chess.move({ from: fx.uci.slice(0, 2), to: fx.uci.slice(2, 4), promotion: fx.uci[4] })
  const afterFen = chess.fen()
  const terminal: GameMove['terminal'] = chess.isCheckmate()
    ? 'checkmate'
    : chess.isStalemate()
      ? 'stalemate'
      : chess.isInsufficientMaterial()
        ? 'insufficient'
        : chess.isThreefoldRepetition()
          ? 'repetition'
          : chess.isDrawByFiftyMoves()
            ? 'fifty'
            : undefined
  const fullmove = Number(fx.fen.split(' ')[5])
  const move: GameMove = {
    ply: (fullmove - 1) * 2 + (m.color === 'w' ? 1 : 2),
    color: m.color,
    san: m.san,
    uci: fx.uci,
    from: m.from,
    to: m.to,
    piece: m.piece,
    ...(m.captured ? { captured: m.captured } : {}),
    ...(m.promotion ? { promotion: m.promotion } : {}),
    before: fx.fen,
    after: afterFen,
    ...(terminal ? { terminal } : {}),
  }
  const before = positionEval(fx.fen, fx.before, stmOf(fx.fen))
  let after: PositionEval
  if (terminal === 'checkmate' || terminal === 'stalemate') {
    // what analyzeGame synthesises for a game-ending move: no search, no lines
    after = { fen: afterFen, lines: [], depth: 0, multiPv: 2, bestmove: null, terminal }
  } else {
    if (!fx.after) throw new Error('fixture needs an after line')
    after = positionEval(afterFen, fx.after, otherColor(stmOf(fx.fen)))
  }
  return {
    move,
    before,
    after,
    isBook: fx.isBook ?? false,
    ...(fx.previous ? { previous: fx.previous } : {}),
  }
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// the position after fixture 6, shared by fixtures 7 and 8
const AFTER_RA6 = '6k1/5ppp/r7/8/8/8/5PPP/4R1K1 w - - 1 2'
// the opponent's previous ply of fixtures 7 and 8 (Ra6??) in the OPPONENT's (Black's) perspective: Black went from
// 50.1 to 0, so White's preMistakeWin is 100 - 50.1 = 49.9 (B.5 item 7)
const RA6_PREVIOUS: ClassifyContext['previous'] = { winBefore: 50.1, winAfter: 0, uci: 'a8a6', to: 'a6' }

describe('classifyPly: the 19 engine-verified fixtures of Appendix B.5', () => {
  it('1. Brilliant: sound queen sacrifice (Byrne vs Fischer, 17...Be6)', () => {
    const r = classifyPly(
      buildContext({
        fen: 'r3r1k1/pp3pbp/1qp3p1/2B5/2BP2b1/Q1n2N2/P4PPP/3R1K1R b - - 3 17',
        uci: 'g4e6',
        before: [line('g4e6', cp(246)), line('c3b5', cp(-108))],
        after: [line('a3c3', cp(-256))],
      }),
    )
    expect(r.classification).toBe('brilliant')
    expect(r.reasonCode).toBe('Brilliant:a')
    // B.5: mover win% 71.2 to 72.0, loss 0
    expect(r.winBefore).toBeCloseTo(71.2, 1)
    expect(r.winAfter).toBeCloseTo(72.0, 1)
    expect(r.loss).toBe(0)
  })

  it('2. Best: queen sacrifice that is not Brilliant because the alternative also mates', () => {
    const r = classifyPly(
      buildContext({
        fen: '5r1k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 1',
        uci: 'c4g8',
        before: [line('c4g8', mate(2)), line('h6f7', mate(4))],
        // after Qg8+ the opponent has one legal move: Rxg8 (mate -1 for the side to move)
        after: [line('f8g8', mate(-1))],
      }),
    )
    expect(r.classification).toBe('best')
  })

  it('3. Great: quiet only move (hikaru 129688175007 ply 81)', () => {
    const r = classifyPly(
      buildContext({
        fen: '8/5pk1/p3q1pp/1p2N3/2n1Q3/P1P4P/1P3PP1/6K1 w - - 1 41',
        uci: 'f2f4',
        before: [line('f2f4', cp(-5)), line('a3a4', cp(-478))],
        after: [line('c4b2', cp(6))],
      }),
    )
    expect(r.classification).toBe('great')
    expect(r.reasonCode).toBe('Great:gap')
  })

  it('4. Great: king only move in a pawn ending', () => {
    const r = classifyPly(
      buildContext({
        fen: '8/5pk1/p5pp/8/2pP1P2/P5PP/8/6K1 w - - 0 46',
        uci: 'g1f2',
        before: [line('g1f2', cp(-39)), line('g1f1', cp(-610))],
        after: [line('g7f6', cp(5))],
      }),
    )
    expect(r.classification).toBe('great')
    expect(r.reasonCode).toBe('Great:gap')
  })

  it('5. Best, not Great: only move but in check (Fried Liver 7...Ke6)', () => {
    const r = classifyPly(
      buildContext({
        fen: 'r1bq1b1r/ppp2kpp/2n5/3np3/2B5/5Q2/PPPP1PPP/RNB1K2R b KQ - 1 7',
        uci: 'f7e6',
        before: [line('f7e6', cp(-114)), line('f7e8', cp(-253))],
        after: [line('b1c3', cp(91))],
      }),
    )
    expect(r.classification).toBe('best')
  })

  it('6. Blunder: cp to mate flip (Ra6??)', () => {
    const r = classifyPly(
      buildContext({
        fen: 'r5k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1',
        uci: 'a8a6',
        before: [line('g8f8', cp(1)), line('a8c8', cp(0))],
        // White to move: Re8# next. Black is Black, so in White's perspective this is mate +1.
        after: [line('e1e8', mate(1)), line('g2g3', cp(0))],
      }),
    )
    expect(r.classification).toBe('blunder')
    // B.5: mover win% 50.1 to 0
    expect(r.winBefore).toBeCloseTo(50.1, 1)
    expect(r.winAfter).toBe(0)
  })

  it('7. Miss: missed mate in 1 after the opponent blunder (Kf1)', () => {
    const r = classifyPly(
      buildContext({
        fen: AFTER_RA6,
        uci: 'g1f1',
        before: [line('e1e8', mate(1)), line('g2g3', cp(0))],
        after: [line('g8f8', cp(0))],
        previous: RA6_PREVIOUS,
      }),
    )
    expect(r.classification).toBe('miss')
    expect(r.reasonCode).toBe('Miss:a')
  })

  it('8. Blunder, not Miss: mate to mate flip, winning to losing (Re7??)', () => {
    const r = classifyPly(
      buildContext({
        fen: AFTER_RA6,
        uci: 'e1e7',
        before: [line('e1e8', mate(1)), line('g2g3', cp(0))],
        // Black to move and mating in 2: the mover (White) is mated in 2
        after: [line('a6a1', mate(2)), line('a6e6', cp(0))],
        previous: RA6_PREVIOUS,
      }),
    )
    expect(r.classification).toBe('blunder')
  })

  it('9. Forced: the only legal move (Ka7)', () => {
    const r = classifyPly(
      buildContext({
        fen: 'k7/8/8/8/8/8/1R6/1R5K b - - 0 1',
        uci: 'a8a7',
        before: [line('a8a7', mate(-1))],
        // B.5 gives no line for the position after Ka7. Chosen consistent with the text: White to move mates in 1
        // (Ra2# exists in chess.js), so the mover's POV is mate -1 as in the "before" line.
        after: [line('b2a2', mate(1))],
      }),
    )
    expect(r.classification).toBe('forced')
    expect(r.reasonCode).toBe('Forced')
  })

  it('10. Blunder: stalemate reached from a forced mate (Qg6??)', () => {
    const r = classifyPly(
      buildContext({
        fen: '7k/5Q2/5K2/8/8/8/8/8 w - - 0 1',
        uci: 'f7g6',
        before: [line('f7g7', mate(1)), line('f7f8', mate(2))],
        // stalemate on the board: move.terminal = 'stalemate', after = { lines: [], terminal: 'stalemate' }
      }),
    )
    expect(r.classification).toBe('blunder')
    expect(r.reasonCode).toBe('DrawFromWinning')
    expect(r.winBefore).toBe(100)
    expect(r.winAfter).toBe(50)
  })

  it('11. Best: the checkmating move short-circuits (Qg7#)', () => {
    const r = classifyPly(
      buildContext({
        fen: '7k/5Q2/5K2/8/8/8/8/8 w - - 0 1',
        uci: 'f7g7',
        before: [line('f7g7', mate(1)), line('f7f8', mate(2))],
        // checkmate on the board: no engine eval of the final position exists
      }),
    )
    expect(r.classification).toBe('best')
    expect(r.reasonCode).toBe('CheckmateBest')
    expect(r.winAfter).toBe(100)
  })

  it('12. Book: the opening table precedes every engine rule (1.e4)', () => {
    const r = classifyPly(
      buildContext({
        fen: START,
        uci: 'e2e4',
        before: [line('e2e4', cp(29)), line('d2d4', cp(25))],
        // B.5 gives no line for the position after 1.e4. Chosen consistent with the "before" line: Black to move,
        // raw -29 (White +29).
        after: [line('e7e5', cp(-29))],
        isBook: true,
      }),
    )
    expect(r.classification).toBe('book')
    expect(r.reasonCode).toBe('Book')
  })

  it('13. Excellent: loss is the played line (exd4, real egilll 172597527188 ply 10)', () => {
    const r = classifyPly(
      buildContext({
        fen: 'r1bqkbnr/pp3ppp/2np4/1Bp1p3/3PP3/2P2N2/PP3PPP/RNBQK2R b KQkq - 0 5',
        uci: 'e5d4',
        before: [line('c5d4', cp(-53)), line('e5d4', cp(-58))],
        after: [line('c3d4', cp(64))],
      }),
    )
    expect(r.classification).toBe('excellent')
    // B.5: top-line loss 1.00, played-line loss 0.46 (e5d4 is pv2), so loss = 0.46
    expect(r.loss).toBeCloseTo(0.46, 1)
  })

  it('14. Good (g4, real 173687760292 ply 21)', () => {
    const r = classifyPly(
      buildContext({
        fen: 'r2q1rk1/ppnbbppp/2npp3/2p5/2P1PP2/2NP1N1P/PP1BB1P1/R2Q1RK1 w - - 1 11',
        uci: 'g2g4',
        before: [line('a2a3', cp(25)), line('a1c1', cp(19))],
        after: [line('a8b8', cp(13))],
      }),
    )
    expect(r.classification).toBe('good')
    expect(r.loss).toBeCloseTo(3.5, 1) // B.5: EP loss 0.0350
  })

  it('15. Inaccuracy (Qd7, real hikaru 130007418181 ply 36)', () => {
    const r = classifyPly(
      buildContext({
        fen: '2r1k2r/p3bp2/np2p1p1/1qppPn1p/3P1P2/2P2NPP/PP1QNB2/R4RK1 b k - 4 18',
        uci: 'b5d7',
        before: [line('c5d4', cp(8)), line('e8d7', cp(-38))],
        after: [line('g1g2', cp(74))],
      }),
    )
    expect(r.classification).toBe('inaccuracy')
    expect(r.loss).toBeCloseTo(7.51, 1) // B.5: EP loss 0.0751
  })

  it('16. Mistake (Nxc6, real 173390491594 ply 25)', () => {
    const r = classifyPly(
      buildContext({
        fen: 'r3k2r/1b1n1ppp/pqn1p3/1pbpP3/3N1P2/P1N1B3/1PP1B1PP/R2Q1RK1 w kq - 1 13',
        uci: 'd4c6',
        before: [line('c3d5', cp(-271)), line('c3b5', cp(-389))],
        after: [line('c5e3', cp(543))],
      }),
    )
    expect(r.classification).toBe('mistake')
    expect(r.loss).toBeCloseTo(15.01, 1) // B.5: EP loss 0.1501
  })

  it('17. Blunder (Qe7, real 184416402230 ply 20)', () => {
    const r = classifyPly(
      buildContext({
        fen: 'rn1qk1nr/ppp3pp/1b3p2/4p2b/1PPpP3/3P1NPP/P4PB1/RNBQ1RK1 b kq - 2 10',
        uci: 'd8e7',
        before: [line('c7c5', cp(10)), line('c7c6', cp(-33))],
        after: [line('c4c5', cp(450))],
      }),
    )
    expect(r.classification).toBe('blunder')
    expect(r.loss).toBeCloseTo(34.9, 1) // B.5: EP loss 0.349
  })

  it('18. Excellent: mate kept but slower, not a Miss (Bd2+, real 172870871172 ply 97)', () => {
    const r = classifyPly(
      buildContext({
        fen: 'Rq6/8/4p3/3pPpP1/1P1P1P2/2k1B3/Q3K3/8 w - - 0 49',
        uci: 'e3d2',
        before: [line('a8a3', mate(2)), line('a2a3', mate(4))],
        // Black to move, mated in 3 (mover White keeps a mate, now M3): mateLoss = 3 - 2 = 1 < 2
        after: [line('c3d4', mate(-3))],
      }),
    )
    expect(r.classification).toBe('excellent')
  })

  it('19. Miss: lost a forced mate but still crushing (O-O-O, real 184448623900 ply 19)', () => {
    const r = classifyPly(
      buildContext({
        fen: '3q1b1r/1pNbkppp/p1n1pn2/3p4/3P1B2/3Q1N2/PPP1PPPP/R3KB1R w KQ - 7 10',
        uci: 'e1c1',
        before: [line('d3a3', mate(2)), line('c2c4', cp(752))],
        after: [line('f6e4', cp(-632))],
        // The opponent's previous ply raised White from 87.2 to 100 (gain 13), i.e. 12.8 -> 0 in Black's own
        // perspective. B.5 does not give that move; uci/to below are placeholders that interact with no rule that
        // matters here (nothing is captured, nothing is recaptured).
        previous: { winBefore: 12.8, winAfter: 0, uci: 'e8e7', to: 'e7' },
      }),
    )
    expect(r.classification).toBe('miss')
    expect(r.reasonCode).toBe('Miss:b')
    // B.5: win% about 91 (91.1 on the B.2 curve)
    expect(r.winAfter).toBeGreaterThanOrEqual(90)
    expect(r.winAfter).toBeCloseTo(91.1, 1)
  })
})
