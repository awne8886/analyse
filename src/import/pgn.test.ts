// PGN paste (PROMPT.md section 3.3): tag pairs, movetext with comments / variations / NAGs, [%clk] clocks, the
// multi-game chooser (I-33), the `pgn:` id (first 12 hex of SHA-256 of the normalised movetext), the single replay
// that sets GameMove.terminal, and confirmInProgress.
import { describe, expect, it } from 'vitest'
import { readFixtureText } from '../test/loadFixture'
import type { ImportResult } from '../types/game'
import { IMPORT_STRINGS, confirmInProgress, importGame, parseInput, type ImportOptions } from './index'
import { parsePgn, splitPgnGames } from './pgn'

const OPTS: ImportOptions = { deployTarget: 'vercel', proxyUrl: '/api/chesscom' }
const importPgn = (pgn: string) => importGame({ kind: 'pgn', pgn }, OPTS)
function gameOf(r: ImportResult) {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}: ${r.error.message}`)
  return r
}
function errorOf(r: ImportResult) {
  if (r.ok) throw new Error(`expected an error, got game ${r.game.id}`)
  return r.error
}
async function sha12(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}

describe('parsePgn', () => {
  it('reads tag pairs (with escapes) and the main line, skipping comments, variations, NAGs and move numbers', () => {
    const p = parsePgn(
      [
        '[Event "Club \\"Open\\""]',
        '[White "O\\\'Neill"]',
        '[Black "B"]',
        '',
        '1. e4 $1 {best by test} (1. d4 d5 (1... Nf6) 2. c4) 1... e5!? 2.Nf3 Nc6 ; a line comment',
        '3. Bb5?! a6 *',
      ].join('\n'),
    )
    expect(p.headers).toEqual({ Event: 'Club "Open"', White: "O'Neill", Black: 'B' })
    expect(p.sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'])
    expect(p.resultToken).toBe('*')
  })

  it('reads [%clk] after each ply in tenths of a second, null where a ply has none', () => {
    const p = parsePgn('1. e4 {[%clk 0:03:00]} e5 2. Nf3 {[%clk 1:00:00.5]} {[%eval 0.3]} *')
    expect(p.sans).toEqual(['e4', 'e5', 'Nf3'])
    expect(p.clocks).toEqual([1800, null, 36005])
  })

  it('splits a file into games at each [Event block that follows movetext', () => {
    const multi = readFixtureText('pgn/multi-game.pgn')
    expect(splitPgnGames(multi)).toHaveLength(2)
    // a tag written before [Event belongs to the same game
    expect(
      splitPgnGames(`[Variant "Standard"]\n${readFixtureText('pgn/standard-finished.pgn')}`),
    ).toHaveLength(1)
  })
})

describe('PGN import', () => {
  it('maps headers and clocks, and hashes the normalised movetext into the pgn: id', async () => {
    const text = readFixtureText('pgn/standard-finished.pgn').trim()
    const r = gameOf(await importPgn(text))
    const sans = r.game.moves.map((m) => m.san)
    expect(r.game.id).toBe(`pgn:${await sha12(sans.join(' '))}`)
    expect(r.game).toMatchObject({
      site: 'pgn',
      result: '1-0',
      date: '1858-11-02',
      white: { name: 'Paul Morphy' },
      black: { name: 'Duke of Brunswick and Count Isouard' },
      customStart: false,
    })
    expect(r.game.clocks?.[32]).toBe(4240) // {[%clk 0:07:04]} after 17. Rd8#
  })

  it('the id ignores headers, comments and move-number spacing', async () => {
    const a = gameOf(await importPgn('[White "A"]\n\n1. e4 {hi} e5 2. Nf3 *'))
    const b = gameOf(await importPgn('1.e4 e5 2.Nf3 (2. Nc3) 1-0'))
    expect(a.game.id).toBe(b.game.id)
  })

  it('the single replay sets terminal: checkmate on the mating ply, nothing before it', async () => {
    const r = gameOf(await importPgn(readFixtureText('pgn/standard-finished.pgn')))
    expect(r.game.moves[32]).toMatchObject({ ply: 33, san: 'Rd8#', terminal: 'checkmate' })
    expect(r.game.moves.slice(0, 32).every((m) => m.terminal === undefined)).toBe(true)
  })

  it('terminal: stalemate, insufficient material, threefold repetition and the fifty-move rule', async () => {
    const stalemate = gameOf(await importPgn('[FEN "7k/5K2/8/8/8/8/6Q1/8 w - - 0 1"]\n\n1. Qg6 1/2-1/2'))
    expect(stalemate.game.moves[0].terminal).toBe('stalemate')
    const insufficient = gameOf(await importPgn('[FEN "7k/8/8/8/8/8/1q6/K7 w - - 0 1"]\n\n1. Kxb2 1/2-1/2'))
    expect(insufficient.game.moves[0].terminal).toBe('insufficient')
    const repetition = gameOf(await importPgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2'))
    expect(repetition.game.moves.map((m) => m.terminal ?? null)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      'repetition',
    ])
    const fifty = gameOf(await importPgn('[FEN "7k/8/8/8/8/8/R7/K7 w - - 99 80"]\n\n80. Ra3 1/2-1/2'))
    expect(fifty.game.moves[0].terminal).toBe('fifty')
  })

  it('pgn_multiple: the chooser lists every analysable game, with the I-33 string', async () => {
    const e = errorOf(await importPgn(readFixtureText('pgn/multi-game.pgn')))
    expect(e.code).toBe('pgn_multiple')
    expect(e.message).toBe(IMPORT_STRINGS['I-33'].replace('{n}', '2'))
    expect(e.choices?.map((g) => [g.white.name, g.black.name, g.result])).toEqual([
      ['Alice', 'Bob', '1-0'],
      ['Carol', 'Dave', '1/2-1/2'],
    ])
    expect(e.choices?.[0].moves[6]).toMatchObject({ san: 'Qxf7#', terminal: 'checkmate' })
  })

  it('pgn_multiple: a game that cannot be analysed is not offered as a choice', async () => {
    const two = `${readFixtureText('pgn/standard-finished.pgn')}\n\n${readFixtureText('pgn/chess960.pgn')}`
    const e = errorOf(await importPgn(two))
    expect(e.code).toBe('pgn_multiple')
    expect(e.choices?.map((g) => g.white.name)).toEqual(['Paul Morphy'])
  })

  it('an illegal move reports its 1-based ply, never a partial game', async () => {
    const e = errorOf(await importPgn('1. e4 e5 2. Ke3 Nc6 *'))
    expect(e.code).toBe('decode_failed')
    expect(e.detail).toEqual({ n: 3 })
  })

  it('castling written with zeros is accepted', async () => {
    const r = gameOf(await importPgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. 0-0 *'))
    expect(r.game.moves[6].san).toBe('O-O')
  })

  it('a pasted PGN goes through parseInput unchanged and imports', async () => {
    const parsed = parseInput(`\n${readFixtureText('pgn/standard-finished.pgn')}\n`)
    expect(parsed.kind).toBe('pgn')
    expect(gameOf(await importGame(parsed, OPTS)).via).toBe('pgn')
  })

  it('confirmInProgress returns a copy with inProgress set and leaves the original untouched', async () => {
    const r = gameOf(await importPgn(readFixtureText('pgn/unfinished.pgn')))
    expect(r.pendingConfirmation).toBe('pgn_unfinished')
    const accepted = confirmInProgress(r.game)
    expect(accepted).not.toBe(r.game)
    expect(accepted.inProgress).toBe(true)
    expect(r.game.inProgress).toBe(false)
  })
})
