// Public entry point of src/analysis (PROMPT.md section 4.5). Phase 0 stub: bodies throw until impl-analysis lands.
import type { EngineApi, EngineProfile, PositionEval, Score } from '../types/engine'
import type { GameMove, ImportedGame } from '../types/game'
import type { Classification, GameReview, PlyReview } from '../types/review'
import type { Explanation, Voice } from '../types/explain'
import { REVIEW_CONFIG, type AccuracyPreset } from './config'

export { REVIEW_CONFIG }
export { LICHESS_PRESET, clamp } from './config'

export interface ClassifyContext {
  /** The played move as the importer produced it (uci, color, before, after, captured, promotion, terminal). */
  move: GameMove
  /** Evaluation of the position before the move (position k), White perspective, lines[0] and lines[1]. */
  before: PositionEval
  /** Evaluation of the position after the move (position k+1), White perspective. For a terminal move
   *  analyzeGame synthesises it with `terminal` set and `lines: []`. */
  after: PositionEval
  /** True when every ply up to and including this one is in the opening table (always false for a custom start). */
  isBook: boolean
  /** The opponent's previous ply, in the OPPONENT's own perspective (absent for the first move of the game).
   *  Its loss is the mover's gain; the mover's preMistakeWin is 100 - previous.winBefore. */
  previous?: { winBefore: number; winAfter: number; uci: string; to: string; captured?: string }
}
export interface ClassifyResult {
  classification: Classification
  reasonCode: string
  winBefore: number // mover POV
  winAfter: number // mover POV
  loss: number // win% points, >= 0
}
export interface AccuracyInput {
  color: 'w' | 'b'
  loss: number
  classification?: Classification // book and forced count as 100
  notAnalysed?: boolean // excluded
}
export interface RatingInput {
  rating?: number // the side's own WhiteElo / BlackElo
  accuracy: number
  acpl: number
  moveCount: number
}
export interface AnalyzeOptions {
  onPly?: (ply: PlyReview, review: GameReview) => void
  onProgress?: (p: { done: number; total: number; etaMs: number | null; refining: number }) => void
  signal?: AbortSignal
  resumeFrom?: GameReview
  /** Builds the explanation of a finished ply (wired by the UI to src/explain); a blank one is stored without it. */
  explainPly?: (review: GameReview, ply: number) => Explanation
}

const notImplemented = (..._args: unknown[]): never => {
  void _args
  throw new Error('not implemented')
}

/** Win% of a score from the perspective it is expressed in (B.2 curve; mate 0 = side to move mated = 0). */
export function winPct(score: Score): number {
  return notImplemented(score)
}
/** White-perspective win% of a PositionEval or a White-perspective Score; a checkmate terminal gives
 *  stmOf(fen) === 'b' ? 100 : 0 (B.2). */
export function winPctWhite(ev: PositionEval | Score, fen: string): number {
  return notImplemented(ev, fen)
}
export function classifyPly(ctx: ClassifyContext): ClassifyResult {
  return notImplemented(ctx)
}
export function moveAccuracy(loss: number, preset?: AccuracyPreset): number {
  return notImplemented(loss, preset)
}
/** Unrounded game accuracy per colour (display rounds to one decimal). `whiteWinSeries` (white-POV win% of
 *  positions 0..N) is required by the lichess preset only. */
export function gameAccuracy(
  moves: AccuracyInput[],
  opts?: { preset?: AccuracyPreset; whiteWinSeries?: number[] },
): { white?: number; black?: number } {
  return notImplemented(moves, opts)
}
export function estimateRating(input: RatingInput): {
  value?: number
  method: 'regression' | 'acpl' | 'none'
} {
  return notImplemented(input)
}
/** Lichess Divider over the boards before each ply (`beforeFens[i]` is the board before ply i + 1); the result
 *  is an index into that array. */
export function dividePhases(beforeFens: string[]): { middlegame?: number; endgame?: number } {
  return notImplemented(beforeFens)
}
export function majorsAndMinors(fen: string): number {
  return notImplemented(fen)
}
export function backrankSparse(fen: string): boolean {
  return notImplemented(fen)
}
export function mixedness(fen: string): number {
  return notImplemented(fen)
}
/** Key-moment ply numbers (PlyReview.ply), in ply order (B.10). */
export function keyMoments(plies: PlyReview[]): number[] {
  return notImplemented(plies)
}
export function lookupOpening(epd: string): { eco: string; name: string } | undefined {
  return notImplemented(epd)
}
export function analyzeGame(
  game: ImportedGame,
  engine: EngineApi,
  profile: EngineProfile,
  opts: AnalyzeOptions,
): Promise<GameReview> {
  return notImplemented(game, engine, profile, opts)
}
export function summarySentence(review: GameReview, userColor: 'w' | 'b', voice: Voice): string {
  return notImplemented(review, userColor, voice)
}
