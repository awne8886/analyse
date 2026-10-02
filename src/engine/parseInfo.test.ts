// Phase 0b RED tests: Appendix C.6 (verified engine output) through parseInfo and toWhite (R17).
// All of these fail against the Phase 0a stubs with "not implemented".
import { describe, expect, it } from 'vitest'
import { parseInfo, toWhite } from './index'

describe('parseInfo: complete info lines (C.6)', () => {
  it('parses a plain cp line with every optional field and no bound', () => {
    const line =
      'info depth 14 seldepth 22 multipv 1 score cp -25 nodes 237582 nps 473270 hashfull 90 time 502 pv a7a6 b5a4 g8f6'
    const p = parseInfo(line)
    expect(p).not.toBeNull()
    expect(p?.depth).toBe(14)
    expect(p?.seldepth).toBe(22)
    expect(p?.multipv).toBe(1)
    expect(p?.score).toEqual({ type: 'cp', value: -25 })
    expect(p?.pv).toEqual(['a7a6', 'b5a4', 'g8f6'])
    expect(p?.nodes).toBe(237582)
    expect(p?.nps).toBe(473270)
    expect(p?.time).toBe(502)
    expect(p?.bound).toBeUndefined()
    expect(p?.wdl).toBeUndefined()
  })

  it('toWhite flips the cp line above to +25 when Black is to move', () => {
    const p = parseInfo(
      'info depth 14 seldepth 22 multipv 1 score cp -25 nodes 237582 nps 473270 hashfull 90 time 502 pv a7a6 b5a4 g8f6',
    )
    expect(p).not.toBeNull()
    if (!p) return
    expect(toWhite(p.score, 'b')).toEqual({ type: 'cp', value: 25 })
    expect(toWhite(p.score, 'w')).toEqual({ type: 'cp', value: -25 })
  })

  it('reads multipv 2 and a negative mate score', () => {
    const p = parseInfo('info depth 16 seldepth 24 multipv 2 score mate -3 nodes 1 nps 1 time 1 pv e8f8 h6f7')
    expect(p).not.toBeNull()
    expect(p?.multipv).toBe(2)
    expect(p?.depth).toBe(16)
    expect(p?.score).toEqual({ type: 'mate', value: -3 })
    expect(p?.pv).toEqual(['e8f8', 'h6f7'])
  })

  it('toWhite keeps mate -3 for White to move and gives mate 3 for Black to move', () => {
    const p = parseInfo('info depth 16 seldepth 24 multipv 2 score mate -3 nodes 1 nps 1 time 1 pv e8f8 h6f7')
    expect(p).not.toBeNull()
    if (!p) return
    expect(toWhite(p.score, 'w')).toEqual({ type: 'mate', value: -3 })
    expect(toWhite(p.score, 'b')).toEqual({ type: 'mate', value: 3 })
  })

  it('reads a positive mate score', () => {
    const p = parseInfo('info depth 18 seldepth 9 multipv 1 score mate 4 nodes 5 nps 5 time 1 pv d1h5 g6h5')
    expect(p?.score).toEqual({ type: 'mate', value: 4 })
    expect(p?.multipv).toBe(1)
  })

  it('defaults multipv to 1 when the line has no multipv token', () => {
    const p = parseInfo('info depth 12 score cp 31 nodes 1 nps 1 time 1 pv e2e4 e7e5')
    expect(p?.multipv).toBe(1)
    expect(p?.score).toEqual({ type: 'cp', value: 31 })
  })

  it('marks upperbound lines with bound "upper" (kept by the parser, ignored by analyse)', () => {
    const p = parseInfo('info depth 12 score cp -985 upperbound nodes 1 nps 1 time 1 pv c5d4')
    expect(p).not.toBeNull()
    expect(p?.bound).toBe('upper')
    expect(p?.score).toEqual({ type: 'cp', value: -985 })
    expect(p?.depth).toBe(12)
    expect(p?.pv).toEqual(['c5d4'])
  })

  it('marks lowerbound lines with bound "lower"', () => {
    const p = parseInfo('info depth 12 score cp -985 lowerbound nodes 1 nps 1 time 1 pv c5d4')
    expect(p).not.toBeNull()
    expect(p?.bound).toBe('lower')
    expect(p?.score).toEqual({ type: 'cp', value: -985 })
  })

  it('reads wdl as three numbers', () => {
    const p = parseInfo('info depth 20 multipv 1 score cp 28 wdl 53 941 6 nodes 1 nps 1 time 1 pv e2e4')
    expect(p).not.toBeNull()
    expect(p?.wdl).toEqual([53, 941, 6])
    expect(p?.score).toEqual({ type: 'cp', value: 28 })
    expect(p?.pv).toEqual(['e2e4'])
    expect(p?.nps).toBe(1)
  })
})

describe('parseInfo: terminal and bestmove lines (parseInfo level only)', () => {
  // The terminal / bestmove bullets of C.6 ("info depth 0 score mate 0" + "bestmove (none)" gives
  // terminal 'checkmate', bestmove null; "info depth 0 score cp 0" gives 'stalemate'; "bestmove e2e4 ponder e7e5"
  // gives bestmove 'e2e4') are decided by the pool / Engine, which has no test entry point in this module's
  // public surface yet. Here they can only be asserted at the parseInfo level: the depth-0 info line parses
  // to depth 0 with score mate 0 / cp 0, and bestmove lines are not info lines. pool.test.ts owns the rest.
  it('parses "info depth 0 score mate 0" as depth 0 with a mate-0 score (checkmate marker)', () => {
    const p = parseInfo('info depth 0 score mate 0')
    expect(p).not.toBeNull()
    expect(p?.depth).toBe(0)
    expect(p?.score.type).toBe('mate')
    expect(p?.score.value).toBe(0)
  })

  it('parses "info depth 0 score cp 0" as depth 0 with a cp-0 score (stalemate marker)', () => {
    const p = parseInfo('info depth 0 score cp 0')
    expect(p).not.toBeNull()
    expect(p?.depth).toBe(0)
    expect(p?.score).toEqual({ type: 'cp', value: 0 })
  })

  it('gives null for bestmove lines (they are not info lines)', () => {
    expect(parseInfo('bestmove (none)')).toBeNull()
    expect(parseInfo('bestmove e2e4 ponder e7e5')).toBeNull()
    expect(parseInfo('bestmove e2e4')).toBeNull()
  })
})

describe('parseInfo: lines that must give null', () => {
  it.each([
    [
      'info string NNUE evaluation',
      'info string NNUE evaluation using nn-61e7af4bb97d.nnue (1MiB, (768, 1024, 32, 32, 1))',
    ],
    ['engine banner', 'Stockfish 19 Lite WASM by the Stockfish developers (see AUTHORS file)'],
    ['download progress', 'info WillOutputEngineDownloadProgress'],
    ['uciok', 'uciok'],
    ['readyok', 'readyok'],
    ['id name', 'id name Stockfish 19 Lite WASM'],
    ['id author', 'id author the Stockfish developers (see AUTHORS file)'],
    ['empty line', ''],
    ['info line without score (currmove)', 'info depth 3 currmove e2e4 currmovenumber 1'],
    ['info line without depth', 'info nodes 1000 nps 500000 time 2 score cp 10 pv e2e4'],
    ['info string that mentions score and depth', 'info string depth 12 score cp 10 pv e2e4'],
  ])('%s', (_name, line) => {
    expect(parseInfo(line)).toBeNull()
  })
})

describe('parseInfo: uci option lines are tolerated', () => {
  it.each([
    'option name Threads type spin default 1 min 1 max 1',
    'option name Threads type spin default 1 min 1 max 32',
    'option name Hash type spin default 16 min 1 max 33554432',
    'option name MultiPV type spin default 1 min 1 max 256',
    'option name UCI_Chess960 type check default false',
    'option name EvalFile type string default nn-61e7af4bb97d.nnue',
  ])('%s gives null without throwing', (line) => {
    expect(parseInfo(line)).toBeNull()
  })
})

describe('toWhite (side-to-move to White perspective, applied once)', () => {
  it('a winning Black endgame reports cp +1010 with Black to move and is -1010 for White', () => {
    expect(toWhite({ type: 'cp', value: 1010 }, 'b')).toEqual({ type: 'cp', value: -1010 })
  })

  it('leaves the score unchanged when White is to move', () => {
    expect(toWhite({ type: 'cp', value: 1010 }, 'w')).toEqual({ type: 'cp', value: 1010 })
    expect(toWhite({ type: 'cp', value: -37 }, 'w')).toEqual({ type: 'cp', value: -37 })
    expect(toWhite({ type: 'mate', value: 2 }, 'w')).toEqual({ type: 'mate', value: 2 })
  })

  it('negates the value and keeps the type when Black is to move', () => {
    expect(toWhite({ type: 'cp', value: -37 }, 'b')).toEqual({ type: 'cp', value: 37 })
    expect(toWhite({ type: 'mate', value: 2 }, 'b')).toEqual({ type: 'mate', value: -2 })
    expect(toWhite({ type: 'mate', value: -7 }, 'b')).toEqual({ type: 'mate', value: 7 })
  })

  it('does not mutate its input', () => {
    const s = { type: 'cp' as const, value: 80 }
    toWhite(s, 'b')
    expect(s).toEqual({ type: 'cp', value: 80 })
  })
})
