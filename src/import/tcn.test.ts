// @vitest-environment node
// PROMPT.md R4, R5, Appendix A.2 (decoder) and A.3 (TCN fixtures). Red against the Phase 0a stub.
// Tests that read recorded network JSON load it inside the test body (PLAN.md Assumption 13).
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { loadNetworkFixture } from '../test/loadFixture'
import { applyTcnMove, decodeTcn, tcnToMoves } from './index'

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// A.3: game 1000337106 (daily, queen odds): start FEN and the first 20 plies of its tcn
const QUEEN_ODDS_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1'
const TCN_1000337106 = 'ow0Kfo!Tjr5QcjZRpx6Smu7Zbs84ecRJlt9zgmJB'
// A.3: bughouse tcn with nine drop plies
const BUGHOUSE_TCN = 'lB0KgvKBvB5QBQZJbsXQmC!TCJ9I=BIz-K7J+vzsjs=CfACvAJTJdv*0-N&U*MUMcM0KBK=lMl'

interface ArchiveGame {
  url: string
  tcn?: string
  pgn?: string
  rules?: string
  initial_setup?: string
}
interface Callback {
  game: { moveList: string; plyCount?: number; initialSetup?: string }
}

const sans = (moves: { san: string }[]) => moves.map((m) => m.san)
const historyOfPgn = (pgn: string): string[] => {
  const c = new Chess()
  c.loadPgn(pgn)
  return c.history()
}
const caught = (fn: () => unknown): unknown => {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error('expected the call to throw')
}

describe('decodeTcn (A.2 decoder)', () => {
  it('"mC" is e2e4', () => {
    expect(decodeTcn('mC')).toEqual([{ from: 'e2', to: 'e4' }])
  })

  it('the first two plies of game 97872578329 (moveList mCYIbs2U) are e2e4 c7c5 and ply 3 is b1c3', () => {
    const moves = decodeTcn('mCYIbs2U')
    expect(moves).toHaveLength(4)
    expect(moves.slice(0, 3)).toEqual([
      { from: 'e2', to: 'e4' },
      { from: 'c7', to: 'c5' },
      { from: 'b1', to: 'c3' },
    ])
  })

  it('daily 1034198172 "mC0Kgv5Qbs" decodes to five from/to pairs', () => {
    expect(decodeTcn('mC0Kgv5Qbs')).toEqual([
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
      { from: 'g1', to: 'f3' },
      { from: 'b8', to: 'c6' },
      { from: 'b1', to: 'c3' },
    ])
  })

  it('game 1000337106: ply 13 is Nc3 (bs), ply 14 is e8a8 and ply 15 is e1c1 (1-based plies)', () => {
    const moves = decodeTcn(TCN_1000337106)
    expect(moves).toHaveLength(20)
    expect(moves[12]).toEqual({ from: 'b1', to: 'c3' })
    expect(moves[13]).toEqual({ from: 'e8', to: 'a8' })
    expect(moves[14]).toEqual({ from: 'e1', to: 'c1' })
  })

  it('promotion: second character above 63 gives the piece (qnrb triples) and the file delta', () => {
    // 2 = g7 (index 54), j = b2 (index 9); { ~ } queen, ( ^ ) knight, [ _ ] rook, @ # $ bishop
    expect(decodeTcn('2~')).toEqual([{ from: 'g7', to: 'g8', promotion: 'q' }])
    expect(decodeTcn('2}')).toEqual([{ from: 'g7', to: 'h8', promotion: 'q' }])
    expect(decodeTcn('2(')).toEqual([{ from: 'g7', to: 'f8', promotion: 'n' }])
    expect(decodeTcn('2^')).toEqual([{ from: 'g7', to: 'g8', promotion: 'n' }])
    expect(decodeTcn('2]')).toEqual([{ from: 'g7', to: 'h8', promotion: 'r' }])
    expect(decodeTcn('2#')).toEqual([{ from: 'g7', to: 'g8', promotion: 'b' }])
    // a black pawn promotes towards rank 1 (from index below 16)
    expect(decodeTcn('j~')).toEqual([{ from: 'b2', to: 'b1', promotion: 'q' }])
    expect(decodeTcn('j}')).toEqual([{ from: 'b2', to: 'c1', promotion: 'q' }])
  })

  it('bughouse tcn: nine plies carry a drop piece and no from square', () => {
    const moves = decodeTcn(BUGHOUSE_TCN)
    expect(moves).toHaveLength(37)
    const drops = moves.flatMap((m, i) => (m.drop ? [{ ply: i + 1, drop: m.drop, from: m.from }] : []))
    expect(drops.map((d) => d.ply)).toEqual([15, 17, 19, 22, 28, 29, 30, 31, 36])
    expect(drops.map((d) => d.drop)).toEqual(['p', 'n', 'b', 'p', 'r', 'n', 'q', 'r', 'p'])
    expect(drops.every((d) => d.from === undefined)).toBe(true)
  })

  it('a character outside the alphabet throws', () => {
    expect(() => decodeTcn('mCéé')).toThrow()
  })
})

describe('applyTcnMove (A.2 castling normalisation)', () => {
  it('plays an ordinary move on the given chess.js instance', () => {
    const chess = new Chess()
    const move = applyTcnMove(chess, { from: 'e2', to: 'e4' })
    expect(move.san).toBe('e4')
    expect(chess.history()).toEqual(['e4'])
  })

  it('maps king-to-rook-square onto standard castling: e8a8 is black O-O-O, e1c1 is white O-O-O', () => {
    const chess = new Chess(QUEEN_ODDS_FEN)
    const moves = decodeTcn(TCN_1000337106)
    for (const m of moves.slice(0, 13)) applyTcnMove(chess, m)
    const black = applyTcnMove(chess, moves[13]) // e8a8
    expect(black.san).toBe('O-O-O')
    expect(black.lan).toBe('e8c8')
    const white = applyTcnMove(chess, moves[14]) // e1c1
    expect(white.san).toBe('O-O-O')
    expect(white.lan).toBe('e1c1')
  })

  it('maps king to the h-file rook square onto O-O (kingside)', () => {
    const chess = new Chess('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1')
    expect(applyTcnMove(chess, { from: 'e1', to: 'h1' }).san).toBe('O-O')
    expect(applyTcnMove(chess, { from: 'e8', to: 'h8' }).san).toBe('O-O')
  })

  it('a king-to-rook-square request that is not a castle is rethrown, not swallowed', () => {
    const chess = new Chess() // the rooks and king are boxed in: e1 to h1 is not castling
    expect(() => applyTcnMove(chess, { from: 'e1', to: 'h1' })).toThrow(/Invalid move/)
  })

  it('promotion moves decode and apply with the right promotion piece and capture', () => {
    const cases: [string, string, string][] = [
      ['8/6P1/8/8/8/k7/7K/8 w - - 0 1', '2~', 'g8=Q'],
      ['8/6P1/8/8/8/k7/7K/8 w - - 0 1', '2#', 'g8=B'],
      ['5r2/6P1/8/8/8/k7/7K/8 w - - 0 1', '2(', 'gxf8=N'],
      ['7r/6P1/8/8/8/k7/7K/8 w - - 0 1', '2]', 'gxh8=R'],
      ['7k/8/8/8/8/K7/1p6/8 b - - 0 1', 'j~', 'b1=Q'],
    ]
    for (const [fen, tcn, san] of cases) {
      const chess = new Chess(fen)
      expect(applyTcnMove(chess, decodeTcn(tcn)[0]).san).toBe(san)
    }
  })

  it('an illegal move from the standard start throws the chess.js "Invalid move" error', () => {
    const chess = new Chess()
    expect(() => applyTcnMove(chess, { from: 'e2', to: 'e5' })).toThrow(/Invalid move/)
  })
})

describe('tcnToMoves', () => {
  it('"mC0Kgv5Qbs" from the standard start is e4 e5 Nf3 Nc6 Nc3 with verbose history fields', () => {
    const moves = tcnToMoves('mC0Kgv5Qbs')
    expect(sans(moves)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Nc3'])
    expect(moves.map((m) => m.lan)).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'b1c3'])
    const reference = new Chess()
    expect(moves[0].before).toBe(reference.fen())
    for (const m of moves) {
      expect(m.before).toBe(reference.fen())
      reference.move(m.san)
      expect(m.after).toBe(reference.fen())
    }
  })

  it('an explicit initialFen equal to the standard start behaves like the default', () => {
    expect(sans(tcnToMoves('mC0Kgv5Qbs', STANDARD_FEN))).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Nc3'])
  })

  it('game 1000337106 decodes from its FEN: ply 14 and ply 15 are O-O-O (e8c8, e1c1)', () => {
    const moves = tcnToMoves(TCN_1000337106, QUEEN_ODDS_FEN)
    expect(moves).toHaveLength(20)
    expect(moves[12].san).toBe('Nc3')
    expect(moves[13].san).toBe('O-O-O')
    expect(moves[13].lan).toBe('e8c8')
    expect(moves[14].san).toBe('O-O-O')
    expect(moves[14].lan).toBe('e1c1')
    expect(moves[0].before).toBe(QUEEN_ODDS_FEN)
  })

  it('game 1000337106 from the standard start fails at ply 15 (white queen on d1 blocks O-O-O)', () => {
    // black's O-O-O at ply 14 is legal from either start; the first failure is ply 15 (1-based)
    const chess = new Chess()
    const decoded = decodeTcn(TCN_1000337106)
    for (const m of decoded.slice(0, 14)) applyTcnMove(chess, m)
    expect(() => applyTcnMove(chess, decoded[14])).toThrow(/Invalid move/)

    const error = caught(() => tcnToMoves(TCN_1000337106))
    expect(error).toMatchObject({ code: 'decode_failed', detail: { n: 15 } })
  })

  it('an illegal move at ply 3 fails with decode_failed and detail.n 3', () => {
    expect(caught(() => tcnToMoves('mC0KgA5Qbs'))).toMatchObject({ code: 'decode_failed', detail: { n: 3 } })
  })

  it('bughouse tcn with drop plies is rejected as variant_unsupported', () => {
    expect(caught(() => tcnToMoves(BUGHOUSE_TCN))).toMatchObject({ code: 'variant_unsupported' })
  })

  it('a drop anywhere rejects the whole list before any move is applied', () => {
    // the first drop is ply 15; a decode_failed for an earlier illegal move must not mask it,
    // because the whole list is rejected up front (A.2 required modification 1)
    const error = caught(() => tcnToMoves(BUGHOUSE_TCN, QUEEN_ODDS_FEN))
    expect(error).toMatchObject({ code: 'variant_unsupported' })
  })

  it('promotions in a decoded game replay as promotions', () => {
    // g7-g8=Q from a crafted position: decode, apply, and read back through the verbose history
    const moves = tcnToMoves('2~', '8/6P1/8/8/8/k7/7K/8 w - - 0 1')
    expect(moves).toHaveLength(1)
    expect(moves[0].san).toBe('g8=Q')
    expect(moves[0].promotion).toBe('q')
  })
})

describe('recorded games (network fixtures)', () => {
  it('129688175007: callback moveList equals the public API tcn, decodes to 112 plies equal to the pgn history', () => {
    const callback = loadNetworkFixture('www.chess.com-live-129688175007').body as Callback
    const month = loadNetworkFixture('api.chess.com-month-hikaru-2025-01').body as { games: ArchiveGame[] }
    const entry = month.games.find((g) => g.url.endsWith('/game/live/129688175007'))
    expect(entry).toBeDefined()
    const { moveList, plyCount } = callback.game
    expect(moveList).toBe(entry!.tcn)
    expect(moveList.length / 2).toBe(112)
    expect(plyCount).toBe(112)
    expect(decodeTcn(moveList)).toHaveLength(112)

    const moves = tcnToMoves(moveList, callback.game.initialSetup || undefined)
    expect(moves).toHaveLength(112)
    const expected = historyOfPgn(entry!.pgn!)
    expect(expected).toHaveLength(112)
    expect(sans(moves)).toEqual(expected)
  })

  it('daily 1000337106 decodes from its recorded initialSetup for the whole game, castling included', () => {
    const callback = loadNetworkFixture('www.chess.com-daily-1000337106').body as Callback
    const { moveList, plyCount, initialSetup } = callback.game
    expect(initialSetup).toBeTruthy()
    expect(moveList.startsWith(TCN_1000337106)).toBe(true)
    const moves = tcnToMoves(moveList, initialSetup)
    expect(moves).toHaveLength(plyCount ?? moveList.length / 2)
    expect(moves[13].lan).toBe('e8c8')
    expect(moves[14].lan).toBe('e1c1')
    // the same game from the standard start is not decodable
    expect(caught(() => tcnToMoves(moveList))).toMatchObject({ code: 'decode_failed', detail: { n: 15 } })
  })

  it('gothamchess 2026/09: promotions decode with the qnrb mapping and replay to the archive pgn', () => {
    const month = loadNetworkFixture('api.chess.com-month-gothamchess-2026-09').body as {
      games: ArchiveGame[]
    }
    const standard = month.games.filter((g) => g.rules === 'chess' && g.tcn && g.pgn)
    const withPromotion = standard.filter((g) => decodeTcn(g.tcn!).some((m) => m.promotion))
    expect(withPromotion.length).toBeGreaterThan(0)
    for (const g of withPromotion) {
      const promoted = decodeTcn(g.tcn!).filter((m) => m.promotion)
      expect(promoted.every((m) => 'qnrb'.includes(m.promotion!))).toBe(true)
      expect(sans(tcnToMoves(g.tcn!, g.initial_setup || undefined))).toEqual(historyOfPgn(g.pgn!))
    }
  })

  it('gothamchess 2026/09 holds 75 promotions in total (A.3)', () => {
    const month = loadNetworkFixture('api.chess.com-month-gothamchess-2026-09').body as {
      games: ArchiveGame[]
    }
    const total = month.games
      .filter((g) => g.tcn)
      .reduce((n, g) => n + decodeTcn(g.tcn!).filter((m) => m.promotion).length, 0)
    expect(total).toBe(75)
  })
})
