// Shared contracts (PROMPT.md Appendix B.0). Frozen after Phase 0: implementers never edit this file.
export type Site = 'chesscom' | 'lichess' | 'pgn'
export type ChesscomKind = 'live' | 'daily' | 'computer'
export type ParsedInput =
  | { kind: 'chesscom'; cckind: ChesscomKind | 'unknown'; id: string; username?: string }
  | { kind: 'lichess'; id: string }
  | { kind: 'pgn'; pgn: string }
  | { kind: 'unrecognised' }
  | { kind: 'lichess_not_a_game'; what: 'study chapter' | 'puzzle' | 'broadcast' | 'page' }
export interface Player {
  name: string
  rating?: number
  title?: string
  avatarUrl?: string
  isComputer?: boolean
  countryCode?: string
}
export interface GameMove {
  ply: number
  color: 'w' | 'b'
  san: string
  uci: string
  from: string
  to: string
  piece: string
  captured?: string
  promotion?: string
  before: string
  after: string
  // before/after are full FENs; ply is 1-based; terminal is set by the importer during its single replay of the
  // game on one chess.js instance (isCheckmate(), isStalemate(), isInsufficientMaterial(), isThreefoldRepetition(),
  // isDrawByFiftyMoves() after each move); repetition needs the move history, so it is never recomputed from a FEN
  terminal?: 'checkmate' | 'stalemate' | 'insufficient' | 'repetition' | 'fifty'
}
export interface ImportedGame {
  id: string // the game id forms of PROMPT.md section 3.3
  site: Site
  kind?: ChesscomKind
  sourceUrl?: string
  startFen: string
  customStart: boolean // customStart = first 4 FEN fields differ from the standard start
  moves: GameMove[]
  white: Player
  black: Player
  result: '1-0' | '0-1' | '1/2-1/2' | '*'
  termination?: string
  timeControl?: string
  timeClass?: string
  date?: string
  rated?: boolean
  eco?: string
  openingName?: string
  clocks?: (number | null)[] // tenths of a second remaining after each ply, when known
  inProgress: boolean // true once the user accepted "Analyse so far"
  reportedAccuracies?: { white: number; black: number } // chess.com public API 'accuracies'
}
export type ImportErrorCode =
  | 'unrecognised'
  | 'ambiguous_kind'
  | 'live_not_found'
  | 'daily_not_found'
  | 'computer_not_found'
  | 'computer_via_public_api'
  | 'zero_moves'
  | 'decode_failed'
  | 'variant_chess960'
  | 'variant_unsupported'
  | 'type_unknown'
  | 'proxy_blocked'
  | 'proxy_rate_limited'
  | 'proxy_timeout'
  | 'proxy_unreachable'
  | 'pages_needs_username'
  | 'user_not_found'
  | 'archive_blocked'
  | 'archive_not_found'
  | 'lichess_not_found'
  | 'lichess_rate_limited'
  | 'lichess_not_a_game'
  | 'pgn_multiple'
  | 'pgn_unfinished'
  | 'pgn_not_cached'
  | 'in_progress_daily'
  | 'in_progress_lichess'
export interface ImportError {
  code: ImportErrorCode
  message: string
  detail?: Record<string, string | number>
  needsUsername?: boolean
  choices?: ImportedGame[]
}
export type ImportResult =
  | {
      ok: true
      game: ImportedGame
      via: 'proxy' | 'rewrite' | 'public-api' | 'lichess' | 'pgn'
      notice?: 'ambiguous_resolved' | 'custom_start'
      pendingConfirmation?: 'in_progress_daily' | 'in_progress_lichess' | 'pgn_unfinished'
    }
  | { ok: false; error: ImportError }
