// Public entry point of src/import (PROMPT.md section 4.5). Phase 0 stub: bodies throw until impl-import lands.
import type { Chess, Move } from 'chess.js'
import type { ImportedGame, ImportResult, ParsedInput } from '../types/game'

export interface TcnMove {
  from?: string
  to: string
  promotion?: string
  drop?: string
}
export interface ImportOptions {
  username?: string
  deployTarget: 'vercel' | 'pages'
  proxyUrl?: string
  /** progress / notice callback for non-error strings shown while importing (P-2, P-8, I-27 first line) */
  onStatus?: (key: string, message: string) => void
}

const notImplemented = (..._args: unknown[]): never => {
  void _args
  throw new Error('not implemented')
}

export function parseInput(text: string): ParsedInput {
  return notImplemented(text)
}
export function importGame(parsed: ParsedInput, opts: ImportOptions): Promise<ImportResult> {
  return notImplemented(parsed, opts)
}
export function confirmInProgress(game: ImportedGame): ImportedGame {
  return notImplemented(game)
}
export function decodeTcn(tcn: string): TcnMove[] {
  return notImplemented(tcn)
}
export function applyTcnMove(chess: Chess, m: TcnMove): Move {
  return notImplemented(chess, m)
}
/** Decodes a whole TCN move list from `initialFen` (standard start when omitted) and returns the verbose
 *  chess.js history (san, lan, before, after). Throws an ImportError-shaped Error (code decode_failed, detail.n)
 *  on an illegal move, and rejects drops (variant_unsupported). */
export function tcnToMoves(tcn: string, initialFen?: string): Move[] {
  return notImplemented(tcn, initialFen)
}
/** Keyed by the Appendix F row key: 'I-2', 'I-4', ..., 'I-27', 'I-27b' (second I-27 sentence), 'I-36', 'I-37',
 *  'P-1' ... 'P-11'. Alternation placeholders are named: I-10a {kind}, I-14 {variant}, I-28 {what}; the rest keep
 *  the appendix names ({plyCount}, {n}, {type}, {White}, {Black}, {date}, {id}, {username}, {YYYY}, {MM}, {months}). */
export const IMPORT_STRINGS: Record<string, string> = {}
