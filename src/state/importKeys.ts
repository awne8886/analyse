// Maps an ImportError to the Appendix F row key its string lives under (IMPORT_STRINGS, src/import/errors.ts).
import type { ImportError, ImportErrorCode } from '../types/game'
import type { KeyedText } from './reviewStore'

const KEY_BY_CODE: Record<ImportErrorCode, string> = {
  unrecognised: 'I-34',
  ambiguous_kind: 'I-10b',
  live_not_found: 'I-2',
  daily_not_found: 'I-6',
  computer_not_found: 'I-7',
  computer_via_public_api: 'I-8',
  zero_moves: 'I-11',
  decode_failed: 'I-11b',
  variant_chess960: 'I-12',
  variant_unsupported: 'I-13',
  type_unknown: 'I-17',
  proxy_blocked: 'P-1',
  proxy_rate_limited: 'P-3',
  proxy_timeout: 'P-4',
  proxy_unreachable: 'I-18',
  pages_needs_username: 'P-5',
  user_not_found: 'P-6',
  archive_blocked: 'P-7',
  archive_not_found: 'P-9',
  lichess_not_found: 'I-26',
  lichess_rate_limited: 'I-27b',
  lichess_not_a_game: 'I-28',
  pgn_multiple: 'I-33',
  pgn_unfinished: 'I-30',
  pgn_not_cached: 'I-37',
  in_progress_daily: 'I-4',
  in_progress_lichess: 'I-20',
}

/** The keyed message of an import error: I-14 (named variant) when the error names one, I-13 (bughouse) otherwise. */
export function importErrorText(error: ImportError): KeyedText {
  const vars = { ...(error.detail ?? {}) }
  if (error.code === 'pgn_multiple' && vars.n === undefined && error.choices) vars.n = error.choices.length
  const key = error.code === 'variant_unsupported' && vars.variant !== undefined ? 'I-14' : KEY_BY_CODE[error.code]
  return { key, vars, fallback: error.message }
}

/** Errors whose string is shown next to the username field, which then takes the focus (P-1, P-4, P-5, I-18). */
export function wantsUsername(error: ImportError): boolean {
  return (
    error.needsUsername === true ||
    ['proxy_blocked', 'proxy_timeout', 'proxy_unreachable', 'pages_needs_username'].includes(error.code)
  )
}
