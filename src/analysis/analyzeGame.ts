// R15, R16: the forwards analysis pipeline over an EngineApi. Positions 0..N are dispatched in ply order (the
// pool deals them to idle workers and serves cached positions); ply k is classified once positions k and k + 1
// have arrived; terminal positions are synthesised and never evaluated; on phones (MultiPV 1 pass) candidate plies
// get one MultiPV 2 re-search, awaited before their final label.
import { Chess } from 'chess.js'
import type { EngineApi, EngineProfile, PositionEval, Score } from '../types/engine'
import type { Explanation } from '../types/explain'
import type { GameMove, ImportedGame } from '../types/game'
import {
  CLASSIFICATIONS,
  type Classification,
  type GameReview,
  type Phase,
  type PlyReview,
} from '../types/review'
import { gameAccuracy, moveAccuracy } from './accuracy'
import { classifyPly, isRefineCandidate } from './classify'
import { REVIEW_CONFIG } from './config'
import { keyMoments } from './keyMoments'
import { bookPrefix } from './openings'
import { dividePhases, phaseOfPly } from './phases'
import { acplCp, estimateRating, moveCpLoss } from './rating'
import { summarySentence } from './summary'
import type { AnalyzeOptions, ClassifyContext, ClassifyResult } from './types'
import { winPctWhite } from './winPercent'

const BLANK_EXPLANATION: Explanation = {
  headline: '',
  sentences: [],
  arrows: [],
  highlights: [],
  reasonCode: '',
}
const SIDES = [
  ['w', 'white'],
  ['b', 'black'],
] as const
let lastJobId = 0

const usable = (ev: PositionEval): boolean =>
  ev.terminal !== undefined || (!ev.notAnalysed && ev.lines.length > 0)
const moverWin = (whiteWin: number, color: 'w' | 'b'): number => (color === 'w' ? whiteWin : 100 - whiteWin)

function uciToSan(fen: string, uci: string | null): string | null {
  if (!uci) return null
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
  } catch {
    return null
  }
}

/** B.3 steps 3 and 4: the position after a game-ending move is scored, not searched. */
function synthesise(move: GameMove, multiPv: 1 | 2): PositionEval {
  const terminal =
    move.terminal === 'checkmate' ? 'checkmate' : move.terminal === 'stalemate' ? 'stalemate' : 'draw'
  return { fen: move.after, lines: [], depth: 0, multiPv, bestmove: null, terminal }
}

function pendingPly(m: GameMove, phase: Phase, multiPv: 1 | 2): PlyReview {
  return {
    ply: m.ply,
    color: m.color,
    san: m.san,
    uci: m.uci,
    before: m.before,
    after: m.after,
    status: 'pending',
    evalBefore: { type: 'cp', value: 0 },
    evalAfter: { type: 'cp', value: 0 },
    winBefore: 50,
    winAfter: 50,
    loss: 0,
    bestUci: null,
    bestSan: null,
    bestPv: [],
    classification: 'good',
    reasonCode: 'Pending',
    accuracy: 100,
    depth: 0,
    multiPv,
    phase,
    isKeyMoment: false,
    explanation: BLANK_EXPLANATION,
  }
}

/** A ply from its two position evals; `res` is null for a ply that cannot be classified ("not analysed"). */
function plyFromEvals(
  m: GameMove,
  before: PositionEval,
  after: PositionEval,
  res: ClassifyResult | null,
  status: PlyReview['status'],
  phase: Phase,
): PlyReview {
  const top = before.lines[0]
  const evalAfter: Score =
    m.terminal === 'checkmate'
      ? { type: 'mate', value: 0 }
      : m.terminal
        ? { type: 'cp', value: 0 }
        : (after.lines[0]?.score ?? { type: 'cp', value: 0 })
  const bestUci = top?.pv[0] ?? before.bestmove ?? null
  const second = before.lines[1]
  const played = before.lines.find((l) => l.pv[0] === m.uci)
  const winBefore = res?.winBefore ?? (usable(before) ? moverWin(winPctWhite(before, m.before), m.color) : 50)
  const winAfter = res?.winAfter ?? (usable(after) ? moverWin(winPctWhite(evalAfter, m.after), m.color) : 50)
  const classification: Classification = res?.classification ?? 'good'
  const loss = res?.loss ?? 0
  return {
    ...pendingPly(m, phase, before.multiPv),
    status,
    evalBefore: top?.score ?? { type: 'cp', value: 0 },
    evalAfter,
    winBefore,
    winAfter,
    loss,
    bestUci,
    bestSan: uciToSan(m.before, bestUci),
    bestPv: top?.pv ?? [],
    ...(second ? { secondLine: second } : {}),
    ...(played ? { playedLine: played } : {}),
    classification,
    reasonCode: res?.reasonCode ?? 'NotAnalysed',
    accuracy: classification === 'book' || classification === 'forced' ? 100 : moveAccuracy(loss),
    depth: after.terminal ? before.depth : Math.min(before.depth, after.depth),
  }
}

/** Recomputes every aggregate of the review from its plies (only `done` plies count). */
function aggregate(review: GameReview, game: ImportedGame): GameReview {
  const done = review.plies.filter((p) => p.status === 'done')
  const input = (p: PlyReview) => ({ color: p.color, loss: p.loss, classification: p.classification })
  const accuracy = gameAccuracy(done.map(input))
  const phaseAccuracy: GameReview['phaseAccuracy'] = { white: {}, black: {} }
  const tally = {} as GameReview['tally']
  const rating: GameReview['rating'] = { method: 'none' }
  for (const [color, side] of SIDES) {
    const mine = done.filter((p) => p.color === color)
    for (const phase of ['opening', 'middlegame', 'endgame'] as const) {
      const inPhase = mine.filter((p) => p.phase === phase)
      if (inPhase.length >= REVIEW_CONFIG.phaseMinMoves)
        phaseAccuracy[side][phase] = gameAccuracy(inPhase.map(input))[side]
    }
    tally[side] = Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as Record<Classification, number>
    for (const p of mine) tally[side][p.classification]++
    const cpLosses = mine.map((p) =>
      p.classification === 'book' || p.classification === 'forced'
        ? 0
        : moveCpLoss(acplCp(p.evalBefore, p.before), acplCp(p.evalAfter, p.after), color),
    )
    const own = game[side].rating
    const est = estimateRating({
      ...(own !== undefined ? { rating: own } : {}),
      accuracy: accuracy[side] ?? 0,
      acpl: cpLosses.length ? cpLosses.reduce((s, x) => s + x, 0) / cpLosses.length : 0,
      moveCount: mine.length,
    })
    if (est.value !== undefined) rating[side] = est.value
    if (est.method === 'regression' || (est.method === 'acpl' && rating.method === 'none'))
      rating.method = est.method
  }
  const moments = keyMoments(review.plies)
  const plies = review.plies.map((p) => {
    const isKeyMoment = moments.includes(p.ply)
    return p.isKeyMoment === isKeyMoment ? p : { ...p, isKeyMoment }
  })
  const next: GameReview = {
    ...review,
    plies,
    complete: plies.every((p) => p.status === 'done' || p.status === 'not-analysed'),
    notAnalysed: plies.filter((p) => p.status === 'not-analysed').map((p) => p.ply),
    accuracy,
    phaseAccuracy,
    tally,
    rating,
    keyMoments: moments,
  }
  // GameReview.summary carries the neutral White sentence; the UI calls summarySentence for the user's colour
  return { ...next, summary: summarySentence(next, 'w', 'impersonal') }
}

export async function analyzeGame(
  game: ImportedGame,
  engine: EngineApi,
  profile: EngineProfile,
  opts: AnalyzeOptions,
): Promise<GameReview> {
  const { signal } = opts
  signal?.throwIfAborted()
  const moves = game.moves
  const n = moves.length
  const phaseStarts = dividePhases(moves.map((m) => m.before))
  const { bookPlies, opening } = bookPrefix(moves, game.customStart)
  const resume = opts.resumeFrom?.gameId === game.id ? opts.resumeFrom : undefined
  const todo: number[] = []
  const plies = moves.map((m, i) => {
    const phase = phaseOfPly(m.ply, phaseStarts)
    const old = resume?.plies[i]
    if (
      old &&
      old.ply === m.ply &&
      old.uci === m.uci &&
      (old.status === 'done' || old.status === 'not-analysed')
    )
      return old.phase === phase ? old : { ...old, phase }
    todo.push(i)
    return pendingPly(m, phase, profile.multiPv)
  })
  let review = aggregate(
    {
      gameId: game.id,
      schema: 1,
      engine: {
        name: profile.build === 'lite' ? 'Stockfish 19 Lite WASM Multithreaded' : 'Stockfish 19 Lite WASM',
        build: profile.build,
        tier: profile.tier,
        depth: profile.limits.depth,
        multiPv: profile.multiPv,
      },
      plies,
      complete: false,
      notAnalysed: [],
      accuracy: {},
      phaseAccuracy: { white: {}, black: {} },
      phaseStarts,
      tally: { white: {}, black: {} } as GameReview['tally'],
      rating: { method: 'none' },
      keyMoments: [],
      ...(opening ? { opening } : {}),
      summary: '',
      createdAt: resume?.createdAt ?? Date.now(),
    },
    game,
  )
  if (!todo.length) return review

  // Dispatch every needed position (k and k + 1 of each ply to do) in ply order, terminal ones synthesised.
  const jobId = ++lastJobId
  const fenAt = (k: number): string => (k < n ? moves[k].before : moves[n - 1].after)
  const needed = [...new Set(todo.flatMap((i) => [i, i + 1]))].sort((a, b) => a - b)
  const positions = new Map<number, Promise<PositionEval>>()
  const started = Date.now()
  let done = 0
  let total = 0
  let refining = 0
  const progress = (): void =>
    opts.onProgress?.({
      done,
      total,
      etaMs: done ? Math.round(((Date.now() - started) / done) * (total - done + refining)) : null,
      refining,
    })
  for (const k of needed) {
    if (k === n && moves[n - 1].terminal) {
      positions.set(k, Promise.resolve(synthesise(moves[n - 1], profile.multiPv)))
      continue
    }
    const p = engine.evaluate(fenAt(k), profile.limits, jobId)
    total++
    p.then(
      () => {
        done++
        if (!signal?.aborted) progress()
      },
      () => undefined,
    )
    positions.set(k, p)
  }
  progress()

  let rejectAbort: (reason: unknown) => void = () => undefined
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject
  })
  aborted.catch(() => undefined)
  const onAbort = (): void => rejectAbort(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
  signal?.addEventListener('abort', onAbort, { once: true })
  const wait = <T>(p: Promise<T>): Promise<T> => (signal ? Promise.race([p, aborted]) : p)

  const emit = (i: number, ply: PlyReview): void => {
    plies[i] = ply
    review = aggregate({ ...review, plies: [...plies] }, game)
    if (ply.status === 'done' && opts.explainPly) {
      plies[i] = { ...review.plies[i], explanation: opts.explainPly(review, ply.ply) }
      review = { ...review, plies: [...plies] }
    } else plies[i] = review.plies[i]
    opts.onPly?.(review.plies[i], review)
  }

  try {
    for (const i of todo) {
      const m = moves[i]
      const phase = plies[i].phase
      const before = await wait(positions.get(i)!)
      const after = await wait(positions.get(i + 1)!)
      if (!usable(before) || !usable(after)) {
        emit(i, plyFromEvals(m, before, after, null, 'not-analysed', phase))
        continue
      }
      const prev = i > 0 ? plies[i - 1] : undefined
      const ctx: ClassifyContext = {
        move: m,
        before,
        after,
        isBook: i < bookPlies,
        ...(prev?.status === 'done'
          ? {
              previous: {
                winBefore: prev.winBefore,
                winAfter: prev.winAfter,
                uci: prev.uci,
                to: moves[i - 1].to,
                ...(moves[i - 1].captured ? { captured: moves[i - 1].captured } : {}),
              },
            }
          : {}),
      }
      let res = classifyPly(ctx)
      let beforeEval = before
      if (profile.multiPv === 1 && before.multiPv !== 2 && isRefineCandidate(ctx, res)) {
        emit(i, plyFromEvals(m, before, after, res, 'refining', phase))
        refining++
        progress()
        const research = engine.evaluate(m.before, { ...profile.limits, multiPv: 2 }, jobId)
        research.catch(() => undefined)
        const re = await wait(research)
        refining--
        progress()
        if (usable(re) && !re.terminal) {
          beforeEval = re
          res = classifyPly({ ...ctx, before: re })
        }
      }
      emit(i, plyFromEvals(m, beforeEval, after, res, 'done', phase))
    }
  } catch (err) {
    // Cancellation (our signal, or the pool rejecting a request with an AbortError after stop()/dispose() or a
    // newer jobId) ends the run here: completed plies were already emitted through onPly, nothing is marked
    // "not analysed", and the caller gets the AbortError. Any other rejection is an engine failure and propagates.
    if (signal?.aborted) await engine.stop().catch(() => undefined)
    throw err
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
  return review
}
