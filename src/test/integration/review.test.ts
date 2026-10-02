// End-to-end pipeline through the public entry points only (lead-owned; red until the Phase 3 merge):
// recorded network JSON -> importGame -> mock engine from the recorded eval tables -> analyzeGame -> explain.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importGame, parseInput } from '../../import'
import { createEnginePool } from '../../engine'
import { analyzeGame } from '../../analysis'
import { buildMoveFacts, explain } from '../../explain'
import type { EngineProfile, PositionEval } from '../../types/engine'
import { CLASSIFICATIONS, type GameReview } from '../../types/review'
import type { ImportedGame } from '../../types/game'
import { fixtureResponse, loadNetworkFixture, readFixtureText } from '../loadFixture'

const mockWindow = window as Window & {
  __USE_MOCK_ENGINE__?: boolean
  __MOCK_EVALS__?: Record<string, PositionEval>
}

const PROFILE: EngineProfile = {
  build: 'lite-single',
  workers: 1,
  threads: 1,
  hashMb: 32,
  multiPv: 2,
  limits: { depth: 16, movetimeMs: 2000, multiPv: 2 },
  tier: 'standard-16',
}

function routeFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'https://analyse.test')
      if (url.pathname === '/api/chesscom') {
        const kind = url.searchParams.get('kind')
        const id = url.searchParams.get('id')
        return fixtureResponse(loadNetworkFixture(`www.chess.com-${kind}-${id}`))
      }
      if (url.hostname === 'lichess.org') {
        const id = url.pathname.split('/').pop()
        return fixtureResponse(loadNetworkFixture(`lichess.org-game-${id}`))
      }
      throw new TypeError(`unexpected fetch ${url.href}`)
    }),
  )
}

async function review(link: string, gameId: string): Promise<{ game: ImportedGame; review: GameReview }> {
  const res = await importGame(parseInput(link), { deployTarget: 'vercel', proxyUrl: '/api/chesscom' })
  if (!res.ok) throw new Error(`import failed: ${res.error.code} ${res.error.message}`)
  expect(res.game.id).toBe(gameId)
  mockWindow.__USE_MOCK_ENGINE__ = true
  mockWindow.__MOCK_EVALS__ = JSON.parse(readFixtureText(`evals/${gameId}.json`)) as Record<
    string,
    PositionEval
  >
  const engine = createEnginePool(PROFILE)
  await engine.init(PROFILE)
  const r = await analyzeGame(res.game, engine, PROFILE, {
    explainPly: (rv, ply) => explain(buildMoveFacts(rv, ply, 'w'), 'impersonal'),
  })
  expect(engine.stats).toEqual({ workersCreated: 0, uciSent: 0 })
  return { game: res.game, review: r }
}

function expectWellFormed(game: ImportedGame, r: GameReview): void {
  expect(r.complete).toBe(true)
  expect(r.plies).toHaveLength(game.moves.length)
  for (const p of r.plies) {
    expect(CLASSIFICATIONS).toContain(p.classification)
    expect(p.status).toBe('done')
    expect(p.explanation.headline.startsWith(p.san + ' ')).toBe(true)
  }
  for (const [side, color] of [
    ['white', 'w'],
    ['black', 'b'],
  ] as const) {
    const moves = r.plies.filter((p) => p.color === color).length
    const excluded = r.notAnalysed.filter((ply) => r.plies[ply - 1].color === color).length
    const tallied = Object.values(r.tally[side]).reduce((a, b) => a + b, 0)
    expect(tallied).toBe(moves - excluded)
  }
}

describe('integration: recorded games through the mock engine', () => {
  beforeEach(routeFetch)
  afterEach(() => {
    vi.unstubAllGlobals()
    delete mockWindow.__USE_MOCK_ENGINE__
    delete mockWindow.__MOCK_EVALS__
  })

  it('cc:live:129688175007 (DoD 1): 112 plies, accuracies, ratings, key moments', async () => {
    const { game, review: r } = await review(
      'https://www.chess.com/game/live/129688175007',
      'cc:live:129688175007',
    )
    expect(game.moves).toHaveLength(112)
    expect(game.white.name).toBe('Arystanner')
    expect(game.black.name).toBe('Hikaru')
    expect(game.result).toBe('1-0')
    expectWellFormed(game, r)
    expect(r.notAnalysed).toEqual([])
    expect(r.accuracy.white).toBeGreaterThan(0)
    expect(r.accuracy.black).toBeGreaterThan(0)
    expect(r.rating.white).toBeDefined()
    expect(r.rating.black).toBeDefined()
    expect(r.rating.method).toBe('regression')
    expect(r.keyMoments.length).toBeGreaterThanOrEqual(1)
    expect(r.summary.length).toBeGreaterThan(0)
  })

  it('cc:daily:1000337106 (DoD 2): custom start, no Book, O-O-O at plies 14 and 15', async () => {
    const { game, review: r } = await review(
      'https://www.chess.com/game/daily/1000337106',
      'cc:daily:1000337106',
    )
    expect(game.startFen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1')
    expect(game.customStart).toBe(true)
    expect(game.moves[13].san).toBe('O-O-O')
    expect(game.moves[13].color).toBe('b')
    expect(game.moves[14].san).toBe('O-O-O')
    expect(game.moves[14].color).toBe('w')
    expectWellFormed(game, r)
    expect(r.plies.some((p) => p.classification === 'book')).toBe(false)
  })

  it('li:4S1PZUvW (DoD 5): 13 plies from the FEN, Black is a computer, Best on the mating move', async () => {
    const { game, review: r } = await review('https://lichess.org/4S1PZUvW', 'li:4S1PZUvW')
    expect(game.startFen).toBe('8/8/8/8/3k4/8/R7/R3K3 w Q - 0 1')
    expect(game.moves).toHaveLength(13)
    expect(game.black.isComputer).toBe(true)
    expectWellFormed(game, r)
    expect(r.plies.some((p) => p.classification === 'book')).toBe(false)
    const last = r.plies[r.plies.length - 1]
    expect(game.moves[game.moves.length - 1].terminal).toBe('checkmate')
    expect(last.classification).toBe('best')
  })
})
