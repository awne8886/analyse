// PGN text: split into games, read the tag pairs and the main-line SAN moves with their [%clk] comments.
// The moves are replayed by the importer itself (replay.ts), so an illegal move reports its ply number (I-11b).
import { compact, normaliseDate, normaliseResult, openingFromSlug, ratingOf, type Draft } from './draft'
import { STANDARD_FEN, playSan, replay } from './replay'

export interface ParsedPgn {
  headers: Record<string, string>
  /** main-line SAN tokens, annotation glyphs (!, ?) removed */
  sans: string[]
  /** tenths of a second from `[%clk h:mm:ss(.f)]` after each SAN, null where absent */
  clocks: (number | null)[]
  /** the game termination marker of the movetext, when present */
  resultToken?: string
  /** the movetext as written (tag pairs removed) */
  movetext: string
}

/** Splits a PGN file into its games: a new game starts at an `[Event` tag pair that follows a game's movetext
 *  (tag pairs written before `[Event` belong to the same game). */
export function splitPgnGames(text: string): string[] {
  const games: string[] = []
  let pending = ''
  for (const part of text.split(/^(?=[ \t]*\[Event[ \t]+")/m)) {
    pending += part
    const onlyTags = pending.split(/\r?\n/).every((line) => line.trim() === '' || TAG_PAIR.test(line))
    if (!onlyTags) {
      games.push(pending.trim())
      pending = ''
    }
  }
  if (pending.trim() !== '') games.push(pending.trim())
  return games.length > 0 ? games : [text.trim()]
}

const TAG_PAIR = /^[ \t]*\[(\w+)[ \t]+"((?:[^"\\]|\\.)*)"[ \t]*\][ \t]*$/
const RESULT = /^(?:1-0|0-1|1\/2-1\/2|\*)$/
const MOVE_NUMBER = /^\d+\.+/
const CLOCK = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/

/** Unescapes a header value: PGN `\"` and `\\`, and chess.com's `\'`. */
export const unescapeHeader = (v: string): string => v.replace(/\\(["'\\])/g, '$1')

export function parsePgn(text: string): ParsedPgn {
  const headers: Record<string, string> = {}
  const lines = text.split(/\r?\n/)
  let i = 0
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    const tag = TAG_PAIR.exec(line)
    if (!tag) break
    headers[tag[1]] = unescapeHeader(tag[2])
  }
  const movetext = lines.slice(i).join('\n').trim()

  const sans: string[] = []
  const clocks: (number | null)[] = []
  let resultToken: string | undefined
  let depth = 0 // variation nesting
  let k = 0
  while (k < movetext.length) {
    const c = movetext[k]
    if (c === '{') {
      const end = movetext.indexOf('}', k + 1)
      const comment = movetext.slice(k + 1, end < 0 ? movetext.length : end)
      const clk = CLOCK.exec(comment)
      if (clk && depth === 0 && sans.length > 0) {
        clocks[sans.length - 1] = Math.round((+clk[1] * 3600 + +clk[2] * 60 + +clk[3]) * 10)
      }
      k = end < 0 ? movetext.length : end + 1
    } else if (c === ';') {
      const end = movetext.indexOf('\n', k)
      k = end < 0 ? movetext.length : end + 1
    } else if (c === '(') {
      depth++
      k++
    } else if (c === ')') {
      depth = Math.max(0, depth - 1)
      k++
    } else if (/\s/.test(c)) {
      k++
    } else {
      let end = k
      while (end < movetext.length && !/[\s{};()]/.test(movetext[end])) end++
      const token = movetext.slice(k, end)
      k = end
      if (depth > 0 || token.startsWith('$')) continue
      if (RESULT.test(token)) {
        resultToken = token
        continue
      }
      const san = token.replace(MOVE_NUMBER, '').replace(/[!?]+$/, '')
      if (san === '' || RESULT.test(san)) continue
      sans.push(san)
      clocks.push(null)
    }
  }
  const parsed: ParsedPgn = { headers, sans, clocks, movetext }
  if (resultToken !== undefined) parsed.resultToken = resultToken
  return parsed
}

/** `[%clk]` values after each ply, or undefined when the PGN has none. */
export const clocksOf = (p: ParsedPgn): (number | null)[] | undefined =>
  p.clocks.some((c) => c !== null) ? p.clocks : undefined

/** A pasted PGN game as a draft: the start comes from `[FEN]` (never inferred from `[SetUp]`), the id is hashed. */
export function pgnDraft(p: ParsedPgn): Draft {
  const h = p.headers
  const name = (v: string | undefined, fallback: string) => (v && v !== '?' ? v : fallback)
  const result = normaliseResult(h.Result ?? p.resultToken)
  return {
    facts: { pgnVariant: h.Variant, startFen: h.FEN, sanMoves: p.sans },
    zeroMoves: p.sans.length === 0,
    startFen: h.FEN || STANDARD_FEN,
    replay: (fen) => replay(fen, p.sans, playSan),
    meta: compact({
      site: 'pgn',
      white: compact({ name: name(h.White, 'White'), rating: ratingOf(h.WhiteElo), title: h.WhiteTitle }),
      black: compact({ name: name(h.Black, 'Black'), rating: ratingOf(h.BlackElo), title: h.BlackTitle }),
      result,
      termination: h.Termination,
      timeControl: h.TimeControl,
      date: normaliseDate(h.UTCDate ?? h.Date),
      eco: h.ECO,
      openingName: h.Opening ?? openingFromSlug(h.ECOUrl),
      clocks: clocksOf(p),
    }),
    pending: result === '*' ? 'pgn_unfinished' : undefined,
  }
}
