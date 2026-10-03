// Types of the src/analysis public API (re-exported by index.ts).
import type { PositionEval } from '../types/engine'
import type { GameMove } from '../types/game'
import type { Classification, GameReview, PlyReview } from '../types/review'
import type { Explanation } from '../types/explain'

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
