// The importer's single chess.js replay of a game: every move is validated by chess.js, the terminal state after
// each move is read from the same instance (repetition needs the move history), and the verbose history is read
// once at the end (calling history() per move is quadratic).
import { Chess, type Move } from 'chess.js'
import type { GameMove } from '../types/game'
import { ImportFailure } from './errors'

export const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export type Terminal = NonNullable<GameMove['terminal']>
export interface Replay {
  startFen: string
  moves: Move[]
  terminals: (Terminal | undefined)[]
}

/** The first four FEN fields (placement, side to move, castling, en passant). */
export const fen4 = (fen: string): string => fen.trim().split(/\s+/).slice(0, 4).join(' ')

export const isCustomStart = (fen: string): boolean => fen4(fen) !== fen4(STANDARD_FEN)

function terminalOf(chess: Chess): Terminal | undefined {
  if (chess.isCheckmate()) return 'checkmate'
  if (chess.isStalemate()) return 'stalemate'
  if (chess.isInsufficientMaterial()) return 'insufficient'
  if (chess.isThreefoldRepetition()) return 'repetition'
  if (chess.isDrawByFiftyMoves()) return 'fifty'
  return undefined
}

/**
 * Plays `steps` from `startFen` on one chess.js instance. `play` applies one step (a TCN move or a SAN string)
 * and throws on an illegal move; any failure becomes decode_failed with the 1-based ply number (I-11b).
 */
export function replay<T>(
  startFen: string,
  steps: readonly T[],
  play: (chess: Chess, step: T) => void,
): Replay {
  let chess: Chess
  try {
    chess = new Chess(startFen)
  } catch {
    throw new ImportFailure('decode_failed', { n: 1 })
  }
  const start = chess.fen()
  const terminals: (Terminal | undefined)[] = []
  steps.forEach((step, i) => {
    try {
      play(chess, step)
    } catch (e) {
      if (e instanceof ImportFailure) throw e
      throw new ImportFailure('decode_failed', { n: i + 1 })
    }
    terminals.push(terminalOf(chess))
  })
  return { startFen: start, moves: chess.history({ verbose: true }), terminals }
}

/** Plays one SAN move (PGN and lichess move lists); castling written with zeros is accepted. */
export function playSan(chess: Chess, san: string): void {
  chess.move(san.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O'))
}

/** chess.js verbose moves to the shared `GameMove` records (ply is 1-based). */
export function toGameMoves(r: Replay): GameMove[] {
  return r.moves.map((m, i) => {
    const g: GameMove = {
      ply: i + 1,
      color: m.color,
      san: m.san,
      uci: m.lan,
      from: m.from,
      to: m.to,
      piece: m.piece,
      before: m.before,
      after: m.after,
    }
    if (m.captured) g.captured = m.captured
    if (m.promotion) g.promotion = m.promotion
    const terminal = r.terminals[i]
    if (terminal) g.terminal = terminal
    return g
  })
}
