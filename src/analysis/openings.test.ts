// B.8 opening book lookup and the B.3 step 2 contiguous Book prefix.
import { describe, expect, it } from 'vitest'
import { epdOf, lookupOpening } from './index'
import { bookPrefix } from './openings'
import { makeGame } from './test-helpers'

describe('lookupOpening (B.8)', () => {
  it('finds an opening by the EPD (first 4 FEN fields) of the position after the move', () => {
    const [e4] = makeGame(['e4']).moves
    expect(epdOf(e4.after)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -')
    expect(lookupOpening(epdOf(e4.after))).toEqual({ eco: 'B00', name: "King's Pawn Game" })
  })

  it('names have the form "Family: Variation"', () => {
    const moves = makeGame(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']).moves
    expect(lookupOpening(epdOf(moves[5].after))).toEqual({ eco: 'C70', name: 'Ruy Lopez: Morphy Defense' })
  })

  it('returns undefined for a position that is not in the table, and for a full FEN instead of an EPD', () => {
    expect(lookupOpening('8/8/8/8/3k4/8/R7/R3K3 w - -')).toBeUndefined()
    const [e4] = makeGame(['e4']).moves
    expect(lookupOpening(e4.after)).toBeUndefined()
    expect(lookupOpening('constructor')).toBeUndefined()
  })
})

describe('bookPrefix (B.3 step 2)', () => {
  it('every ply of a book line is Book; the last match is the opening with lastBookPly', () => {
    const game = makeGame(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'])
    // 4.Ba4 leaves the table, so the prefix stops at ply 6 whatever follows
    expect(bookPrefix(game.moves, false)).toEqual({
      bookPlies: 6,
      opening: { eco: 'C70', name: 'Ruy Lopez: Morphy Defense', lastBookPly: 6 },
    })
  })

  it('an isolated later match is not Book (contiguous prefix from the standard start only)', () => {
    // 1.Nf3 Nf6 are book; 2.Ng1 is not; 3.e4 transposes to the 1.e4 position, which IS in the table
    const game = makeGame(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'e4'])
    expect(lookupOpening(epdOf(game.moves[4].after))).toEqual({ eco: 'B00', name: "King's Pawn Game" })
    expect(bookPrefix(game.moves, false)).toEqual({
      bookPlies: 2,
      opening: { eco: 'A05', name: 'Zukertort Opening', lastBookPly: 2 },
    })
  })

  it('a game whose first move is not in the table has no Book and no opening', () => {
    const game = makeGame(['Nf3', 'Nf6', 'Ng1'])
    expect(bookPrefix(game.moves.slice(2), false)).toEqual({ bookPlies: 0 })
  })

  it('a custom start is never Book, even on a transposition (R5)', () => {
    const game = makeGame(['e4', 'e5'])
    expect(bookPrefix(game.moves, true)).toEqual({ bookPlies: 0 })
  })
})
