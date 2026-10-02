// Hand-written GameReview fixtures for the UI tests (Phase 2: no engine, no analysis module). One 12-ply game
// whose plies carry all 11 classifications; the moves are real (replayed with chess.js) so the board renders.
import { Chess } from 'chess.js'
import type { Score } from '../types/engine'
import type { GameMove, ImportedGame } from '../types/game'
import { CLASSIFICATIONS, type Classification, type GameReview, type PlyReview } from '../types/review'

export const FIXTURE_SANS = [
  'e4',
  'e5',
  'Nf3',
  'Nc6',
  'Bc4',
  'Nf6',
  'Ng5',
  'd5',
  'exd5',
  'Nxd5',
  'Nxf7',
  'Kxf7',
]
/** ply k (1-based) has FIXTURE_CLASSES[k - 1]: every classification appears at least once */
export const FIXTURE_CLASSES: Classification[] = [
  'book',
  'book',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
  'brilliant',
  'forced',
]
/** White-perspective evals of positions 0..12 (position 10 is a mate for White, position 12 off the scale) */
export const FIXTURE_EVALS: Score[] = [
  { type: 'cp', value: 20 },
  { type: 'cp', value: 30 },
  { type: 'cp', value: 25 },
  { type: 'cp', value: 35 },
  { type: 'cp', value: 30 },
  { type: 'cp', value: 130 },
  { type: 'cp', value: -80 },
  { type: 'cp', value: 40 },
  { type: 'cp', value: 250 },
  { type: 'cp', value: 120 },
  { type: 'mate', value: 3 },
  { type: 'cp', value: 900 },
  { type: 'cp', value: -1200 },
]

export function fixtureGame(overrides: Partial<ImportedGame> = {}): ImportedGame {
  const chess = new Chess()
  const moves: GameMove[] = FIXTURE_SANS.map((san, i) => {
    const m = chess.move(san)
    return {
      ply: i + 1,
      color: m.color,
      san: m.san,
      uci: m.lan,
      from: m.from,
      to: m.to,
      piece: m.piece,
      captured: m.captured,
      promotion: m.promotion,
      before: m.before,
      after: m.after,
    }
  })
  return {
    id: 'cc:live:129688175007',
    site: 'chesscom',
    kind: 'live',
    sourceUrl: 'https://www.chess.com/game/live/129688175007',
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    customStart: false,
    moves,
    white: { name: 'Arystanner', rating: 3015, avatarUrl: 'https://images.chesscomfiles.com/x.png' },
    black: { name: 'Hikaru', rating: 3282, title: 'GM' },
    result: '1-0',
    date: '2025.01.04',
    inProgress: false,
    ...overrides,
  }
}

const zeroTally = (): Record<Classification, number> =>
  Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as Record<Classification, number>

export function fixtureReview(game: ImportedGame = fixtureGame(), pendingFrom?: number): GameReview {
  const plies: PlyReview[] = game.moves.map((m, i) => {
    const classification = FIXTURE_CLASSES[i]
    const next = game.moves[i + 1]
    const pending = pendingFrom !== undefined && m.ply >= pendingFrom
    return {
      ply: m.ply,
      color: m.color,
      san: m.san,
      uci: m.uci,
      before: m.before,
      after: m.after,
      status: pending ? 'pending' : 'done',
      evalBefore: FIXTURE_EVALS[i],
      evalAfter: FIXTURE_EVALS[i + 1],
      winBefore: 50,
      winAfter: 50,
      loss: 0,
      bestUci: m.ply === 8 ? 'd7d6' : m.uci,
      bestSan: m.ply === 8 ? 'd6' : m.san,
      bestPv: m.ply === 8 ? ['d7d6'] : [m.uci],
      playedLine: next
        ? { multipv: 2, depth: 16, score: FIXTURE_EVALS[i + 1], pv: [m.uci, next.uci] }
        : undefined,
      classification,
      reasonCode: 'fixture',
      accuracy: 90,
      depth: 16,
      multiPv: 2,
      phase: 'opening',
      isKeyMoment: [10, 11].includes(m.ply),
      explanation: {
        headline: `${m.san} is ${classification}`,
        sentences: [`Fixture sentence for ply ${m.ply}.`],
        bestLine: m.ply === 8 ? 'Best was d6' : undefined,
        arrows: m.ply === 8 ? [{ from: 'c8', to: 'g4', kind: 'threat' }] : [],
        highlights: m.ply === 8 ? ['h7'] : [],
        reasonCode: 'fixture',
      },
    }
  })
  const tally = { white: zeroTally(), black: zeroTally() }
  for (const p of plies)
    if (p.status === 'done') tally[p.color === 'w' ? 'white' : 'black'][p.classification] += 1
  return {
    gameId: game.id,
    schema: 1,
    engine: {
      name: 'Stockfish 19 Lite WASM',
      build: 'lite-single',
      tier: 'standard-16',
      depth: 16,
      multiPv: 2,
    },
    plies,
    complete: pendingFrom === undefined,
    notAnalysed: [],
    accuracy: { white: 87.04, black: 71.96 },
    phaseAccuracy: { white: { opening: 91.2, middlegame: 64 }, black: { opening: 38 } },
    phaseStarts: { middlegame: 8 },
    tally,
    rating: { white: 2850, black: 2600, method: 'regression' },
    keyMoments: [10, 11],
    opening: { eco: 'C57', name: 'Italian Game: Two Knights Defense, Fried Liver Attack', lastBookPly: 2 },
    summary: 'White played with 87% accuracy: 1 brilliant.',
    createdAt: 1,
  }
}
