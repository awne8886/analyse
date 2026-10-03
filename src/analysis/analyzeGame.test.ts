// R15, R16: the forwards pipeline of analyzeGame over a test-local fake EngineApi.
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import type { PositionEval, Score, SearchLimits } from '../types/engine'
import type { ImportedGame } from '../types/game'
import type { GameReview, PlyReview } from '../types/review'
import { analyzeGame, gameAccuracy, latestJobId, nextJobId } from './index'
import {
  cp,
  DESKTOP_PROFILE,
  FakeEngine,
  fen4,
  flush,
  lineEval,
  makeGame,
  mate,
  otherMove,
  PHONE_PROFILE,
} from './test-helpers'

const positionFens = (game: ImportedGame): string[] => [
  ...game.moves.map((m) => m.before),
  game.moves[game.moves.length - 1].after,
]

interface PositionSpec {
  score: Score // White perspective
  best?: boolean // the played move is the engine's line 1 (default true)
  second?: Score // line 2, White perspective (default: 300 cp worse for the side to move)
  notAnalysed?: boolean
}

/** An engine answer per position index: line 1 is the played move (or another legal move when `best` is false),
 *  line 2 another move 300 cp worse for the side to move. */
function scripted(
  game: ImportedGame,
  spec: (k: number) => PositionSpec,
): (fen: string, l: SearchLimits) => PositionEval {
  const fens = positionFens(game)
  return (fen, limits) => {
    const k = fens.findIndex((f) => fen4(f) === fen4(fen))
    if (k < 0) throw new Error(`unexpected position ${fen}`)
    const s = spec(k)
    if (s.notAnalysed)
      return { fen, lines: [], depth: 12, multiPv: limits.multiPv, bestmove: null, notAnalysed: true }
    const played = game.moves[k]?.uci ?? new Chess(fen).moves({ verbose: true })[0].lan
    const top = s.best === false ? otherMove(fen, played) : played
    const sign = fen.split(' ')[1] === 'w' ? 1 : -1
    const second: Score = s.second ?? (s.score.type === 'cp' ? cp(s.score.value - 300 * sign) : cp(0))
    return lineEval(
      fen,
      [
        [top, s.score],
        [otherMove(fen, top), second],
      ],
      limits.multiPv,
    )
  }
}

// 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 with Book disabled, so every ply is classified by the engine rules
const SIX = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']

async function run(
  game: ImportedGame,
  engine: FakeEngine,
  extra: Partial<Parameters<typeof analyzeGame>[3]> = {},
  profile = DESKTOP_PROFILE,
) {
  const emitted: { ply: PlyReview; review: GameReview }[] = []
  const progress: { done: number; total: number; etaMs: number | null; refining: number }[] = []
  const review = await analyzeGame(game, engine, profile, {
    onPly: (ply, r) => emitted.push({ ply, review: r }),
    onProgress: (p) => progress.push(p),
    ...extra,
  })
  return { review, emitted, progress }
}

describe('analyzeGame: forwards pipeline (R16)', () => {
  it('evaluates the before FEN of every ply plus the final position, in ply order, with the profile limits', async () => {
    const game = makeGame(SIX, { customStart: true })
    const engine = new FakeEngine(scripted(game, () => ({ score: cp(20) })))
    const { review } = await run(game, engine)
    expect(engine.calls.map((c) => c.fen)).toEqual(positionFens(game))
    expect(engine.calls.every((c) => c.limits === DESKTOP_PROFILE.limits)).toBe(true)
    expect(new Set(engine.calls.map((c) => c.jobId)).size).toBe(1)
    expect(review.complete).toBe(true)
    expect(review.plies.map((p) => p.status)).toEqual(Array(6).fill('done'))
    expect(review.engine).toEqual({
      name: 'Stockfish 19 Lite WASM',
      build: 'lite-single',
      tier: 'standard-16',
      depth: 16,
      multiPv: 2,
    })
  })

  it('shares one job-id sequence with Retry searches, so an id handed out elsewhere never makes it stale', async () => {
    const retryJob = nextJobId() // e.g. a Retry search while no analysis runs
    expect(latestJobId()).toBe(retryJob)
    const game = makeGame(SIX, { customStart: true })
    const engine = new FakeEngine(scripted(game, () => ({ score: cp(20) })))
    await run(game, engine)
    expect(engine.calls.every((c) => c.jobId > retryJob)).toBe(true)
    expect(latestJobId()).toBe(engine.calls[0].jobId)
  })

  it('classifies ply k as soon as position k + 1 has arrived, and not before', async () => {
    const game = makeGame(SIX, { customStart: true })
    const engine = new FakeEngine(
      scripted(game, () => ({ score: cp(20) })),
      true,
    )
    const done: number[] = []
    const promise = analyzeGame(game, engine, DESKTOP_PROFILE, {
      onPly: (p) => {
        if (p.status === 'done') done.push(p.ply)
      },
    })
    await flush()
    expect(engine.heldCount).toBe(7) // every position is dispatched up front; the pool deals them to its workers
    engine.releaseNext() // position 0
    await flush()
    expect(done).toEqual([])
    for (let k = 1; k <= 6; k++) {
      engine.releaseNext() // position k
      await flush()
      expect(done).toEqual(Array.from({ length: k }, (_, i) => i + 1))
    }
    await promise
  })

  it('reports progress over the positions to evaluate, with an ETA once one has arrived', async () => {
    const game = makeGame(SIX, { customStart: true })
    const { progress } = await run(game, new FakeEngine(scripted(game, () => ({ score: cp(20) }))))
    expect(progress[0]).toEqual({ done: 0, total: 7, etaMs: null, refining: 0 })
    const last = progress[progress.length - 1]
    expect(last.done).toBe(7)
    expect(last.total).toBe(7)
    expect(typeof last.etaMs).toBe('number')
  })

  it('stores the explanation built by explainPly for each finished ply', async () => {
    const game = makeGame(SIX, { customStart: true })
    const seen: number[] = []
    const { review } = await run(game, new FakeEngine(scripted(game, () => ({ score: cp(20) }))), {
      explainPly: (r, ply) => {
        seen.push(ply)
        expect(r.plies[ply - 1].status).toBe('done')
        return { headline: `ply ${ply}`, sentences: [], arrows: [], highlights: [], reasonCode: 'x' }
      },
    })
    expect(seen).toEqual([1, 2, 3, 4, 5, 6])
    expect(review.plies.map((p) => p.explanation.headline)).toEqual(seen.map((n) => `ply ${n}`))
  })

  it('fills every GameReview field: Book prefix and opening, phases, tally, accuracy, rating, summary', async () => {
    const game = makeGame(SIX, { whiteRating: 1500 })
    const { review } = await run(game, new FakeEngine(scripted(game, () => ({ score: cp(20) }))))
    expect(review.plies.map((p) => p.classification)).toEqual(Array(6).fill('book'))
    expect(review.opening).toEqual({ eco: 'C70', name: 'Ruy Lopez: Morphy Defense', lastBookPly: 6 })
    expect(review.phaseStarts).toEqual({})
    expect(review.plies.every((p) => p.phase === 'opening')).toBe(true)
    expect(review.tally.white.book).toBe(3)
    expect(review.tally.black.book).toBe(3)
    expect(review.accuracy).toEqual({ white: 100, black: 100 })
    expect(review.phaseAccuracy).toEqual({ white: {}, black: {} }) // fewer than 4 moves per side
    expect(review.rating).toEqual({ method: 'none' }) // fewer than 10 moves per side
    expect(review.keyMoments).toEqual([])
    expect(review.summary).toBe('White played with 100.0% accuracy and no blunders.')
    expect(review.schema).toBe(1)
    expect(review.gameId).toBe(game.id)
  })
})

describe('analyzeGame: terminal positions are never sent to evaluate (B.3 steps 3 and 4)', () => {
  it("checkmate: fool's mate is classified CheckmateBest from a synthesised eval", async () => {
    const game = makeGame(['f3', 'e5', 'g4', 'Qh4#'], { customStart: true })
    const engine = new FakeEngine(
      // Black to move at position 3 mates in 1; line 2 is a slower mate, so neither Brilliant nor Great applies
      scripted(game, (k) => (k === 3 ? { score: mate(-1), second: mate(-3) } : { score: cp(0) })),
    )
    const { review } = await run(game, engine)
    const finalFen = game.moves[3].after
    expect(engine.calls.map((c) => c.fen)).toEqual(game.moves.map((m) => m.before))
    expect(engine.calls.some((c) => fen4(c.fen) === fen4(finalFen))).toBe(false)
    const last = review.plies[3]
    expect(last.classification).toBe('best')
    expect(last.reasonCode).toBe('CheckmateBest')
    expect(last.evalAfter).toEqual({ type: 'mate', value: 0 })
    expect(last.winAfter).toBe(100)
    expect(review.complete).toBe(true)
  })

  it('stalemate reached from a forced mate is a Blunder (DrawFromWinning) without an engine call', async () => {
    const game = makeGame(['Qg6'], { startFen: '7k/5Q2/5K2/8/8/8/8/8 w - - 0 1' })
    expect(game.moves[0].terminal).toBe('stalemate')
    const engine = new FakeEngine((fen, limits) =>
      lineEval(
        fen,
        [
          ['f7g7', mate(1)],
          ['f7f8', mate(2)],
        ],
        limits.multiPv,
      ),
    )
    const { review } = await run(game, engine)
    expect(engine.calls.map((c) => c.fen)).toEqual([game.moves[0].before])
    expect(review.plies[0].classification).toBe('blunder')
    expect(review.plies[0].reasonCode).toBe('DrawFromWinning')
    expect(review.plies[0].evalAfter).toEqual({ type: 'cp', value: 0 })
  })
})

describe('analyzeGame: phone profile MultiPV 2 re-search (R15)', () => {
  // White-perspective evals of positions 0..6 and whether the played move is line 1; by hand (B.2 curve):
  // ply 1 W Best (candidate); ply 2 B 50 -> 45.4, Good; ply 3 W 54.6 -> 45.4, Inaccuracy; ply 4 B Best
  // (candidate); ply 5 W 45.4 -> 18.7, Blunder; ply 6 B: the opponent's ply raised Black's win% by 26.7
  // (Miss precondition, candidate), 81.3 -> 75.1.
  const SPEC: PositionSpec[] = [
    { score: cp(0) },
    { score: cp(0), best: false },
    { score: cp(50), best: false },
    { score: cp(-50) },
    { score: cp(-50), best: false },
    { score: cp(-400), best: false },
    { score: cp(-300) },
  ]

  it('runs exactly one MultiPV 2 search per candidate ply, at the same depth and movetime, before the final label', async () => {
    const game = makeGame(SIX, { customStart: true })
    const engine = new FakeEngine(scripted(game, (k) => SPEC[k]))
    const { review, emitted, progress } = await run(game, engine, {}, PHONE_PROFILE)
    const main = engine.calls.filter((c) => c.limits.multiPv === 1)
    const research = engine.calls.filter((c) => c.limits.multiPv === 2)
    expect(main.map((c) => c.fen)).toEqual(positionFens(game))
    expect(research.map((c) => c.fen)).toEqual([0, 3, 5].map((i) => game.moves[i].before))
    for (const c of research) expect(c.limits).toEqual({ ...PHONE_PROFILE.limits, multiPv: 2 })
    expect(review.plies.map((p) => p.multiPv)).toEqual([2, 1, 1, 2, 1, 2])
    // candidate plies are emitted as 'refining' (base label) and then 'done'; the others only 'done'
    const statuses = (ply: number) => emitted.filter((e) => e.ply.ply === ply).map((e) => e.ply.status)
    expect(statuses(1)).toEqual(['refining', 'done'])
    expect(statuses(2)).toEqual(['done'])
    expect(statuses(6)).toEqual(['refining', 'done'])
    // the re-search supplies line 2: ply 1 becomes Great (base Best), which a MultiPV 1 search cannot show
    expect(emitted.find((e) => e.ply.ply === 1 && e.ply.status === 'refining')?.ply.classification).toBe(
      'best',
    )
    expect(review.plies[0].classification).toBe('great')
    expect(review.plies[0].secondLine).toBeDefined()
    expect(review.plies.map((p) => p.classification).slice(1)).toEqual([
      'good',
      'inaccuracy',
      'great',
      'blunder',
      'inaccuracy',
    ])
    expect(progress.some((p) => p.refining === 1)).toBe(true)
    expect(progress[progress.length - 1].refining).toBe(0)
  })

  it('a desktop profile (MultiPV 2 pass) never re-searches', async () => {
    const game = makeGame(SIX, { customStart: true })
    const engine = new FakeEngine(scripted(game, (k) => SPEC[k]))
    await run(game, engine)
    expect(engine.calls).toHaveLength(7)
  })
})

describe('analyzeGame: resume and cancel (R16)', () => {
  it('resumes from a partial review without evaluating a completed ply again', async () => {
    const game = makeGame(SIX, { customStart: true })
    const evalFn = scripted(game, (k) => ({ score: cp(10 * k) }))
    const full = await run(game, new FakeEngine(evalFn))
    const partial = full.emitted.find((e) => e.ply.ply === 3)!.review
    expect(partial.plies.map((p) => p.status)).toEqual([
      'done',
      'done',
      'done',
      'pending',
      'pending',
      'pending',
    ])
    expect(partial.complete).toBe(false)

    const engine = new FakeEngine(evalFn)
    const resumed = await run(game, engine, { resumeFrom: partial })
    // restarts at ply 4, re-evaluating the position before it (position 3), then positions 4 to 6
    expect(engine.calls.map((c) => c.fen)).toEqual(positionFens(game).slice(3))
    expect(resumed.emitted.map((e) => e.ply.ply)).toEqual([4, 5, 6])
    expect(resumed.review.plies.map((p) => p.classification)).toEqual(
      full.review.plies.map((p) => p.classification),
    )
    expect(resumed.review.accuracy).toEqual(full.review.accuracy)
    expect(resumed.review.createdAt).toBe(partial.createdAt)
    expect(resumed.review.complete).toBe(true)
  })

  it('a complete review never calls the engine', async () => {
    const game = makeGame(SIX, { customStart: true })
    const evalFn = scripted(game, () => ({ score: cp(20) }))
    const full = await run(game, new FakeEngine(evalFn))
    const engine = new FakeEngine(evalFn)
    const again = await run(game, engine, { resumeFrom: full.review })
    expect(engine.calls).toHaveLength(0)
    expect(again.review.plies).toEqual(full.review.plies)
  })

  it('cancel: rejects with an AbortError, stops the engine and emits nothing more', async () => {
    const game = makeGame(SIX, { customStart: true })
    const engine = new FakeEngine(
      scripted(game, () => ({ score: cp(20) })),
      true,
    )
    const controller = new AbortController()
    const emitted: number[] = []
    const promise = analyzeGame(game, engine, DESKTOP_PROFILE, {
      signal: controller.signal,
      onPly: (p) => emitted.push(p.ply),
    })
    const settled = promise.then(
      () => 'resolved',
      (e: unknown) => (e as Error).name,
    )
    await flush()
    engine.releaseNext()
    engine.releaseNext()
    await flush()
    expect(emitted).toEqual([1])
    controller.abort()
    expect(await settled).toBe('AbortError')
    expect(engine.stopCalls).toBe(1)
    while (engine.heldCount) engine.releaseNext()
    await flush()
    expect(emitted).toEqual([1])
  })

  it('an evaluate() rejected with an AbortError (pool stop or newer jobId) is a cancellation, not a failure', async () => {
    const game = makeGame(SIX, { customStart: true })
    const ok = scripted(game, () => ({ score: cp(20) }))
    const engine = new FakeEngine((fen, limits) => {
      if (fen4(fen) === fen4(game.moves[3].before))
        throw Object.assign(new Error('cancelled'), { name: 'AbortError' })
      return ok(fen, limits)
    })
    const emitted: PlyReview[] = []
    const error = await analyzeGame(game, engine, DESKTOP_PROFILE, { onPly: (p) => emitted.push(p) }).catch(
      (e: unknown) => e as Error,
    )
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).name).toBe('AbortError')
    // plies 1 and 2 were completed and emitted; ply 3 (needs position 3) and later are neither done nor not-analysed
    expect(emitted.map((p) => [p.ply, p.status])).toEqual([
      [1, 'done'],
      [2, 'done'],
    ])
  })

  it('an already aborted signal starts nothing', async () => {
    const game = makeGame(SIX, { customStart: true })
    const engine = new FakeEngine(scripted(game, () => ({ score: cp(20) })))
    const controller = new AbortController()
    controller.abort()
    await expect(analyzeGame(game, engine, DESKTOP_PROFILE, { signal: controller.signal })).rejects.toThrow()
    expect(engine.calls).toHaveLength(0)
  })
})

describe('analyzeGame: not-analysed plies (section 3.4)', () => {
  it('a position the watchdog gave up on marks both plies that need it, excluded from tally and accuracy', async () => {
    const game = makeGame(SIX, { customStart: true })
    // position 3 (before ply 4, after ply 3) is not analysed
    const engine = new FakeEngine(
      scripted(game, (k) => (k === 3 ? { score: cp(0), notAnalysed: true } : { score: cp(15 * k) })),
    )
    const { review } = await run(game, engine)
    expect(review.notAnalysed).toEqual([3, 4])
    expect(review.plies.map((p) => p.status)).toEqual([
      'done',
      'done',
      'not-analysed',
      'not-analysed',
      'done',
      'done',
    ])
    expect(review.complete).toBe(true)
    const tallied = (side: 'white' | 'black') => Object.values(review.tally[side]).reduce((s, n) => s + n, 0)
    expect(tallied('white')).toBe(2) // plies 1 and 5
    expect(tallied('black')).toBe(2) // plies 2 and 6
    const done = review.plies.filter((p) => p.status === 'done')
    expect(review.accuracy).toEqual(
      gameAccuracy(done.map((p) => ({ color: p.color, loss: p.loss, classification: p.classification }))),
    )
  })
})
