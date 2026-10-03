// Edge cases of the ImportError -> Appendix F key mapping (src/state/importKeys.ts): every code the importer can
// raise must resolve to a row that exists in the import string table and can be rendered, because the controller
// shows that key (the module-supplied message is only a fallback).
import { describe, expect, it } from 'vitest'
import { IMPORT_STRINGS, formatImportString } from '../import'
import type { ImportError, ImportErrorCode, ImportedGame } from '../types/game'
import { importErrorText, wantsUsername } from './importKeys'

// A Record over the union: adding an ImportErrorCode without listing it here fails the typecheck.
const ALL_CODES: Record<ImportErrorCode, true> = {
  unrecognised: true,
  ambiguous_kind: true,
  live_not_found: true,
  daily_not_found: true,
  computer_not_found: true,
  computer_via_public_api: true,
  zero_moves: true,
  decode_failed: true,
  variant_chess960: true,
  variant_unsupported: true,
  type_unknown: true,
  proxy_blocked: true,
  proxy_rate_limited: true,
  proxy_timeout: true,
  proxy_unreachable: true,
  pages_needs_username: true,
  user_not_found: true,
  archive_blocked: true,
  archive_not_found: true,
  lichess_not_found: true,
  lichess_rate_limited: true,
  lichess_not_a_game: true,
  pgn_multiple: true,
  pgn_unfinished: true,
  pgn_not_cached: true,
  in_progress_daily: true,
  in_progress_lichess: true,
}
const codes = Object.keys(ALL_CODES) as ImportErrorCode[]

describe('importErrorText: every import error code has a real string row', () => {
  it.each(codes)('%s maps to a key present in the import string table', (code) => {
    const { key } = importErrorText({ code, message: 'fallback text' })
    expect(Object.hasOwn(IMPORT_STRINGS, key), `${code} -> ${key}`).toBe(true)
    // rendering with the placeholders the importer supplies never throws
    expect(() =>
      formatImportString(key, { kind: 'x', variant: 'Atomic', what: 'puzzle', n: 2, months: 3, id: '1' }),
    ).not.toThrow()
  })

  it('distinct codes never share one key by accident, except the documented pairs', () => {
    const byKey = new Map<string, ImportErrorCode[]>()
    for (const code of codes) {
      const { key } = importErrorText({ code, message: '' })
      byKey.set(key, [...(byKey.get(key) ?? []), code])
    }
    expect([...byKey.values()].filter((v) => v.length > 1)).toEqual([])
  })
})

describe('importErrorText: placeholders', () => {
  it('a named variant uses I-14 with the variant name, an unnamed one the bughouse row I-13', () => {
    const named = importErrorText({
      code: 'variant_unsupported',
      message: 'm',
      detail: { variant: 'Atomic' },
    })
    expect(named.key).toBe('I-14')
    expect(formatImportString(named.key, named.vars)).toBe(
      "Atomic games can't be analysed (Stockfish doesn't play this variant).",
    )
    const bughouse = importErrorText({ code: 'variant_unsupported', message: 'm' })
    expect(bughouse.key).toBe('I-13')
  })

  it('pgn_multiple takes the game count from the choices when the detail has none, and keeps an explicit one', () => {
    const choices = [{}, {}, {}] as unknown as ImportedGame[]
    const derived = importErrorText({ code: 'pgn_multiple', message: 'm', choices })
    expect(derived.vars).toEqual({ n: 3 })
    expect(formatImportString(derived.key, derived.vars)).toBe('This PGN contains 3 games. Pick one.')
    const explicit = importErrorText({ code: 'pgn_multiple', message: 'm', detail: { n: 7 }, choices })
    expect(explicit.vars).toEqual({ n: 7 })
  })

  it('does not mutate the error it was given and passes its message on as the fallback', () => {
    const error: ImportError = { code: 'lichess_not_a_game', message: 'raw', detail: { what: 'study' } }
    const text = importErrorText(error)
    text.vars!.what = 'changed'
    expect(error.detail).toEqual({ what: 'study' })
    expect(text.fallback).toBe('raw')
  })
})

describe('wantsUsername: which errors send the focus to the username field', () => {
  it('is true for the four username-field strings and for needsUsername', () => {
    for (const code of [
      'proxy_blocked',
      'proxy_timeout',
      'proxy_unreachable',
      'pages_needs_username',
    ] as const)
      expect(wantsUsername({ code, message: '' })).toBe(true)
    expect(wantsUsername({ code: 'live_not_found', message: '', needsUsername: true })).toBe(true)
  })

  it('is false for the rest', () => {
    const rest = codes.filter(
      (c) => !['proxy_blocked', 'proxy_timeout', 'proxy_unreachable', 'pages_needs_username'].includes(c),
    )
    for (const code of rest) expect(wantsUsername({ code, message: '' }), code).toBe(false)
  })
})
