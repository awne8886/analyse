// One proof-rule test per classification, voice switching, placeholders (PROMPT.md Appendix E.3 to E.7).
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import type { MoveFacts } from '../types/explain'
import { explain } from './index'
import { describeMaterial } from './templates'
import { moveFacts } from './test-helpers'

/** Facts for a move played on a real board, so that pieces and arrows can be resolved. */
function onBoard(fenBefore: string, san: string, overrides: Partial<MoveFacts> = {}): MoveFacts {
  const c = new Chess(fenBefore)
  const m = c.move(san)
  return moveFacts({
    san: m.san,
    uci: m.from + m.to,
    piece: m.piece,
    from: m.from,
    to: m.to,
    captured: m.captured,
    fenBefore,
    fenAfter: c.fen(),
    ...overrides,
  })
}

describe('proof rules, one per class', () => {
  it('blunder: MissedWin cites bestMaterialGain; a sentence opening with {best} carries the move number', () => {
    const f = moveFacts({
      classification: 'blunder',
      ply: 21,
      bestSan: 'Qxd8+',
      bestPv: ['Qxd8+'],
      bestMaterialGain: 5,
    })
    const imp = explain(f, 'impersonal')
    expect(imp.reasonCode).toBe('MissedWin')
    expect(imp.sentences).toEqual(['11.Qxd8+ would have won a rook here.'])
    const per = explain({ ...f, isUserMove: true }, 'personal')
    expect(per.sentences).toEqual(['You could have won a rook with Qxd8+.'])
    for (const s of [...imp.sentences, ...per.sentences]) expect(s).not.toMatch(/wins/i)
  })

  it('mistake: LosesCastling needs castling rights lost on the board and an eval drop', () => {
    const f = onBoard('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', 'Kf1', {
      classification: 'mistake',
      winBefore: 56,
      winAfter: 44,
      loss: 12,
      bestSan: 'O-O',
    })
    const e = explain(f, 'impersonal')
    expect(e.reasonCode).toBe('LosesCastling')
    expect(e.sentences).toEqual(['This gives up the right to castle.'])
    expect(e.highlights).toEqual(['e1'])
    expect(explain({ ...f, loss: 0 }, 'impersonal').reasonCode).toBe('Generic')
  })

  it('inaccuracy: AllowsCounterplay needs an allowed motif, a two-ply line and no material loss', () => {
    const f = moveFacts({
      classification: 'inaccuracy',
      winBefore: 54,
      winAfter: 46,
      loss: 8,
      replySan: 'Bb4',
      playedPv: ['Bb4', 'a3'],
      motifsAllowed: [{ type: 'pin', absolute: true, by: 'b4', pinned: 'c3', to: 'e1' }],
    })
    const e = explain(f, 'impersonal')
    expect(e.reasonCode).toBe('AllowsCounterplay')
    expect(e.sentences).toEqual(['This allows Bb4, which is unpleasant to meet.'])
    expect(explain({ ...f, playedPv: ['Bb4'] }, 'impersonal').reasonCode).toBe('Generic')
  })

  it('miss: MissedWin(FreePiece) names the free piece and draws the best arrow', () => {
    const f = moveFacts({
      classification: 'miss',
      fenBefore: '4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1',
      san: 'Kf2',
      from: 'e1',
      to: 'f2',
      piece: 'k',
      bestSan: 'Qxd5',
      bestPv: ['Qxd5'],
      bestMaterialGain: 3,
      motifsBest: [{ type: 'freePiece', square: 'd5' }],
    })
    const e = explain(f, 'impersonal')
    expect(e.reasonCode).toBe('MissedWin(FreePiece)')
    expect(e.sentences).toEqual(['This overlooks a free knight: Qxd5 takes it for nothing.'])
    expect(e.arrows).toContainEqual({ from: 'd1', to: 'd5', kind: 'best' })
    expect(e.highlights).toEqual(['d5'])
  })

  it('brilliant: Sacrifice+Material quotes the numbered PV after the sacrifice', () => {
    const f = moveFacts({
      classification: 'brilliant',
      ply: 13,
      san: 'Bxf7+',
      piece: 'b',
      from: 'c4',
      to: 'f7',
      captured: 'p',
      isCheck: true,
      bestSan: 'Bxf7+',
      bestPv: ['Bxf7+', 'Kxf7', 'Ng5+', 'Kg8', 'Qxd8'],
      bestMaterialGain: 2,
      playedPv: ['Kxf7', 'Ng5+', 'Kg8', 'Qxd8'],
      motifsPlayed: [{ type: 'sacrifice', square: 'f7', value: 3 }],
    })
    const e = explain(f, 'impersonal')
    expect(e.reasonCode).toBe('Brilliant(Sacrifice)+Material')
    expect(e.sentences).toEqual([
      'Brilliant: the bishop on f7 is offered, and after 7...Kxf7 8.Ng5+ Kg8 9.Qxd8 White comes out ahead by two pawns.',
    ])
    expect(e.bestLine).toBeUndefined()
  })

  it('great: Critical(Find) adds the second-best consequence derived from the gap', () => {
    const f = moveFacts({
      classification: 'great',
      winBefore: 70,
      winAfter: 70,
      gapToSecondBest: { winPct: 25, cp: 400 },
    })
    const e = explain(f, 'impersonal')
    expect(e.reasonCode).toBe('Critical(Find)')
    expect(e.sentences).toEqual([
      'Great move: this was the only move that holds the position; anything else loses the advantage.',
    ])
    expect(explain({ ...f, gapToSecondBest: { winPct: 5, cp: 80 } }, 'impersonal').reasonCode).toBe('Great')
  })

  it('best: MateThreat cites matesInOneIfPass and draws the threat arrow', () => {
    const f = onBoard('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'Rd1', {
      classification: 'best',
      bestSan: 'Rd1',
      motifsPlayed: [{ type: 'mateThreat', san: 'Rd8#' }],
    })
    const e = explain(f, 'impersonal')
    expect(e.reasonCode).toBe('MateThreat')
    expect(e.sentences).toEqual(['This threatens Rd8#.'])
    expect(e.arrows).toEqual([
      { from: 'a1', to: 'd1', kind: 'played' },
      { from: 'd1', to: 'd8', kind: 'threat' },
    ])
    expect(explain({ ...f, isUserMove: true }, 'personal').sentences).toEqual(['You now threaten Rd8#.'])
  })

  it('excellent: names the best move (sentence and chip) only when its tactic is proven', () => {
    const base = moveFacts({
      classification: 'excellent',
      san: 'O-O',
      motifsPlayed: [{ type: 'castleKing' }],
    })
    expect(explain(base, 'impersonal').sentences).toEqual(['A strong move: it castles kingside.'])
    const withTactic = {
      ...base,
      bestMaterialGain: 3,
      motifsBest: [{ type: 'fork' as const, by: 'c3', targets: ['d5', 'b5'] }],
    }
    const e = explain(withTactic, 'impersonal')
    expect(e.reasonCode).toBe('Castles')
    expect(e.sentences).toEqual(['Almost as strong as Nc3; it castles kingside.'])
    expect(e.bestLine).toBe('Best was Nc3')
  })

  it('good: MissedTactic describes the best move tactic with the pieces from the board', () => {
    const f = moveFacts({
      classification: 'good',
      winBefore: 53,
      winAfter: 48,
      loss: 5,
      fenBefore: '4k3/8/8/1r1q4/8/8/8/1N2K3 w - - 0 1',
      san: 'Ke2',
      from: 'e1',
      to: 'e2',
      piece: 'k',
      bestSan: 'Nc3',
      bestMaterialGain: 3,
      motifsBest: [{ type: 'fork', by: 'c3', targets: ['d5', 'b5'] }],
    })
    const e = explain(f, 'impersonal')
    expect(e.reasonCode).toBe('MissedTactic')
    expect(e.sentences).toEqual(['A reasonable move, though Nc3 was stronger, forking the queen and rook.'])
    expect(e.highlights).toEqual(['c3', 'd5', 'b5'])
    // No engine agreement (no material in the best line): the generic sentence.
    expect(explain({ ...f, bestMaterialGain: 0 }, 'impersonal').reasonCode).toBe('Generic')
  })

  it('book without an opening name still says it is a known opening move', () => {
    const e = explain(moveFacts({ classification: 'book' }), 'impersonal')
    expect(e.reasonCode).toBe('Book')
    expect(e.sentences).toEqual(['A known opening move.'])
  })

  it('forced: cites the single legal move', () => {
    const e = explain(moveFacts({ classification: 'forced', legalMoveCount: 1, ply: 21 }), 'personal')
    expect(e.reasonCode).toBe('Forced')
    expect(e.sentences).toEqual(['The only legal move; you had no choice.'])
    expect(e.highlights).toEqual([])
  })
})

describe('voice switching', () => {
  const loses = (isUserMove: boolean) =>
    moveFacts({
      classification: 'blunder',
      isUserMove,
      winBefore: 85,
      winAfter: 35,
      replySan: 'Bxe5',
      playedPv: ['Bxe5', 'dxe5', 'Nxe5'],
      playedMaterialLoss: 1,
    })

  it('LosesMaterial and the swing sentence speak to "you" in the personal voice and name the colour otherwise', () => {
    const per = explain(loses(true), 'personal')
    expect(per.reasonCode).toBe('LosesMaterial')
    expect(per.sentences).toEqual([
      'This costs you a pawn after Bxe5 dxe5 Nxe5.',
      'You were winning and are now the side under pressure.',
    ])
    const imp = explain(loses(false), 'impersonal')
    expect(imp.sentences).toEqual([
      'This loses a pawn: Bxe5 dxe5 Nxe5.',
      'White was winning and is now the side under pressure.',
    ])
  })

  it('Great FoundWin speaks to the mover or names the colour', () => {
    const f = moveFacts({ classification: 'great', color: 'b', winBefore: 30, winAfter: 85 })
    expect(explain(f, 'impersonal').sentences).toEqual([
      'A turning point: Black was worse and is now winning.',
    ])
    expect(explain({ ...f, isUserMove: true }, 'personal').sentences).toEqual([
      'The tide turns here: you were worse, and now you are winning.',
    ])
  })
})

describe('depth gate and placeholders', () => {
  it('board-fact rules (castling) still run below the gate; engine claims do not', () => {
    const f = moveFacts({
      classification: 'best',
      san: 'O-O',
      motifsPlayed: [{ type: 'castleKing' }, { type: 'mateThreat', san: 'Qh7#' }],
      depthReached: 10,
      depthTarget: 16,
    })
    expect(explain(f, 'impersonal').reasonCode).toBe('Castles')
    expect(explain({ ...f, depthReached: 16 }, 'impersonal').reasonCode).toBe('MateThreat')
  })

  it('{material} wording (E.6)', () => {
    expect(describeMaterial(1, ['p'])).toBe('a pawn')
    expect(describeMaterial(2, ['r'], ['n'])).toBe('the exchange')
    expect(describeMaterial(2, ['n'], ['p'])).toBe('a knight for a pawn')
    expect(describeMaterial(3, ['b'])).toBe('a bishop')
    expect(describeMaterial(3)).toBe('a minor piece')
    expect(describeMaterial(2, ['p', 'p'])).toBe('two pawns')
    expect(describeMaterial(9, ['q'])).toBe('the queen')
    expect(describeMaterial(12, ['q', 'r'])).toBe('decisive material')
    expect(describeMaterial(4, ['n', 'p'], [], 4)).toBe('material (about 4 pawns)')
  })
})
