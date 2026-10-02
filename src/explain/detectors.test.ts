// Detector fixtures (PROMPT.md Appendix E.5, verified on chess.js 1.4.0). Phase 0b: red against the stubs.
import { Chess, type Square } from 'chess.js'
import { describe, expect, it } from 'vitest'
import {
  backRankWeak,
  canBeTakenByLowerPiece,
  detectDiscovered,
  detectFork,
  detectPinsAndSkewers,
  enPrise,
  isDefended,
  isHanging,
  isInBadSpot,
  isTrapped,
  materialCount,
  materialDiff,
  matesInOneIfPass,
  see,
  withTurn,
} from './detectors'

const load = (fen: string) => new Chess(fen)

describe('detectFork', () => {
  const FORK = 'r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1'

  it('finds the knight on c7 forking a8 and e8', () => {
    const fork = detectFork(load(FORK), 'c7')
    expect(fork).not.toBeNull()
    expect(fork?.type).toBe('fork')
    expect(fork?.by).toBe('c7')
    expect([...(fork?.targets ?? [])].sort()).toEqual(['a8', 'e8'])
  })

  it('is not a fork when only one valuable piece is attacked', () => {
    expect(detectFork(load('4k3/2N5/8/8/8/8/8/4K3 b - - 0 1'), 'c7')).toBeNull()
  })

  it('is not a fork when the forking piece itself is in a bad spot', () => {
    // The undefended knight on c7 is attacked by the rook on c8.
    expect(detectFork(load('r1r1k3/2N5/8/8/8/8/8/4K3 b - - 0 1'), 'c7')).toBeNull()
  })

  it('returns null for an empty square', () => {
    expect(detectFork(load(FORK), 'd4')).toBeNull()
  })
})

describe('detectPinsAndSkewers', () => {
  it('absolute pin: bishop b5 pins the knight c6 to the king e8', () => {
    const res = detectPinsAndSkewers(load('4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1'), 'w')
    expect(res).toEqual([{ type: 'pin', absolute: true, by: 'b5', pinned: 'c6', to: 'e8' }])
  })

  it('relative pin: rook d1 pins the knight d5 against the queen d8', () => {
    const res = detectPinsAndSkewers(load('3qk3/8/8/3n4/8/8/8/3RK3 w - - 0 1'), 'w')
    expect(res).toEqual([{ type: 'pin', absolute: false, by: 'd1', pinned: 'd5', to: 'd8' }])
  })

  it('skewer: rook a1 skewers the queen a5 and the rook a8', () => {
    const res = detectPinsAndSkewers(load('r3k3/8/8/q7/8/8/8/R3K3 w - - 0 1'), 'w')
    expect(res).toEqual([{ type: 'skewer', by: 'a1', front: 'a5', behind: 'a8' }])
  })

  it('reports nothing when the two pieces on the ray are worth the same', () => {
    expect(detectPinsAndSkewers(load('3bk3/8/8/3n4/8/8/8/3RK3 w - - 0 1'), 'w')).toEqual([])
  })

  it('only walks the rays of the requested colour', () => {
    expect(detectPinsAndSkewers(load('4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1'), 'b')).toEqual([])
  })
})

describe('hanging pieces and SEE', () => {
  const HANGING = '4k3/8/8/3n4/8/8/8/3RK3 b - - 0 1'
  const DEFENDED = '4k3/8/4p3/3n4/8/8/8/3RK3 b - - 0 1'

  it('an undefended knight attacked by a rook is hanging and see is 3', () => {
    const c = load(HANGING)
    expect(isHanging(c, 'd5')).toBe(true)
    expect(isDefended(c, 'd5')).toBe(false)
    expect(see(c, 'd5', 'w')).toBe(3)
    expect(enPrise(c, 'd5')).toBe(true)
  })

  it('a knight defended by a pawn is not worth taking with a rook: see is -2 and not en prise', () => {
    const c = load(DEFENDED)
    expect(isDefended(c, 'd5')).toBe(true)
    expect(isHanging(c, 'd5')).toBe(false)
    expect(see(c, 'd5', 'w')).toBe(-2)
    expect(enPrise(c, 'd5')).toBe(false)
  })

  it('see of an empty square is 0', () => {
    expect(see(load(HANGING), 'a4', 'w')).toBe(0)
  })

  it('counts a piece as defended through the lichess ray defence', () => {
    // The black rook a5 is blocked by the white rook c5, which attacks the knight d5.
    // Removing the attacker uncovers the defence.
    const c = load('4k3/8/8/r1Rn4/8/8/8/4K3 w - - 0 1')
    expect(isDefended(c, 'd5')).toBe(true)
    expect(isHanging(c, 'd5')).toBe(false)
  })

  it('canBeTakenByLowerPiece and isInBadSpot', () => {
    // A defended knight attacked only by a rook is fine.
    const fine = load(DEFENDED)
    expect(canBeTakenByLowerPiece(fine, 'd5')).toBe(false)
    expect(isInBadSpot(fine, 'd5')).toBe(false)
    // A hanging knight attacked by a rook is in a bad spot.
    expect(isInBadSpot(load(HANGING), 'd5')).toBe(true)
    // A defended knight attacked by a pawn is in a bad spot because a lower piece can take it.
    const pawnAttacked = load('4k3/8/8/3p4/4N3/8/8/4RK2 w - - 0 1')
    expect(isHanging(pawnAttacked, 'e4')).toBe(false)
    expect(canBeTakenByLowerPiece(pawnAttacked, 'e4')).toBe(true)
    expect(isInBadSpot(pawnAttacked, 'e4')).toBe(true)
  })
})

describe('detectDiscovered', () => {
  const BEFORE = '4k3/8/8/8/4N3/8/8/4RK2 w - - 0 1'

  it('Nc5 uncovers a discovered check from the rook e1 on the king e8', () => {
    const before = load(BEFORE)
    const after = load(BEFORE)
    after.move('Nc5')
    const res = detectDiscovered(before, after, { from: 'e4', to: 'c5', color: 'w' })
    expect(res).toEqual([{ type: 'discoveredCheck', target: 'e8', by: ['e1'] }])
  })

  it('reports nothing when the moving piece uncovers no line', () => {
    const fen = '4k3/8/8/8/4N3/8/8/3RK3 w - - 0 1'
    const before = load(fen)
    const after = load(fen)
    after.move('Nc5')
    expect(detectDiscovered(before, after, { from: 'e4', to: 'c5', color: 'w' })).toEqual([])
  })
})

describe('back rank and mate threats', () => {
  const FEN = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'

  it('Black is back-rank weak and White threatens Rd8#', () => {
    const c = load(FEN)
    expect(backRankWeak(c, 'b')).toBe(true)
    expect(matesInOneIfPass(c, 'w')).toBe('Rd8#')
  })

  it('White is not back-rank weak: Black has no rook or queen', () => {
    expect(backRankWeak(load(FEN), 'w')).toBe(false)
  })

  it('a king with an escape square is not back-rank weak', () => {
    expect(backRankWeak(load('6k1/5pp1/8/8/8/8/5PPP/3R2K1 w - - 0 1'), 'b')).toBe(false)
  })

  it('matesInOneIfPass is null when there is no mate in one', () => {
    expect(matesInOneIfPass(load('4k3/8/8/8/8/8/8/4K3 w - - 0 1'), 'w')).toBeNull()
  })
})

describe('isTrapped', () => {
  it('a bishop on a7 boxed in by b6 and c7 (attacked by the rook) is trapped', () => {
    expect(isTrapped(load('r3k3/B1p5/1p6/8/8/8/8/4K3 w - - 0 1'), 'a7')).toBe(true)
  })

  it('without the c7 pawn the bishop can escape', () => {
    expect(isTrapped(load('r3k3/B7/1p6/8/8/8/8/4K3 w - - 0 1'), 'a7')).toBe(false)
  })

  it('kings, pawns and empty squares are never trapped', () => {
    const c = load('r3k3/B1p5/1p6/8/8/8/8/4K3 w - - 0 1')
    expect(isTrapped(c, 'e1')).toBe(false)
    expect(isTrapped(c, 'c7')).toBe(false)
    expect(isTrapped(c, 'h4')).toBe(false)
  })
})

describe('chess.js pin behaviour of attackers()', () => {
  const FEN = '4k3/8/2n5/1B6/3P4/8/8/4K3 b - - 0 1'

  it('attackers() is pseudo-legal: the pinned knight attacks d4 but has no legal moves, and see ignores the pin', () => {
    const c = load(FEN)
    expect(c.attackers('d4', 'b')).toEqual(['c6'])
    expect(c.moves({ square: 'c6' as Square })).toEqual([])
    expect(see(c, 'd4', 'b')).toBe(1)
  })
})

describe('withTurn and material', () => {
  it('withTurn returns a copy with the other side to move and leaves the original alone', () => {
    const c = load('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1')
    const flipped = withTurn(c, 'b')
    expect(flipped.turn()).toBe('b')
    expect(flipped.board()).toEqual(c.board())
    expect(c.turn()).toBe('w')
  })

  it('materialCount and materialDiff use P1 N3 B3 R5 Q9 and ignore kings', () => {
    const c = load('4k3/8/8/3n4/8/8/8/3RK3 b - - 0 1')
    expect(materialCount(c, 'w')).toBe(5)
    expect(materialCount(c, 'b')).toBe(3)
    expect(materialDiff(c, 'w')).toBe(2)
    expect(materialDiff(c, 'b')).toBe(-2)
  })

  it('both sides have 39 points in the start position', () => {
    const c = new Chess()
    expect(materialCount(c, 'w')).toBe(39)
    expect(materialCount(c, 'b')).toBe(39)
    expect(materialDiff(c, 'w')).toBe(0)
  })
})
