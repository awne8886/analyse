// R2 bare link (review correctness L10): live found + daily probe failing on both proxy paths keeps the live game.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { importGame, parseInput } from './index'
import { fixtureResponse, loadNetworkFixture } from '../test/loadFixture'

describe('bare chess.com link when the daily probe fails', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('resolves to the found live game with notice ambiguous_resolved (I-10a)', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'https://analyse.test')
        urls.push(url.pathname + url.search)
        if (url.pathname === '/api/chesscom' && url.searchParams.get('kind') === 'live')
          return fixtureResponse(loadNetworkFixture('www.chess.com-live-129688175007'))
        if (url.pathname === '/api/chesscom')
          return new Response(JSON.stringify({ error: 'upstream_blocked' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          })
        return new Response('<!doctype html><title>challenge</title>', {
          status: 403,
          headers: { 'content-type': 'text/html' },
        })
      }),
    )
    const res = await importGame(parseInput('https://www.chess.com/game/129688175007'), {
      deployTarget: 'vercel',
      proxyUrl: '/api/chesscom',
      wait: async () => undefined,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.notice).toBe('ambiguous_resolved')
    expect(res.game.id).toBe('cc:live:129688175007')
    expect(urls[0]).toBe('/api/chesscom?kind=live&id=129688175007')
    expect(urls[1]).toBe('/api/chesscom?kind=daily&id=129688175007')
  })
})
