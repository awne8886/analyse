// Shared contracts (PROMPT.md Appendix B.0 and E.2). Frozen after Phase 0: implementers never edit this file.
import type { Score } from './engine'
import type { Classification } from './review'

export interface Arrow {
  from: string
  to: string
  kind: 'played' | 'best' | 'reply' | 'threat'
}
export interface Explanation {
  headline: string
  sentences: string[]
  bestLine?: string
  arrows: Arrow[]
  highlights: string[]
  reasonCode: string
}
export type Voice = 'personal' | 'impersonal'

export interface MoveFacts {
  ply: number
  color: 'w' | 'b'
  san: string
  uci: string
  piece: string
  from: string
  to: string
  captured?: string
  promotion?: string
  isCheck: boolean
  isMate: boolean
  isUserMove: boolean
  classification: Classification
  reasonCode: string
  povBefore: Score // mover's perspective (read from PlyReview; facts.ts negates nothing)
  povAfter: Score
  winBefore: number
  winAfter: number
  loss: number
  bestSan: string | null
  bestPv: string[] // SAN, from the position before the move, max 8 plies
  bestMaterialGain: number // mover POV, pawn units, from replaying bestPv
  bestLeadsToMateIn?: number // positive = mate for the mover
  playedPv: string[] // SAN from the position after the move; replySan = playedPv[0]
  replySan?: string
  playedMaterialLoss: number // mover POV, pawn units, from replaying playedPv
  replyIsMate: boolean // opponent has mate in 1 after the move
  opponentMateIn?: number // forced mate against the mover after the move
  mateBefore?: number // mover POV mate distances when the scores are mates
  mateAfter?: number
  gapToSecondBest?: { winPct: number; cp?: number }
  legalMoveCount: number
  motifsPlayed: Motif[]
  motifsAllowed: Motif[]
  motifsBest: Motif[]
  opening?: { eco: string; name: string; isNewName: boolean }
  depthReached: number
  depthTarget: number
  previous?: { classification: Classification; san: string; loss: number; opponentGain: number }
}
export type Motif =
  | { type: 'fork'; by: string; targets: string[] }
  | { type: 'pin'; absolute: boolean; by: string; pinned: string; to: string }
  | { type: 'skewer'; by: string; front: string; behind: string }
  | { type: 'discoveredAttack' | 'discoveredCheck'; target: string; by: string[] }
  | { type: 'mateThreat'; san: string }
  | { type: 'hangs'; squares: string[] }
  | { type: 'freePiece'; square: string }
  | { type: 'sacrifice'; square: string; value: number }
  | { type: 'trapped'; square: string }
  | {
      type:
        | 'passedPawn'
        | 'promotion'
        | 'castleKing'
        | 'castleQueen'
        | 'develops'
        | 'recapture'
        | 'equalTrade'
        | 'kicks'
        | 'winsTempo'
        | 'defends'
        | 'backRankWeak'
    }
