// Shared contracts (PROMPT.md Appendix B.0). Frozen after Phase 0: implementers never edit this file.
import type { EngineLine, Score, Tier } from './engine'
import type { Explanation } from './explain'

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder'
  | 'forced'
export const CLASSIFICATIONS: Classification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
  'forced',
]
export type Phase = 'opening' | 'middlegame' | 'endgame'
export interface PlyReview {
  ply: number
  color: 'w' | 'b'
  san: string
  uci: string
  before: string
  after: string
  status: 'pending' | 'refining' | 'done' | 'not-analysed'
  evalBefore: Score // White's perspective
  evalAfter: Score // White's perspective
  winBefore: number // mover's perspective, win% points
  winAfter: number
  loss: number
  bestUci: string | null
  bestSan: string | null
  bestPv: string[]
  secondLine?: EngineLine
  playedLine?: EngineLine
  classification: Classification
  reasonCode: string
  accuracy: number
  depth: number
  multiPv: 1 | 2
  phase: Phase
  isKeyMoment: boolean
  explanation: Explanation
}
export interface GameReview {
  gameId: string
  schema: number // schema = 1; bump on any change to this shape
  engine: { name: string; build: 'lite-single' | 'lite'; tier: Tier; depth: number; multiPv: 1 | 2 }
  plies: PlyReview[]
  complete: boolean
  notAnalysed: number[]
  accuracy: { white?: number; black?: number }
  phaseAccuracy: Record<'white' | 'black', Partial<Record<Phase, number>>> // absent when < 4 moves in the phase
  phaseStarts: { middlegame?: number; endgame?: number } // ply index
  tally: Record<'white' | 'black', Record<Classification, number>>
  rating: { white?: number; black?: number; method: 'regression' | 'acpl' | 'none' }
  keyMoments: number[]
  opening?: { eco: string; name: string; lastBookPly: number }
  summary: string
  createdAt: number
}
