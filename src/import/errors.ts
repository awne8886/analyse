// User-facing import strings (PROMPT.md Appendix F.1 I-rows and F.2 P-rows), keyed by the Appendix F row key.
// Placeholders keep the appendix names except the alternations, which are named: I-10a {kind}, I-14 {variant},
// I-28 {what}; P-9 {months} (PLAN.md Assumption 7). 'I-27b' is the second I-27 sentence.
import type { ImportError, ImportErrorCode, ImportedGame } from '../types/game'

export const IMPORT_STRINGS: Record<string, string> = {
  'I-2':
    "Couldn't find this live game. If it's still being played, Chess.com only publishes it once it ends. Try again after the game finishes.",
  'I-4': 'This daily game is still in progress ({plyCount} moves so far). Analyse the moves played so far?',
  'I-6': 'No daily game with this id exists on Chess.com.',
  'I-7': 'No bot game with this id exists on Chess.com.',
  'I-8':
    "Games against Chess.com bots aren't in the public archive. Paste the game link (chess.com/game/computer/…) or the PGN instead.",
  'I-10a':
    "This link doesn't say whether it's a live or daily game. We found a {kind} game: {White} vs {Black}, {date}. If that's not the game you meant, open it on Chess.com and copy the full link (it contains /live/, /daily/ or /computer/).",
  'I-10b':
    "This link doesn't say whether it's a live, daily or bot game. Open the game on Chess.com and copy the full link (it contains /live/, /daily/ or /computer/).",
  'I-11': 'This game has no moves to analyse (it was aborted or decided before the first move).',
  'I-11b': "Couldn't decode this game's moves (problem at move {n}). Paste the PGN instead.",
  'I-12': "Chess960 games aren't supported yet.",
  'I-13': "Bughouse games can't be analysed (Stockfish doesn't play this variant).",
  'I-14': "{variant} games can't be analysed (Stockfish doesn't play this variant).",
  'I-15': 'Started from a custom position. Opening-book moves are not shown.',
  'I-17': "This game type ({type}) isn't supported.",
  'I-18': "Couldn't reach Chess.com right now. Try again in a moment, or paste the PGN.",
  'I-20':
    'This game is still in progress on Lichess (Lichess withholds the last 3 moves of live games). Analyse the moves available so far?',
  'I-21': 'Result unknown',
  'I-26':
    "Couldn't find this game on Lichess (or Lichess is unreachable). Check the link. It should look like lichess.org/AbCd1234.",
  'I-27': 'Lichess is rate-limiting requests. Retrying in 60 s…',
  'I-27b': 'Lichess is still rate-limiting requests. Wait a minute and try again.',
  'I-28': 'This is a Lichess {what}, not a game. Open the game and copy its link (lichess.org/XXXXXXXX).',
  'I-30': 'This PGN looks unfinished. Analyse the moves present?',
  'I-33': 'This PGN contains {n} games. Pick one.',
  'I-34':
    'Paste a Chess.com game link (chess.com/game/live/…, /daily/…, /computer/…), a Lichess game link (lichess.org/XXXXXXXX) or a PGN.',
  'I-36': 'In progress: {n} moves so far',
  'I-37': 'This review was made from a pasted PGN on another device; paste the PGN again.',
  'P-1':
    "Chess.com's firewall blocked our server's request (Cloudflare challenge). Enter the Chess.com username of either player and we'll fetch the game through Chess.com's public API instead, or paste the PGN.",
  'P-2': 'Chess.com is rate-limiting requests right now. Retrying in 2 seconds…',
  'P-3': 'Still rate-limited. Wait a minute and try again, or paste the PGN (Chess.com → Share → PGN).',
  'P-4': "Chess.com didn't answer in time. Try again, enter a player's username, or paste the PGN.",
  'P-5':
    "Importing by link needs a small server proxy, which this static build doesn't have. Enter the Chess.com username of either player (we'll find game {id} through Chess.com's public API), or paste the PGN.",
  'P-6': 'Chess.com has no player named "{username}".',
  'P-7':
    'Chess.com temporarily blocked archive downloads from your connection. Please paste the PGN (Chess.com → Share → PGN) or try again in a few minutes.',
  'P-8': 'Searching {YYYY}/{MM}…',
  'P-9':
    "Couldn't find game {id} in {username}'s recent archives ({months}). Check the username (either player works), or paste the PGN.",
  'P-10': 'Chess.com username (optional: shows which side is yours and is used as a fallback)',
  'P-11': 'Chess.com username of either player (required for Chess.com links)',
}

/** The Appendix F key of each error code (I-4 is shared by I-5; the in-progress codes are confirmations). */
const KEY_OF_CODE: Record<ImportErrorCode, string> = {
  unrecognised: 'I-34',
  ambiguous_kind: 'I-10b',
  live_not_found: 'I-2',
  daily_not_found: 'I-6',
  computer_not_found: 'I-7',
  computer_via_public_api: 'I-8',
  zero_moves: 'I-11',
  decode_failed: 'I-11b',
  variant_chess960: 'I-12',
  variant_unsupported: 'I-14',
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

/** Fills `{name}` placeholders; unknown placeholders are left as written. */
export function formatImportString(key: string, params: Record<string, string | number> = {}): string {
  const template = IMPORT_STRINGS[key]
  if (template === undefined) throw new Error(`unknown import string key ${key}`)
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  )
}

/** An import failure carried as a thrown Error; `importGame` turns it into `{ ok: false, error }`. */
export class ImportFailure extends Error {
  readonly code: ImportErrorCode
  readonly detail?: Record<string, string | number>
  readonly needsUsername?: boolean
  readonly choices?: ImportedGame[]

  constructor(
    code: ImportErrorCode,
    detail?: Record<string, string | number>,
    extra: { key?: string; needsUsername?: boolean; choices?: ImportedGame[] } = {},
  ) {
    super(formatImportString(extra.key ?? KEY_OF_CODE[code], detail))
    this.name = 'ImportFailure'
    this.code = code
    if (detail !== undefined) this.detail = detail
    if (extra.needsUsername) this.needsUsername = true
    if (extra.choices !== undefined) this.choices = extra.choices
  }

  toImportError(): ImportError {
    const error: ImportError = { code: this.code, message: this.message }
    if (this.detail !== undefined) error.detail = this.detail
    if (this.needsUsername) error.needsUsername = true
    if (this.choices !== undefined) error.choices = this.choices
    return error
  }
}
