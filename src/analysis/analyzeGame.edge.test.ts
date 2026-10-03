// Edge cases of resuming an analysis (R16, G.5): a stored review is only reused for the same game and for plies
// whose move still matches, an accepted in-progress game that has grown continues with just the new plies, and the
// progress counters of a resumed run cover only the positions it still needs.
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import type { PositionEval, SearchLimits } from '../types/engine'
import type { ImportedGame } from '../types/game'
import type { GameReview } from '../types/review'
import { analyzeGame } from './index'
import { cp, DESKTOP_PROFILE, FakeEngine, fen4, lineEval, makeGame, otherMove } from './test-helpers'

// 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 with Book disabled (customStart), so every ply is classified by the engine rules
const SIX = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']

const fensOf = (game: ImportedGame): string[] => [
  ...game.moves.map((m) => m.before),
  game.moves[game.moves.length - 1].after,
]

/** Position k scores 10 * k centipawns for White; line 1 is the played move, line 2 another legal move. */
function evalFor(game: ImportedGame): (fen: string, l: SearchLimits) => PositionEval {
  const fens = fensOf(game)
  return (fen, limits) => {
    const k = fens.findIndex((f) => fen4(f) === fen4(fen))
    if (k < 0) throw new Error(`unexpected position ${fen}`)
    const played = game.moves[k]?.uci ?? new Chess(fen).moves({ verbose: true })[0].lan
    return lineEval(
      fen,
      [
        [played, cp(10 * k)],
        [otherMove(fen, played), cp(10 * k - 300)],
      ],
      limits.multiPv,
    )
  }
}

async function analyse(game: ImportedGame, engine: FakeEngine, resumeFrom?: GameReview) {
  const progress: { done: number; total: number }[] = []
  const emitted: number[] = []
  const review = await analyzeGame(game, engine, DESKTOP_PROFILE, {
    resumeFrom,
    onPly: (ply) => emitted.push(ply.ply),
    onProgress: (p) => progress.push({ done: p.done, total: p.total }),
  })
  return { review, progress, emitted }
}

describe('analyzeGame resume: what is reused', () => {
  it('an accepted in-progress game that has grown evaluates only the new plies', async () => {
    const full = makeGame(SIX, { customStart: true })
    const early = makeGame(SIX.slice(0, 4), { customStart: true })
    const evalFn = evalFor(full)
    const stored = (await analyse(early, new FakeEngine(evalFn))).review
    expect(stored.complete).toBe(true)
    expect(stored.plies).toHaveLength(4)

    const engine = new FakeEngine(evalFn)
    const resumed = await analyse(full, engine, stored)
    // positions 4 (the stored game's last), 5 and 6: nothing before ply 5 is searched again
    expect(engine.calls.map((c) => c.fen)).toEqual(fensOf(full).slice(4))
    expect(resumed.emitted).toEqual([5, 6])
    expect(resumed.review.plies).toHaveLength(6)
    expect(resumed.review.complete).toBe(true)
    const fresh = (await analyse(full, new FakeEngine(evalFn))).review
    expect(resumed.review.plies.map((p) => p.classification)).toEqual(
      fresh.plies.map((p) => p.classification),
    )
    expect(resumed.review.plies.map((p) => p.loss)).toEqual(fresh.plies.map((p) => p.loss))
  })

  it('a stored ply whose move differs is evaluated again, the matching ones before it are kept', async () => {
    const game = makeGame(SIX, { customStart: true })
    const evalFn = evalFor(game)
    const done = (await analyse(game, new FakeEngine(evalFn))).review
    const stale: GameReview = {
      ...done,
      complete: false,
      plies: done.plies.map((p) => (p.ply === 2 ? { ...p, uci: 'a7a6' } : p)),
    }
    const engine = new FakeEngine(evalFn)
    const resumed = await analyse(game, engine, stale)
    expect(engine.calls.map((c) => c.fen)).toEqual(fensOf(game).slice(1, 3))
    expect(resumed.emitted).toEqual([2])
    expect(resumed.review.plies[1].uci).toBe(game.moves[1].uci)
    expect(resumed.review.plies.map((p) => p.classification)).toEqual(done.plies.map((p) => p.classification))
  })

  it('a stored review of another game is ignored', async () => {
    const game = makeGame(SIX, { customStart: true, id: 'pgn:one' })
    const evalFn = evalFor(game)
    const other = (await analyse(makeGame(SIX, { customStart: true, id: 'pgn:two' }), new FakeEngine(evalFn)))
      .review
    const engine = new FakeEngine(evalFn)
    const result = await analyse(game, engine, other)
    expect(engine.calls.map((c) => c.fen)).toEqual(fensOf(game))
    expect(result.review.gameId).toBe('pgn:one')
  })
})

describe('analyzeGame resume: progress of a resumed run', () => {
  it('counts only the positions still needed and ends at done === total', async () => {
    const game = makeGame(SIX, { customStart: true })
    const evalFn = evalFor(game)
    const first = await analyseWithPartial(game, evalFn, 3)
    const resumed = await analyse(game, new FakeEngine(evalFn), first)
    // plies 4 to 6 need positions 3 to 6
    expect(resumed.progress[0]).toEqual({ done: 0, total: 4 })
    expect(resumed.progress[resumed.progress.length - 1]).toEqual({ done: 4, total: 4 })
    expect(resumed.progress.every((p) => p.total === 4)).toBe(true)
  })
})

/** The review as it was persisted right after ply `n` was emitted. */
async function analyseWithPartial(
  game: ImportedGame,
  evalFn: (fen: string, l: SearchLimits) => PositionEval,
  n: number,
): Promise<GameReview> {
  let partial: GameReview | undefined
  await analyzeGame(game, new FakeEngine(evalFn), DESKTOP_PROFILE, {
    onPly: (ply, review) => {
      if (ply.ply === n) partial = review
    },
  })
  if (!partial) throw new Error('no partial review')
  return partial
}
