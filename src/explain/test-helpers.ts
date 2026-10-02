// Test-local builders for src/explain tests: hand-built GameReview / PlyReview objects and MoveFacts.
import { Chess } from 'chess.js'
import type { EngineLine, Score } from '../types/engine'
import type { MoveFacts } from '../types/explain'
import type { Classification, GameReview, PlyReview } from '../types/review'

export interface PlySpec {
  san: string
  classification?: Classification
  reasonCode?: string
  /** White perspective. */
  evalBefore?: Score
  evalAfter?: Score
  winBefore?: number
  winAfter?: number
  loss?: number
  /** UCI; defaults to the played move. */
  bestPv?: string[]
  secondLine?: EngineLine
  playedLine?: EngineLine
  depth?: number
}

const CP0: Score = { type: 'cp', value: 0 }

/** Replays `specs` (SAN) from `startFen` and fills every PlyReview field the explain module reads. */
export function makeReview(
  specs: PlySpec[],
  opts: { startFen?: string; engineDepth?: number; gameId?: string } = {},
): GameReview {
  const board = opts.startFen ? new Chess(opts.startFen) : new Chess()
  const plies: PlyReview[] = specs.map((s, i) => {
    const before = board.fen()
    const m = board.move(s.san)
    const uci = m.from + m.to + (m.promotion ?? '')
    const bestPv = s.bestPv ?? [uci]
    const bestSan = new Chess(before).move({
      from: bestPv[0].slice(0, 2),
      to: bestPv[0].slice(2, 4),
      promotion: bestPv[0][4],
    }).san
    return {
      ply: i + 1,
      color: m.color,
      san: m.san,
      uci,
      before,
      after: board.fen(),
      status: 'done',
      evalBefore: s.evalBefore ?? CP0,
      evalAfter: s.evalAfter ?? CP0,
      winBefore: s.winBefore ?? 50,
      winAfter: s.winAfter ?? 50,
      loss: s.loss ?? 0,
      bestUci: bestPv[0],
      bestSan,
      bestPv,
      secondLine: s.secondLine,
      playedLine: s.playedLine,
      classification: s.classification ?? 'best',
      reasonCode: s.reasonCode ?? 'Test',
      accuracy: 100,
      depth: s.depth ?? 18,
      multiPv: 2,
      phase: 'opening',
      isKeyMoment: false,
      explanation: { headline: '', sentences: [], arrows: [], highlights: [], reasonCode: '' },
    }
  })
  const tally = () =>
    ({
      brilliant: 0,
      great: 0,
      best: 0,
      excellent: 0,
      good: 0,
      book: 0,
      inaccuracy: 0,
      mistake: 0,
      miss: 0,
      blunder: 0,
      forced: 0,
    }) as Record<Classification, number>
  return {
    gameId: opts.gameId ?? 'test',
    schema: 1,
    engine: {
      name: 'Stockfish 19 Lite WASM',
      build: 'lite-single',
      tier: 'standard-16',
      depth: opts.engineDepth ?? 18,
      multiPv: 2,
    },
    plies,
    complete: true,
    notAnalysed: [],
    accuracy: {},
    phaseAccuracy: { white: {}, black: {} },
    phaseStarts: {},
    tally: { white: tally(), black: tally() },
    rating: { method: 'none' },
    keyMoments: [],
    summary: '',
    createdAt: 0,
  }
}

/** Neutral MoveFacts (no proof holds, level evaluation, depth gate open) with overrides. */
export function moveFacts(overrides: Partial<MoveFacts> = {}): MoveFacts {
  return {
    ply: 20,
    color: 'w',
    san: 'Nf3',
    uci: 'g1f3',
    piece: 'n',
    from: 'g1',
    to: 'f3',
    isCheck: false,
    isMate: false,
    isUserMove: false,
    classification: 'good',
    reasonCode: 'Test',
    povBefore: CP0,
    povAfter: CP0,
    winBefore: 50,
    winAfter: 50,
    loss: 0,
    bestSan: 'Nc3',
    bestPv: ['Nc3'],
    bestMaterialGain: 0,
    playedPv: [],
    playedMaterialLoss: 0,
    replyIsMate: false,
    legalMoveCount: 30,
    motifsPlayed: [],
    motifsAllowed: [],
    motifsBest: [],
    depthReached: 18,
    depthTarget: 18,
    ...overrides,
  }
}
