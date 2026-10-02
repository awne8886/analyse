// Mapping of chess.com data onto drafts: the callback JSON (proxy and rewrite paths) and a public API game entry.
// Players come from pgnHeaders (the callback `username` is a display name), colours from players.*.color (top and
// bottom are display slots), `\'` is unescaped, the bot side is flagged by players.*.isComputer.
import type { ChesscomKind, Player } from '../types/game'
import { compact, normaliseDate, normaliseResult, openingFromSlug, ratingOf, type Draft } from './draft'
import { ImportFailure } from './errors'
import { clocksOf, parsePgn, unescapeHeader } from './pgn'
import { STANDARD_FEN, playSan, replay } from './replay'
import { replayTcn } from './tcn'

interface CallbackPlayer {
  username?: string
  color?: string
  rating?: number
  chessTitle?: string | null
  avatarUrl?: string
  isComputer?: boolean
}
export interface CallbackBody {
  game: {
    moveList?: string
    plyCount?: number
    pgnHeaders?: Record<string, unknown>
    initialSetup?: string
    isFinished?: boolean
    type?: string
    rules?: string
    resultMessage?: string
    isRated?: boolean
    partnerGameId?: unknown
    moveTimestamps?: string | null
    timestamps?: number[] | null
  }
  players?: { top?: CallbackPlayer; bottom?: CallbackPlayer }
}

interface ArchiveSide {
  rating?: number
  result?: string
  username?: string
}
export interface ArchiveEntry {
  url: string
  pgn?: string
  tcn?: string
  time_control?: string
  rated?: boolean
  accuracies?: { white?: number; black?: number }
  initial_setup?: string
  time_class?: string
  rules?: string
  white?: ArchiveSide | string
  black?: ArchiveSide | string
  eco?: string
}

export const gameId = (kind: ChesscomKind, id: string) => `cc:${kind}:${id}`
export const gameUrl = (kind: ChesscomKind, id: string) => `https://www.chess.com/game/${kind}/${id}`

/** chess.com time classes from a TimeControl value: daily (`1/604800`), else base + 40 x increment. */
export function timeClassOf(timeControl: string | undefined): string | undefined {
  if (!timeControl || timeControl === '-') return undefined
  if (timeControl.includes('/')) return 'daily'
  const [base, inc] = timeControl.split('+').map(Number)
  if (!Number.isFinite(base)) return undefined
  const total = base + 40 * (Number.isFinite(inc) ? inc : 0)
  return total < 180 ? 'bullet' : total < 600 ? 'blitz' : 'rapid'
}

const headerString = (v: unknown): string | undefined =>
  typeof v === 'string' ? unescapeHeader(v) : typeof v === 'number' ? String(v) : undefined

function callbackClocks(g: CallbackBody['game']): (number | null)[] | undefined {
  const raw =
    typeof g.moveTimestamps === 'string' && g.moveTimestamps !== ''
      ? g.moveTimestamps.split(',').map(Number)
      : Array.isArray(g.timestamps)
        ? g.timestamps.map(Number)
        : []
  return raw.length > 0 ? raw.map((n) => (Number.isFinite(n) ? n : null)) : undefined
}

export function callbackDraft(kind: ChesscomKind, id: string, body: CallbackBody): Draft {
  const g = body.game
  const h: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(g.pgnHeaders ?? {})) h[k] = headerString(v)
  const slots = [body.players?.top, body.players?.bottom]
  const player = (color: 'white' | 'black'): Player => {
    const slot = slots.find((p) => p?.color === color)
    return compact({
      name:
        h[color === 'white' ? 'White' : 'Black'] ?? slot?.username ?? (color === 'white' ? 'White' : 'Black'),
      rating: ratingOf(h[color === 'white' ? 'WhiteElo' : 'BlackElo'], slot?.rating),
      title: slot?.chessTitle || undefined,
      avatarUrl: slot?.avatarUrl || undefined,
      isComputer: slot?.isComputer === true ? true : undefined,
    })
  }
  const moveList = g.moveList ?? ''
  const timeControl = h.TimeControl
  return {
    id: gameId(kind, id),
    facts: { chesscomType: g.type ?? g.rules, partnerGameId: g.partnerGameId, startFen: g.initialSetup },
    zeroMoves: moveList === '' || g.plyCount === 0,
    startFen: g.initialSetup || STANDARD_FEN,
    replay: (fen) => replayTcn(moveList, fen, typeof g.plyCount === 'number' ? g.plyCount : undefined),
    meta: compact({
      site: 'chesscom',
      kind,
      sourceUrl: gameUrl(kind, id),
      white: player('white'),
      black: player('black'),
      result: normaliseResult(h.Result),
      termination: h.Termination ?? g.resultMessage,
      timeControl,
      timeClass: kind === 'daily' ? 'daily' : timeClassOf(timeControl),
      date: normaliseDate(h.Date),
      rated: typeof g.isRated === 'boolean' ? g.isRated : undefined,
      eco: h.ECO,
      clocks: callbackClocks(g),
    }),
    pending: g.isFinished === false ? 'in_progress_daily' : undefined,
  }
}

const DRAW_RESULTS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
])
function resultFromSides(white: ArchiveSide | string | undefined, black: ArchiveSide | string | undefined) {
  const w = typeof white === 'object' ? white.result : undefined
  const b = typeof black === 'object' ? black.result : undefined
  if (w === 'win') return '1-0'
  if (b === 'win') return '0-1'
  if (w && DRAW_RESULTS.has(w)) return '1/2-1/2'
  return undefined
}

/**
 * A public API entry (month archive or the current-games list). Built from the entry's own tcn (preferred) and pgn
 * only, never re-resolved through its url ("Play vs Coach" entries point at unrelated games). When the tcn does
 * not replay, the entry's pgn is tried once before failing (risk 2).
 */
export function archiveDraft(
  kind: ChesscomKind,
  id: string,
  entry: ArchiveEntry,
  inProgress: boolean,
): Draft {
  const pgn = entry.pgn !== undefined ? parsePgn(entry.pgn) : undefined
  const h = pgn?.headers ?? {}
  const side = (color: 'white' | 'black'): Player => {
    const s = entry[color]
    const api = typeof s === 'object' ? s : undefined
    return compact({
      name:
        h[color === 'white' ? 'White' : 'Black'] ?? api?.username ?? (color === 'white' ? 'White' : 'Black'),
      rating: ratingOf(api?.rating, h[color === 'white' ? 'WhiteElo' : 'BlackElo']),
    })
  }
  const tcn = entry.tcn
  const sans = pgn?.sans ?? []
  const fromPgn = (fen: string) => replay(fen, sans, playSan)
  const accuracies = entry.accuracies
  return {
    id: gameId(kind, id),
    facts: {
      chesscomType: entry.rules,
      archiveEntryWithoutPgn: entry.pgn === undefined,
      startFen: entry.initial_setup || h.FEN,
      sanMoves: tcn === undefined ? sans : undefined,
    },
    zeroMoves: tcn !== undefined ? tcn === '' : sans.length === 0,
    startFen: entry.initial_setup || h.FEN || STANDARD_FEN,
    replay: (fen) => {
      if (tcn === undefined) return fromPgn(fen)
      try {
        return replayTcn(tcn, fen)
      } catch (e) {
        if (!(e instanceof ImportFailure) || e.code !== 'decode_failed' || sans.length === 0) throw e
        try {
          return fromPgn(fen)
        } catch {
          throw e
        }
      }
    },
    meta: compact({
      site: 'chesscom',
      kind,
      sourceUrl: gameUrl(kind, id),
      white: side('white'),
      black: side('black'),
      result:
        h.Result !== undefined
          ? normaliseResult(h.Result)
          : (resultFromSides(entry.white, entry.black) ?? '*'),
      termination: h.Termination,
      timeControl: entry.time_control ?? h.TimeControl,
      timeClass: entry.time_class ?? timeClassOf(entry.time_control ?? h.TimeControl),
      date: normaliseDate(h.Date),
      rated: entry.rated,
      eco: h.ECO,
      openingName: openingFromSlug(entry.eco ?? h.ECOUrl),
      clocks: pgn ? clocksOf(pgn) : undefined,
      reportedAccuracies:
        typeof accuracies?.white === 'number' && typeof accuracies.black === 'number'
          ? { white: accuracies.white, black: accuracies.black }
          : undefined,
    }),
    pending: inProgress || h.Result === '*' ? 'in_progress_daily' : undefined,
  }
}
