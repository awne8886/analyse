// String-table snapshot of PROMPT.md Appendix F (R28-style). The I- and P-rows are snapshotted in
// src/import/errors.test.ts; this file covers F.3 (ENGINE_STRINGS) and F.4 + F.5 (UI_STRINGS).
//
// UI_STRINGS key scheme (binding for the implementer; flat Record<string, string>, dotted keys):
//   headline.<class>            suffix after the SAN, R25 ("is brilliant"); <class> is the lowercase classification
//                               name: brilliant great best excellent good book inaccuracy mistake miss blunder forced
//   tooltip.class.<class>       classification one-liner for tooltips (F.4)
//   label.chesscomReported      "Chess.com reported: {white} / {black}"
//   label.bot | label.notAvailable | label.none      "Bot" | "n/a" | "None"
//   button.<name>               startReview back showBest showReply retry prev next keyMoves share
//   toggle.explain              "Explain"
//   message.linkCopied          "Link copied"
//   settings.<name>             retestSpeed coachAddresses coloredMoves sounds pieces theme
//   evalbar.<end>               text after the last move: whiteWins blackWins draw unknown
//   result.<end>                players-row result: whiteWins blackWins draw unknown
//   retry.<grade>               correct good ok incorrect checking tryAgain
//   praise.correct.<1..4>       praise lines for Correct; praise.correct.3 only when the retried move is Brilliant
//   honesty                     the honesty line (About panel and README)
//   tooltip.G-T1 .. G-T5        Appendix F.5 tooltips; tooltip.G-T2.acplSuffix is appended for the ACPL fallback
//   about.<name>                engine source notAffiliated trademark browsers licenses
//   attribution.<site>          chesscom lichess pgn
// Placeholders are named, in braces, and stay in the stored string: {white} {black} {color} {phase} {acc} {repo}.
// {color} replaces the F.4 alternation {White|Black} and {phase} replaces {opening|middlegame|endgame}.
// UI_STRINGS may hold further keys for labels outside Appendix F; every key below must exist with exactly
// this value. ENGINE_STRINGS holds exactly E-1 .. E-10 plus E-8b.
import { describe, expect, it } from 'vitest'
import { ENGINE_STRINGS } from '../engine'
import { UI_STRINGS } from './strings'

const EXPECTED_ENGINE_STRINGS: Record<string, string> = {
  'E-1':
    "Your browser can't run the analysis engine. It needs WebAssembly SIMD, which is available in Safari 16.4+ (iOS 16.4+), Chrome 91+, Firefox 89+, Edge 91+. Please update your browser or open this page on a newer device.",
  'E-2':
    "The engine couldn't start (WebAssembly error: {message}). This usually means the device is low on memory. Close other tabs and apps, then tap Retry. If it keeps failing, use a desktop browser.",
  'E-3': 'Analysis was interrupted (your device ran out of memory). Resuming from move {n} in fast mode.',
  'E-4': 'Fast mode (depth 14)',
  'E-5': 'Multi-core: {n} threads',
  'E-6': 'Single-core mode',
  'E-7': 'Enabling multi-core analysis…',
  'E-8': 'Analysing move {n} of {total}, about {s} s left',
  'E-8b': 'Keep this tab in the foreground while analysing.',
  'E-9': 'Not analysed (engine timed out on this position).',
  'E-10': 'Refining {k} candidate moves…',
}

const EXPECTED_UI_STRINGS: Record<string, string> = {
  // F.4 headlines (R25): rendered as "<SAN> <headline>"
  'headline.brilliant': 'is brilliant',
  'headline.great': 'is a great move',
  'headline.best': 'is best',
  'headline.excellent': 'is excellent',
  'headline.good': 'is good',
  'headline.book': 'is a book move',
  'headline.inaccuracy': 'is an inaccuracy',
  'headline.mistake': 'is a mistake',
  'headline.miss': 'is a miss',
  'headline.blunder': 'is a blunder',
  'headline.forced': 'is forced',

  // F.4 classification one-liners
  'tooltip.class.brilliant': 'The best move, and a sacrifice that was hard to find',
  'tooltip.class.great': 'The one move that changed the course of the game',
  'tooltip.class.best': "The engine's first choice",
  'tooltip.class.excellent': "Within a hair of the engine's choice",
  'tooltip.class.good': 'A reasonable move, not the best',
  'tooltip.class.book': 'A known opening move',
  'tooltip.class.inaccuracy': 'A small slip',
  'tooltip.class.mistake': 'A move that clearly worsens the position',
  'tooltip.class.miss': 'A missed chance to punish or to win',
  'tooltip.class.blunder': 'A serious error that swings the game',
  'tooltip.class.forced': 'The only legal move',

  // F.4 labels, buttons, toggle, share, settings
  'label.chesscomReported': 'Chess.com reported: {white} / {black}',
  'button.startReview': 'Start Review',
  'button.back': 'Highlights',
  'button.showBest': 'Show best',
  'button.showReply': 'Show reply',
  'button.retry': 'Retry',
  'button.prev': 'Prev',
  'button.next': 'Next',
  'button.keyMoves': 'Key Moves',
  'toggle.explain': 'Explain',
  'button.share': 'Share',
  'message.linkCopied': 'Link copied',
  'settings.retestSpeed': 'Re-test speed',
  'settings.coachAddresses': 'Coach addresses: me / neutral',
  'settings.coloredMoves': 'Coloured moves',
  'settings.sounds': 'Sounds',
  'settings.pieces': 'Pieces: Kaneo / cburnett',
  'settings.theme': 'Theme: dark / light',

  // F.4 eval bar end text, players row result, bot / n/a / None markers
  'evalbar.whiteWins': '1-0',
  'evalbar.blackWins': '0-1',
  'evalbar.draw': '1/2-1/2',
  'evalbar.unknown': '*',
  'result.whiteWins': '1-0',
  'result.blackWins': '0-1',
  'result.draw': '½-½',
  'result.unknown': '*',
  'label.bot': 'Bot',
  'label.notAvailable': 'n/a',
  'label.none': 'None',

  // F.4 retry feedback
  'retry.correct': 'Correct',
  'retry.good': 'Good',
  'retry.ok': 'OK',
  'retry.incorrect': 'Incorrect',
  'retry.checking': 'Checking...',
  'praise.correct.1': "Yes, that's the move.",
  'praise.correct.2': 'Found it.',
  'praise.correct.3': "That's the sacrifice.",
  'praise.correct.4': 'Exactly what the engine wants.',
  'retry.tryAgain': 'Not this one. Try again or press Show best.',

  // F.4 honesty line
  honesty:
    "Labels follow chess.com's published expected-points bands; accuracy was calibrated to within about 4 points (mean absolute error) of chess.com's on 244 game sides. Results are an approximation, not chess.com's numbers.",

  // F.5 tooltips
  'tooltip.G-T1':
    "Accuracy: 0 to 100, how close each side's moves came to the engine's top choices. Chess.com-style; it approximates Chess.com's number.",
  'tooltip.G-T2':
    "Estimated rating: what this one game's accuracy suggests about the player's strength. An approximation, not a Chess.com figure.",
  'tooltip.G-T2.acplSuffix': ' (rough estimate, no rating known.)',
  'tooltip.G-T3': '{color} in the {phase}: accuracy {acc}, shown as a move-quality icon.',
  'tooltip.G-T4': 'No grade: {color} made fewer than 4 {phase} moves.',
  'tooltip.G-T5': "From Chess.com's own review of this game, when the public API provided it.",

  // F.5 About panel lines (the three links are not strings: they are asserted by the About panel test)
  'about.engine':
    'Engine: Stockfish 19 via stockfish.js v19.0.0 (stockfish.js (c) Chess.com, LLC / Nathan Rugg; Stockfish (c) the Stockfish developers), GPLv3.',
  'about.source': "This site's source is GPL-3.0-or-later: {repo}.",
  'about.notAffiliated': 'Not affiliated with Chess.com.',
  'about.trademark': 'Chess.com is a trademark of Chess.com, LLC.',
  'about.browsers': 'Minimum browsers: Safari/iOS 16.4+, Chrome 91+, Firefox 89+, Edge 91+.',
  'about.licenses': 'Licenses',

  // F.5 attribution
  'attribution.chesscom': 'Game data from Chess.com',
  'attribution.lichess': 'Game data from Lichess',
  'attribution.pgn': 'Game data from a pasted PGN',
}

describe('ENGINE_STRINGS (Appendix F.3)', () => {
  it('matches the table exactly: E-1 .. E-10 plus E-8b, nothing else', () => {
    expect(ENGINE_STRINGS).toEqual(EXPECTED_ENGINE_STRINGS)
  })

  it('has the keys in the F.3 set', () => {
    expect(Object.keys(ENGINE_STRINGS).sort()).toEqual(
      ['E-1', 'E-2', 'E-3', 'E-4', 'E-5', 'E-6', 'E-7', 'E-8', 'E-8b', 'E-9', 'E-10'].sort(),
    )
  })

  it('uses the F.3 placeholders', () => {
    expect(ENGINE_STRINGS['E-2'] ?? '').toContain('{message}')
    expect(ENGINE_STRINGS['E-3'] ?? '').toContain('{n}')
    expect(ENGINE_STRINGS['E-5'] ?? '').toContain('{n}')
    for (const p of ['{n}', '{total}', '{s}']) expect(ENGINE_STRINGS['E-8'] ?? '').toContain(p)
    expect(ENGINE_STRINGS['E-10'] ?? '').toContain('{k}')
  })
})

describe('UI_STRINGS (Appendix F.4 and F.5)', () => {
  it('holds every F.4 and F.5 string under its key, byte for byte', () => {
    expect(UI_STRINGS).toMatchObject(EXPECTED_UI_STRINGS)
  })

  it.each(Object.entries(EXPECTED_UI_STRINGS))('%s', (key, value) => {
    expect(UI_STRINGS[key]).toBe(value)
  })

  it('keeps the named placeholders in the stored strings', () => {
    expect(UI_STRINGS['label.chesscomReported'] ?? '').toContain('{white}')
    expect(UI_STRINGS['label.chesscomReported'] ?? '').toContain('{black}')
    for (const p of ['{color}', '{phase}', '{acc}']) expect(UI_STRINGS['tooltip.G-T3'] ?? '').toContain(p)
    for (const p of ['{color}', '{phase}']) expect(UI_STRINGS['tooltip.G-T4'] ?? '').toContain(p)
    expect(UI_STRINGS['about.source'] ?? '').toContain('{repo}')
  })

  it('has one headline and one tooltip per classification (11 each)', () => {
    const classes = [
      'brilliant',
      'great',
      'best',
      'excellent',
      'good',
      'book',
      'inaccuracy',
      'mistake',
      'miss',
      'blunder',
      'forced',
    ]
    for (const c of classes) {
      expect(UI_STRINGS[`headline.${c}`]).toBeTruthy()
      expect(UI_STRINGS[`tooltip.class.${c}`]).toBeTruthy()
    }
  })

  it('uses plain hyphens, never en or em dashes, in every string', () => {
    expect(Object.keys(UI_STRINGS).length).toBeGreaterThanOrEqual(Object.keys(EXPECTED_UI_STRINGS).length)
    for (const value of Object.values(UI_STRINGS)) expect(value).not.toMatch(/[–—]/)
    for (const value of Object.values(ENGINE_STRINGS)) expect(value).not.toMatch(/[–—]/)
  })

  it('holds no import-table wording (R28 grep): no "Couldn\'t", "isn\'t supported" or "can\'t be analysed"', () => {
    expect(Object.keys(UI_STRINGS).length).toBeGreaterThanOrEqual(Object.keys(EXPECTED_UI_STRINGS).length)
    for (const value of Object.values(UI_STRINGS)) {
      expect(value).not.toMatch(/couldn't/i)
      expect(value).not.toMatch(/isn't supported/i)
      expect(value).not.toMatch(/can't be analysed/i)
    }
  })
})
