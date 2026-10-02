// Public entry point of src/explain (PROMPT.md section 4.5). Phase 0 stub: bodies throw until impl-explain lands.
import type { GameReview } from '../types/review'
import type { Explanation, MoveFacts, Voice } from '../types/explain'

const notImplemented = (..._args: unknown[]): never => {
  void _args
  throw new Error('not implemented')
}

/** `ply` is the 1-based PlyReview.ply. */
export function buildMoveFacts(review: GameReview, ply: number, userColor: 'w' | 'b'): MoveFacts {
  return notImplemented(review, ply, userColor)
}
export function explain(facts: MoveFacts, voice: Voice): Explanation {
  return notImplemented(facts, voice)
}
