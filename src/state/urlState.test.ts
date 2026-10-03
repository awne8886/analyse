// R29: URL state. No router; navigation state lives in the query string on the base path.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildShareLink, gameIdToLink, readUrlState, receiveGameId, toSearch, writeUrlState } from './index'

// Every game id form of PROMPT.md section 3.3 (li ids keep their case; the pgn hash is 12 lowercase hex).
const GAME_IDS = [
  'cc:live:129688175007',
  'cc:daily:1000337106',
  'cc:computer:285275822',
  'li:4S1PZUvW',
  'pgn:a1b2c3d4e5f6',
]

describe('toSearch / readUrlState round trip (R29)', () => {
  it.each(GAME_IDS)('%s with a ply survives toSearch -> readUrlState', (id) => {
    const search = toSearch({ game: id, ply: 40 })
    expect(search.startsWith('?')).toBe(true)
    expect(readUrlState(search)).toEqual({ game: id, ply: 40 })
  })

  it.each(GAME_IDS)('%s is written literally as ?game=<id>&ply=<n>', (id) => {
    expect(toSearch({ game: id, ply: 7 })).toBe(`?game=${id}&ply=7`)
  })

  it('keeps ply 0 (the start position) rather than dropping it as falsy', () => {
    const search = toSearch({ game: 'cc:live:1', ply: 0 })
    expect(search).toBe('?game=cc:live:1&ply=0')
    expect(readUrlState(search)).toEqual({ game: 'cc:live:1', ply: 0 })
  })

  it('omits ply when it is undefined and reads it back as undefined', () => {
    const search = toSearch({ game: 'li:4S1PZUvW' })
    expect(search).toBe('?game=li:4S1PZUvW')
    expect(readUrlState(search).ply).toBeUndefined()
    expect(readUrlState(search).game).toBe('li:4S1PZUvW')
  })

  it('preserves the case of lichess ids', () => {
    expect(readUrlState('?game=li:4S1PZUvW&ply=3').game).toBe('li:4S1PZUvW')
    expect(readUrlState(toSearch({ game: 'li:AbCdEfGh' })).game).toBe('li:AbCdEfGh')
  })

  it('reads percent-encoded colons as well as literal ones', () => {
    expect(readUrlState('?game=cc%3Alive%3A129688175007&ply=12')).toEqual({
      game: 'cc:live:129688175007',
      ply: 12,
    })
  })

  it('round-trips ?dev=calibration', () => {
    expect(readUrlState('?dev=calibration')).toEqual({ dev: 'calibration' })
    expect(readUrlState(toSearch({ dev: 'calibration' }))).toEqual({ dev: 'calibration' })
    expect(toSearch({ dev: 'calibration' })).toBe('?dev=calibration')
  })

  it('ignores unrelated parameters and reads an empty query as an empty state', () => {
    expect(readUrlState('')).toEqual({})
    expect(readUrlState('?username=Hikaru&move=12')).toEqual({})
    expect(readUrlState('?foo=1&game=cc:daily:1000337106&ply=2')).toEqual({
      game: 'cc:daily:1000337106',
      ply: 2,
    })
  })

  it('treats a non-numeric ply as absent', () => {
    expect(readUrlState('?game=cc:live:1&ply=abc').ply).toBeUndefined()
  })
})

describe('writeUrlState (history.replaceState)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('replaces the query string without adding a history entry', () => {
    const before = window.history.length
    const spy = vi.spyOn(window.history, 'replaceState')
    writeUrlState({ game: 'cc:live:129688175007', ply: 40 })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
    expect(window.location.search).toBe('?game=cc:live:129688175007&ply=40')
    expect(window.location.pathname).toBe('/')
    expect(window.history.length).toBe(before)
  })

  it.each(GAME_IDS)('%s written to the location is read back by readUrlState()', (id) => {
    writeUrlState({ game: id, ply: 5 })
    expect(readUrlState()).toEqual({ game: id, ply: 5 })
  })

  it('a second write replaces the first', () => {
    writeUrlState({ game: 'cc:live:1', ply: 1 })
    writeUrlState({ game: 'li:4S1PZUvW', ply: 9 })
    expect(window.location.search).toBe('?game=li:4S1PZUvW&ply=9')
  })

  it("mode 'push' also updates the location", () => {
    writeUrlState({ game: 'cc:daily:1000337106', ply: 2 }, 'push')
    expect(window.location.search).toBe('?game=cc:daily:1000337106&ply=2')
  })

  it('readUrlState() with no argument reads the current location.search', () => {
    window.history.replaceState(null, '', '/analyse/?dev=calibration')
    expect(readUrlState()).toEqual({ dev: 'calibration' })
  })
})

describe('buildShareLink (R29, G.27)', () => {
  it.each(GAME_IDS)('%s at base "/" gives origin + "/?game=...&ply=..."', (id) => {
    expect(buildShareLink(id, 40, 'https://example.app', '/')).toBe(`https://example.app/?game=${id}&ply=40`)
  })

  it.each(GAME_IDS)('%s at base "/analyse/" keeps the base path', (id) => {
    expect(buildShareLink(id, 12, 'https://example.app', '/analyse/')).toBe(
      `https://example.app/analyse/?game=${id}&ply=12`,
    )
  })

  it('omits ply when it is undefined', () => {
    expect(buildShareLink('li:4S1PZUvW', undefined, 'https://example.app', '/analyse/')).toBe(
      'https://example.app/analyse/?game=li:4S1PZUvW',
    )
  })

  it('a share link parses back into the same state', () => {
    const link = new URL(buildShareLink('cc:live:129688175007', 40, 'https://example.app', '/analyse/'))
    expect(link.origin).toBe('https://example.app')
    expect(link.pathname).toBe('/analyse/')
    expect(readUrlState(link.search)).toEqual({ game: 'cc:live:129688175007', ply: 40 })
  })
})

describe('gameIdToLink', () => {
  it.each([
    ['cc:live:129688175007', 'https://www.chess.com/game/live/129688175007'],
    ['cc:daily:1000337106', 'https://www.chess.com/game/daily/1000337106'],
    ['cc:computer:285275822', 'https://www.chess.com/game/computer/285275822'],
    ['li:4S1PZUvW', 'https://lichess.org/4S1PZUvW'],
  ])('%s -> %s', (id, link) => {
    expect(gameIdToLink(id)).toBe(link)
  })

  it('has no link for a pasted PGN', () => {
    expect(gameIdToLink('pgn:a1b2c3d4e5f6')).toBeNull()
  })
})

describe('receiveGameId: opening ?game=<id> (R29, three receiving cases)', () => {
  const targets = ['vercel', 'pages'] as const

  describe('cached review', () => {
    it.each(GAME_IDS.flatMap((id) => targets.map((t) => [id, t] as const)))(
      '%s on %s renders the cached review',
      (id, deployTarget) => {
        expect(receiveGameId(id, { deployTarget, cached: true })).toEqual({ type: 'render-cached' })
      },
    )

    it('a cached review wins even when a username is stored', () => {
      expect(
        receiveGameId('cc:live:129688175007', { deployTarget: 'pages', cached: true, username: 'hikaru' }),
      ).toEqual({ type: 'render-cached' })
    })
  })

  describe('uncached chess.com id on the Vercel build', () => {
    it.each([
      ['cc:live:129688175007', 'live', '129688175007'],
      ['cc:daily:1000337106', 'daily', '1000337106'],
      ['cc:computer:285275822', 'computer', '285275822'],
    ])('%s runs the import chain', (id, cckind, rawId) => {
      expect(receiveGameId(id, { deployTarget: 'vercel', cached: false })).toEqual({
        type: 'import',
        parsed: { kind: 'chesscom', cckind, id: rawId },
      })
    })
  })

  describe('uncached chess.com id on the Pages build', () => {
    it.each([
      ['cc:live:129688175007', 'https://www.chess.com/game/live/129688175007'],
      ['cc:daily:1000337106', 'https://www.chess.com/game/daily/1000337106'],
      ['cc:computer:285275822', 'https://www.chess.com/game/computer/285275822'],
    ])('%s opens the import screen with the link reconstructed', (id, link) => {
      expect(receiveGameId(id, { deployTarget: 'pages', cached: false })).toEqual({
        type: 'import-screen',
        link,
        focusUsername: true,
        autoScan: false,
      })
    })

    it('starts the archive scan without asking when a username is known', () => {
      expect(
        receiveGameId('cc:live:129688175007', { deployTarget: 'pages', cached: false, username: 'Hikaru' }),
      ).toEqual({
        type: 'import-screen',
        link: 'https://www.chess.com/game/live/129688175007',
        focusUsername: true,
        autoScan: true,
      })
    })

    it('an empty username does not trigger the scan', () => {
      expect(
        receiveGameId('cc:daily:1000337106', { deployTarget: 'pages', cached: false, username: '' }),
      ).toMatchObject({ type: 'import-screen', autoScan: false })
    })
  })

  describe('uncached lichess id', () => {
    it.each(targets)('imports directly from the browser on %s', (deployTarget) => {
      expect(receiveGameId('li:4S1PZUvW', { deployTarget, cached: false })).toEqual({
        type: 'import',
        parsed: { kind: 'lichess', id: '4S1PZUvW' },
      })
    })
  })

  describe('uncached pgn id', () => {
    it.each(targets)('shows I-37 on %s', (deployTarget) => {
      expect(receiveGameId('pgn:a1b2c3d4e5f6', { deployTarget, cached: false })).toEqual({
        type: 'error',
        key: 'I-37',
      })
    })

    it('a cached pgn review renders', () => {
      expect(receiveGameId('pgn:a1b2c3d4e5f6', { deployTarget: 'vercel', cached: true })).toEqual({
        type: 'render-cached',
      })
    })
  })
})
