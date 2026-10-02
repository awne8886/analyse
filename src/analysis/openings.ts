// B.8 opening book: src/data/openings.json maps an EPD (first 4 FEN fields, chess.js fen()) to { eco, name }.
import type { GameMove } from '../types/game'
import openingsJson from '../data/openings.json'

type Opening = { eco: string; name: string }
const OPENINGS = openingsJson as Record<string, Opening>

export const epdOf = (fen: string): string => fen.split(' ').slice(0, 4).join(' ')

export function lookupOpening(epd: string): Opening | undefined {
  return Object.hasOwn(OPENINGS, epd) ? OPENINGS[epd] : undefined
}

/** B.3 step 2: ply i is Book when every ply <= i has its `after` EPD in the table (a contiguous prefix from the
 *  standard start; never for a custom start). Returns the length of that prefix and the last matched opening. */
export function bookPrefix(
  moves: GameMove[],
  customStart: boolean,
): { bookPlies: number; opening?: Opening & { lastBookPly: number } } {
  if (customStart) return { bookPlies: 0 }
  let bookPlies = 0
  let opening: (Opening & { lastBookPly: number }) | undefined
  for (const m of moves) {
    const hit = lookupOpening(epdOf(m.after))
    if (!hit) break
    bookPlies++
    opening = { eco: hit.eco, name: hit.name, lastBookPly: m.ply }
  }
  return opening ? { bookPlies, opening } : { bookPlies }
}
