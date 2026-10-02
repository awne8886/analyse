// PROMPT.md Appendix A.1: the regex set (verbatim) and the order of checks.
import type { ChesscomKind, ParsedInput } from '../types/game'

// chess.com: group1 = kind (live|daily|computer), group2 = id
const CHESSCOM_GAME =
  /^(?:https?:\/\/)?(?:[\w-]+\.)*chess\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:(?:analysis|share)\/)?(?:game\/)?(live|daily|computer)(?:\/game)?(?:\/default)?\/(\d{1,15})(?:[/?#].*)?$/i
// legacy forms, both LIVE
const CHESSCOM_LEGACY_LIVECHESS = /chess\.com\/livechess\/game\?id=(\d{1,15})/i // 301 → /game/live/{id}
const CHESSCOM_LEGACY_HASH = /chess\.com\/live#g=(\d{1,15})/i
// legacy form, DAILY (verified 301)
const CHESSCOM_LEGACY_ECHESS = /chess\.com\/echess\/game\?id=(\d{1,15})/i
// ambiguous bare id → ask user
const CHESSCOM_BARE = /^(?:https?:\/\/)?(?:[\w-]+\.)*chess\.com\/game\/(\d{1,15})(?:[/?#].*)?$/i
// lichess: group1 = 8-char id; 12-char player ids are truncated to 8
const LICHESS_GAME =
  /^(?:https?:\/\/)?(?:[\w-]+\.)?lichess\.org\/(?:game\/export\/|embed\/game\/|api\/game\/)?([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?:\/(?:white|black))?(?:[/?#].*)?$/
const LICHESS_RESERVED = new Set(['analysis', 'practice', 'training', 'streamer'])
const LICHESS_NOT_A_GAME =
  /lichess\.org\/(?:(study|training|broadcast|analysis|tournament|swiss|simul|team|forum|video|learn|editor|paste|import|player|games|tv|puzzle|coach)\b|@\/)/ // '@' is followed by '/', not a word boundary, so it is matched literally

const PGN_TAG_PAIR = /\[\w+ "[^"]*"\]/
const PGN_MOVETEXT_START = /^\s*1\./
const BARE_ID = /^\d{6,15}$/
const VALID_ID = /^[1-9]\d*$/ // id 0 and ids with leading zeros are invalid

type NotAGameWhat = Extract<ParsedInput, { kind: 'lichess_not_a_game' }>['what']
const NOT_A_GAME_WHAT: Record<string, NotAGameWhat> = {
  study: 'study chapter',
  training: 'puzzle',
  puzzle: 'puzzle',
  broadcast: 'broadcast',
}

const UNRECOGNISED: ParsedInput = { kind: 'unrecognised' }

function chesscom(cckind: ChesscomKind | 'unknown', id: string, username?: string | null): ParsedInput {
  if (!VALID_ID.test(id)) return UNRECOGNISED
  return username ? { kind: 'chesscom', cckind, id, username } : { kind: 'chesscom', cckind, id }
}

export function parseInput(text: string): ParsedInput {
  const s = text.trim()
  if (s === '') return UNRECOGNISED
  if (PGN_TAG_PAIR.test(s) || PGN_MOVETEXT_START.test(s)) return { kind: 'pgn', pgn: s }

  const notAGame = LICHESS_NOT_A_GAME.exec(s)
  if (notAGame) return { kind: 'lichess_not_a_game', what: NOT_A_GAME_WHAT[notAGame[1] ?? ''] ?? 'page' }
  const lichess = LICHESS_GAME.exec(s)
  if (lichess) {
    if (LICHESS_RESERVED.has(lichess[1])) {
      return { kind: 'lichess_not_a_game', what: NOT_A_GAME_WHAT[lichess[1]] ?? 'page' }
    }
    return { kind: 'lichess', id: lichess[1].slice(0, 8) }
  }

  const game = CHESSCOM_GAME.exec(s)
  if (game) {
    let username: string | null
    try {
      username = new URL(s.startsWith('http') ? s : 'https://' + s).searchParams.get('username')
    } catch {
      username = null
    }
    return chesscom(game[1].toLowerCase() as ChesscomKind, game[2], username)
  }
  const legacyLive = CHESSCOM_LEGACY_LIVECHESS.exec(s) ?? CHESSCOM_LEGACY_HASH.exec(s)
  if (legacyLive) return chesscom('live', legacyLive[1])
  const legacyDaily = CHESSCOM_LEGACY_ECHESS.exec(s)
  if (legacyDaily) return chesscom('daily', legacyDaily[1])
  const bare = CHESSCOM_BARE.exec(s)
  if (bare) return chesscom('unknown', bare[1])
  if (BARE_ID.test(s)) return chesscom('unknown', s)
  return UNRECOGNISED
}
