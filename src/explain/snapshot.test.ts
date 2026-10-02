// Phase 3 snapshot (lead-owned, E.5 last bullet): explain() over every ply of the three e2e fixture games, built from
// the recorded network JSON and the committed eval tables through the mock engine. Stable because the variant choice
// is seeded by the ply index; a change here means an explanation changed wording or rule.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { importGame, parseInput } from '../import'
import { createEnginePool } from '../engine'
import { analyzeGame } from '../analysis'
import { buildMoveFacts, explain } from './index'
import type { EngineProfile, PositionEval } from '../types/engine'
import { fixtureResponse, loadNetworkFixture, readFixtureText } from '../test/loadFixture'

const PROFILE: EngineProfile = {
  build: 'lite-single',
  workers: 1,
  threads: 1,
  hashMb: 32,
  multiPv: 2,
  limits: { depth: 16, movetimeMs: 2000, multiPv: 2 },
  tier: 'standard-16',
}
const mockWindow = window as Window & {
  __USE_MOCK_ENGINE__?: boolean
  __MOCK_EVALS__?: Record<string, PositionEval>
}

const GAMES = [
  ['https://www.chess.com/game/live/129688175007', 'cc:live:129688175007'],
  ['https://www.chess.com/game/daily/1000337106', 'cc:daily:1000337106'],
  ['https://lichess.org/4S1PZUvW', 'li:4S1PZUvW'],
] as const

describe('explain() snapshot over the three fixture games', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete mockWindow.__USE_MOCK_ENGINE__
    delete mockWindow.__MOCK_EVALS__
  })

  it.each(GAMES)('%s', async (link, gameId) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'https://analyse.test')
        if (url.pathname === '/api/chesscom')
          return fixtureResponse(
            loadNetworkFixture(`www.chess.com-${url.searchParams.get('kind')}-${url.searchParams.get('id')}`),
          )
        return fixtureResponse(loadNetworkFixture(`lichess.org-game-${url.pathname.split('/').pop()}`))
      }),
    )
    const res = await importGame(parseInput(link), { deployTarget: 'vercel', proxyUrl: '/api/chesscom' })
    if (!res.ok) throw new Error(res.error.message)
    mockWindow.__USE_MOCK_ENGINE__ = true
    mockWindow.__MOCK_EVALS__ = JSON.parse(readFixtureText(`evals/${gameId.replaceAll(':', '_')}.json`))
    const engine = createEnginePool(PROFILE)
    await engine.init(PROFILE)
    const review = await analyzeGame(res.game, engine, PROFILE, {})
    const lines = review.plies.map((p) => {
      const e = explain(buildMoveFacts(review, p.ply, 'w'), p.color === 'w' ? 'personal' : 'impersonal')
      return [p.ply, p.classification, e.reasonCode, e.headline, ...e.sentences, e.bestLine ?? ''].join(' | ')
    })
    expect(lines).toMatchSnapshot()
  })
})
