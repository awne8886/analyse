// Test-local helpers for src/analysis (Phase 2: never src/engine/mock, never Stockfish).
import { Chess } from 'chess.js'
import type { EngineApi, EngineLine, EngineProfile, PositionEval, Score, SearchLimits } from '../types/engine'
import type { GameMove, ImportedGame } from '../types/game'

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
export const cp = (value: number): Score => ({ type: 'cp', value })
export const mate = (value: number): Score => ({ type: 'mate', value })

/** Replays SAN moves on one chess.js instance the way the importer does, including the terminal flag. */
export function makeGame(
  sans: string[],
  opts: {
    startFen?: string
    customStart?: boolean
    id?: string
    whiteRating?: number
    blackRating?: number
  } = {},
): ImportedGame {
  const startFen = opts.startFen ?? START_FEN
  const chess = new Chess(startFen)
  const moves: GameMove[] = sans.map((san, i) => {
    const m = chess.move(san)
    const terminal: GameMove['terminal'] = chess.isCheckmate()
      ? 'checkmate'
      : chess.isStalemate()
        ? 'stalemate'
        : chess.isInsufficientMaterial()
          ? 'insufficient'
          : chess.isThreefoldRepetition()
            ? 'repetition'
            : chess.isDrawByFiftyMoves()
              ? 'fifty'
              : undefined
    return {
      ply: i + 1,
      color: m.color,
      san: m.san,
      uci: m.lan,
      from: m.from,
      to: m.to,
      piece: m.piece,
      ...(m.captured ? { captured: m.captured } : {}),
      ...(m.promotion ? { promotion: m.promotion } : {}),
      before: m.before,
      after: m.after,
      ...(terminal ? { terminal } : {}),
    }
  })
  return {
    id: opts.id ?? 'pgn:test',
    site: 'pgn',
    startFen,
    customStart: opts.customStart ?? startFen !== START_FEN,
    moves,
    white: { name: 'W', ...(opts.whiteRating !== undefined ? { rating: opts.whiteRating } : {}) },
    black: { name: 'B', ...(opts.blackRating !== undefined ? { rating: opts.blackRating } : {}) },
    result: '*',
    inProgress: false,
  }
}

/** A PositionEval with White-perspective lines `[uci, score]`, truncated to the requested MultiPV. */
export function lineEval(
  fen: string,
  lines: [string, Score][],
  multiPv: 1 | 2 = 2,
  depth = 16,
): PositionEval {
  const kept: EngineLine[] = lines
    .slice(0, multiPv)
    .map(([uci, score], i) => ({ multipv: i + 1, depth, score, pv: [uci] }))
  return { fen, lines: kept, depth, multiPv, bestmove: kept[0]?.pv[0] ?? null }
}

/** A legal move of `fen` other than `uci` (UCI notation). */
export function otherMove(fen: string, uci: string): string {
  const m = new Chess(fen).moves({ verbose: true }).find((x) => x.lan !== uci)
  if (!m) throw new Error(`no alternative to ${uci} in ${fen}`)
  return m.lan
}

export const fen4 = (fen: string): string => fen.split(' ').slice(0, 4).join(' ')

type EvalFn = (fen: string, limits: SearchLimits) => PositionEval

/** Fake EngineApi: answers from `evalFn`. Automatic mode resolves each request on a microtask; manual mode holds
 *  requests until `releaseNext()` resolves the oldest one. Records every request. */
export class FakeEngine implements EngineApi {
  readonly calls: { fen: string; limits: SearchLimits; jobId: number }[] = []
  readonly stats = { workersCreated: 0, uciSent: 0 }
  stopCalls = 0
  private readonly evalFn: EvalFn
  private readonly manual: boolean
  private readonly held: (() => void)[] = []

  constructor(evalFn: EvalFn, manual = false) {
    this.evalFn = evalFn
    this.manual = manual
  }
  async init(_profile: EngineProfile): Promise<void> {
    void _profile
  }
  evaluate(fen: string, limits: SearchLimits, jobId: number): Promise<PositionEval> {
    this.calls.push({ fen, limits, jobId })
    if (!this.manual) return Promise.resolve().then(() => this.evalFn(fen, limits))
    return new Promise((resolve) => this.held.push(() => resolve(this.evalFn(fen, limits))))
  }
  releaseNext(): void {
    const next = this.held.shift()
    if (!next) throw new Error('FakeEngine: nothing held')
    next()
  }
  get heldCount(): number {
    return this.held.length
  }
  async stop(): Promise<void> {
    this.stopCalls++
  }
  dispose(): void {}
}

const limitsOf = (multiPv: 1 | 2): SearchLimits => ({ depth: 16, movetimeMs: 1500, multiPv })
export const DESKTOP_PROFILE: EngineProfile = {
  build: 'lite-single',
  workers: 1,
  threads: 1,
  hashMb: 64,
  multiPv: 2,
  limits: limitsOf(2),
  tier: 'standard-16',
}
export const PHONE_PROFILE: EngineProfile = {
  build: 'lite-single',
  workers: 1,
  threads: 1,
  hashMb: 16,
  multiPv: 1,
  limits: { depth: 16, movetimeMs: 400, multiPv: 1 },
  tier: 'auto-16',
}

/** Lets pending microtasks and promise chains settle. */
export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
