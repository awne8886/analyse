// Motif detectors (PROMPT.md Appendix E.1). Phase 0 stub: bodies throw until impl-explain lands.
import type { Chess, Color, Square } from 'chess.js'

const notImplemented = (..._args: unknown[]): never => {
  void _args
  throw new Error('not implemented')
}

export const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 }
export function withTurn(chess: Chess, color: Color): Chess {
  return notImplemented(chess, color)
}
export function isDefended(chess: Chess, square: Square): boolean {
  return notImplemented(chess, square)
}
export function isHanging(chess: Chess, square: Square): boolean {
  return notImplemented(chess, square)
}
export function canBeTakenByLowerPiece(chess: Chess, square: Square): boolean {
  return notImplemented(chess, square)
}
export function isInBadSpot(chess: Chess, square: Square): boolean {
  return notImplemented(chess, square)
}
export function see(chess: Chess, square: Square, color: Color): number {
  return notImplemented(chess, square, color)
}
export function enPrise(chess: Chess, square: Square): boolean {
  return notImplemented(chess, square)
}
export function detectFork(after: Chess, to: Square): { type: 'fork'; by: Square; targets: Square[] } | null {
  return notImplemented(after, to)
}
export function detectPinsAndSkewers(
  chess: Chess,
  color: Color,
): Array<{
  type: 'pin' | 'skewer'
  absolute?: boolean
  by: Square
  pinned?: Square
  to?: Square
  front?: Square
  behind?: Square
}> {
  return notImplemented(chess, color)
}
export function detectDiscovered(
  before: Chess,
  after: Chess,
  mv: { from: Square; to: Square; color: Color },
): Array<{ type: 'discoveredAttack' | 'discoveredCheck'; target: Square; by: Square[] }> {
  return notImplemented(before, after, mv)
}
export function matesInOneIfPass(after: Chess, mover: Color): string | null {
  return notImplemented(after, mover)
}
export function isTrapped(chess: Chess, square: Square): boolean {
  return notImplemented(chess, square)
}
export function backRankWeak(chess: Chess, color: Color): boolean {
  return notImplemented(chess, color)
}
export function materialCount(chess: Chess, color: Color): number {
  return notImplemented(chess, color)
}
export function materialDiff(chess: Chess, color: Color): number {
  return notImplemented(chess, color)
}
