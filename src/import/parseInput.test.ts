// PROMPT.md Appendix A.1 (parse order and rules) and A.4 (URL fixtures). Red against the Phase 0a stub.
import { describe, expect, it } from 'vitest'
import type { ChesscomKind, ParsedInput } from '../types/game'
import { parseInput } from './index'

const cc = (cckind: ChesscomKind | 'unknown', id: string, username?: string): ParsedInput =>
  username === undefined ? { kind: 'chesscom', cckind, id } : { kind: 'chesscom', cckind, id, username }
const li = (id: string): ParsedInput => ({ kind: 'lichess', id })
const notAGame = (what: 'study chapter' | 'puzzle' | 'broadcast' | 'page'): ParsedInput => ({
  kind: 'lichess_not_a_game',
  what,
})
const UNRECOGNISED: ParsedInput = { kind: 'unrecognised' }

// Appendix A.4, row by row (the rows with several inputs are expanded to one input each).
const A4_ROWS: [string, ParsedInput][] = [
  ['https://www.chess.com/game/live/184718495500', cc('live', '184718495500')],
  ['https://www.chess.com/game/live/184718495500?username=foo&move=0', cc('live', '184718495500', 'foo')],
  ['https://www.chess.com/live/game/129688175007', cc('live', '129688175007')],
  ['https://www.chess.com/analysis/game/live/129688175007?tab=review', cc('live', '129688175007')],
  ['https://www.chess.com/analysis/game/live/129688175007/review', cc('live', '129688175007')],
  ['https://www.chess.com/game/daily/747757185', cc('daily', '747757185')],
  ['https://www.chess.com/daily/game/747757185', cc('daily', '747757185')],
  ['https://www.chess.com/analysis/game/daily/747757185', cc('daily', '747757185')],
  ['https://www.chess.com/game/computer/285275822?move=0', cc('computer', '285275822')],
  ['https://www.chess.com/share/game/live/default/184718495500', cc('live', '184718495500')],
  ['https://www.chess.com/livechess/game?id=129688175007', cc('live', '129688175007')],
  ['https://www.chess.com/echess/game?id=747757185', cc('daily', '747757185')],
  ['https://chess.com/live#g=129688175007', cc('live', '129688175007')],
  ['https://chess.com/de/live/game/129688175007?username=hikaru', cc('live', '129688175007', 'hikaru')],
  ['https://www.chess.com/DAILY/game/747757185', cc('daily', '747757185')],
  ['https://www.chess.com/game/129688175007', cc('unknown', '129688175007')],
  ['129688175007', cc('unknown', '129688175007')],
  ['https://www.chess.com/game/live/0', UNRECOGNISED],
  ['https://www.chess.com/puzzles/problem/12345', UNRECOGNISED],
  ['https://www.chess.com/analysis?fen=...', UNRECOGNISED],
  ['https://www.chess.com/events/x', UNRECOGNISED],
  ['https://www.chess.com/play/online', UNRECOGNISED],
  ['https://lichess.org/TJxUmbWK', li('TJxUmbWK')],
  ['https://lichess.org/TJxUmbWKabcd/black#12', li('TJxUmbWK')],
  ['https://lichess.org/game/export/4S1PZUvW', li('4S1PZUvW')],
  ['https://lichess.org/tjxumbwk', li('tjxumbwk')],
  ['https://lichess.org/study/CLoqMdcm/CbeqXexy', notAGame('study chapter')],
  ['https://lichess.org/training/CFLoC', notAGame('puzzle')],
  ['https://lichess.org/analysis', notAGame('page')],
  ['https://lichess.org/practice', notAGame('page')],
  ['https://lichess.org/@/thibault', notAGame('page')],
  ['hello world', UNRECOGNISED],
]

describe('parseInput: Appendix A.4 URL fixtures', () => {
  it.each(A4_ROWS)('%j', (input, expected) => {
    // toStrictEqual: a chesscom result without a username has no `username` key at all
    expect(parseInput(input)).toStrictEqual(expected)
  })

  it('A.4 PGN row: tag pairs then movetext is a pgn, carrying the trimmed input', () => {
    const input = '[Event "x"]\n[Site "?"]\n\n1. e4 e5 *'
    expect(parseInput(input)).toStrictEqual({ kind: 'pgn', pgn: input })
  })

  it('A.4 PGN row: movetext starting with "1." is a pgn', () => {
    expect(parseInput('1. e4 e5 2. Nf3')).toStrictEqual({ kind: 'pgn', pgn: '1. e4 e5 2. Nf3' })
  })

  it('a pgn result carries the trimmed input, not the raw text', () => {
    const body = '[Event "x"]\n[Site "?"]\n\n1. e4 e5 *'
    expect(parseInput(`  \n${body}\n\n  `)).toStrictEqual({ kind: 'pgn', pgn: body })
    expect(parseInput('\n  1. e4 e5 2. Nf3  \n')).toStrictEqual({ kind: 'pgn', pgn: '1. e4 e5 2. Nf3' })
  })
})

describe('parseInput: Appendix A.1 rules beyond the A.4 table', () => {
  it('trims surrounding whitespace around a link', () => {
    expect(parseInput('  https://www.chess.com/game/live/184718495500 \n')).toStrictEqual(
      cc('live', '184718495500'),
    )
  })

  it('accepts links without a scheme and with a #ply suffix', () => {
    expect(parseInput('chess.com/game/live/184718495500')).toStrictEqual(cc('live', '184718495500'))
    expect(parseInput('www.chess.com/game/daily/747757185#12')).toStrictEqual(cc('daily', '747757185'))
  })

  it('ignores ?move= and /review; reads username only from ?username=', () => {
    expect(parseInput('https://www.chess.com/game/live/184718495500?move=12')).toStrictEqual(
      cc('live', '184718495500'),
    )
    expect(
      parseInput('https://www.chess.com/analysis/game/live/129688175007/review?username=Hikaru&tab=review'),
    ).toStrictEqual(cc('live', '129688175007', 'Hikaru'))
  })

  it('a locale prefix with a region (en-us) is accepted', () => {
    expect(parseInput('https://www.chess.com/en-us/game/daily/747757185')).toStrictEqual(
      cc('daily', '747757185'),
    )
  })

  it('bare chess.com/game/{id} with a trailing path or query is the ambiguous kind', () => {
    expect(parseInput('https://www.chess.com/game/129688175007?username=foo')).toStrictEqual(
      cc('unknown', '129688175007'),
    )
  })

  it('bare numeric ids of 6 to 15 digits are ambiguous; shorter and longer are not accepted', () => {
    expect(parseInput('123456')).toStrictEqual(cc('unknown', '123456'))
    expect(parseInput('123456789012345')).toStrictEqual(cc('unknown', '123456789012345'))
    expect(parseInput('12345')).toStrictEqual(UNRECOGNISED)
    expect(parseInput('1234567890123456')).toStrictEqual(UNRECOGNISED)
  })

  it('the digit count never selects the kind (9 digit live id, 12 digit daily id)', () => {
    expect(parseInput('https://www.chess.com/game/live/285275822')).toStrictEqual(cc('live', '285275822'))
    expect(parseInput('https://www.chess.com/game/daily/129688175007')).toStrictEqual(
      cc('daily', '129688175007'),
    )
  })

  it.each([
    'https://www.chess.com/game/live/0123456',
    'https://www.chess.com/game/daily/0747757185',
    'https://www.chess.com/game/computer/00285275822',
    'https://www.chess.com/livechess/game?id=0129688175007',
    'https://www.chess.com/echess/game?id=0747757185',
    'https://chess.com/live#g=0129688175007',
    'https://www.chess.com/game/0129688175007',
    '0129688175007',
    '000000',
  ])('ids with a leading zero are invalid: %s', (input) => {
    expect(parseInput(input)).toStrictEqual(UNRECOGNISED)
  })

  it('lichess: the id keeps its case and is sliced to exactly 8 characters', () => {
    expect(parseInput('https://lichess.org/AbCdEfGhIjKl')).toStrictEqual(li('AbCdEfGh'))
    expect(parseInput('lichess.org/AbCdEfGh/white')).toStrictEqual(li('AbCdEfGh'))
    expect(parseInput('https://lichess.org/embed/game/4S1PZUvW')).toStrictEqual(li('4S1PZUvW'))
    expect(parseInput('https://lichess.org/4S1PZUvW?color=white#7')).toStrictEqual(li('4S1PZUvW'))
  })

  it('lichess: a path that is not 8 id characters is unrecognised', () => {
    expect(parseInput('https://lichess.org/abc')).toStrictEqual(UNRECOGNISED)
    expect(parseInput('https://lichess.org/')).toStrictEqual(UNRECOGNISED)
  })

  it('lichess non-game paths map to their what', () => {
    expect(parseInput('https://lichess.org/broadcast/some-event/round-1/AbCdEfGh')).toStrictEqual(
      notAGame('broadcast'),
    )
    expect(parseInput('https://lichess.org/training')).toStrictEqual(notAGame('puzzle'))
    expect(parseInput('https://lichess.org/tournament/AbCdEfGh')).toStrictEqual(notAGame('page'))
    expect(parseInput('https://lichess.org/streamer')).toStrictEqual(notAGame('page'))
  })

  it('a bare pgn tag pair anywhere in the text makes it a pgn, before any URL rule', () => {
    const text = 'see https://www.chess.com/game/live/184718495500\n[White "x"]\n1. e4 e5'
    expect(parseInput(text)).toStrictEqual({ kind: 'pgn', pgn: text })
  })

  it('empty and whitespace-only input is unrecognised', () => {
    expect(parseInput('')).toStrictEqual(UNRECOGNISED)
    expect(parseInput('   \n ')).toStrictEqual(UNRECOGNISED)
  })
})
