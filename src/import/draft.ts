// A game as read from one source, before the gate. `finaliseDraft` runs the gate of PROMPT.md section 3.3 in its
// binding order: variant, zero moves, decoding (the single replay), custom start, in-progress confirmation.
import type { ImportedGame } from '../types/game'
import { ImportFailure } from './errors'
import { isCustomStart, toGameMoves, type Replay } from './replay'
import { gateVariant, type VariantFacts } from './variantGate'

export type PendingConfirmation = 'in_progress_daily' | 'in_progress_lichess' | 'pgn_unfinished'
export type GameMeta = Omit<ImportedGame, 'id' | 'startFen' | 'customStart' | 'moves' | 'inProgress'>

export interface Draft {
  /** the game id of section 3.3; undefined for a PGN paste (hashed from the movetext once replayed) */
  id?: string
  facts: VariantFacts
  zeroMoves: boolean
  startFen: string
  /** the single chess.js replay; throws decode_failed (I-11b) or variant_unsupported (TCN drops) */
  replay: (startFen: string) => Replay
  meta: GameMeta
  pending?: PendingConfirmation
}

export interface Finalised {
  game: ImportedGame
  notice?: 'custom_start'
  pendingConfirmation?: PendingConfirmation
}

export async function finaliseDraft(d: Draft): Promise<Finalised> {
  gateVariant(d.facts)
  if (d.zeroMoves) throw new ImportFailure('zero_moves')
  const r = d.replay(d.startFen)
  if (r.moves.length === 0) throw new ImportFailure('zero_moves')
  const customStart = isCustomStart(r.startFen)
  const moves = toGameMoves(r)
  const id = d.id ?? `pgn:${await movetextHash(moves.map((m) => m.san).join(' '))}`
  const game: ImportedGame = { id, ...d.meta, startFen: r.startFen, customStart, moves, inProgress: false }
  if (game.clocks) game.clocks = moves.map((_, i) => game.clocks?.[i] ?? null)
  const out: Finalised = { game }
  if (customStart) out.notice = 'custom_start'
  if (d.pending) out.pendingConfirmation = d.pending
  return out
}

/** First 12 hex digits of the SHA-256 of the normalised movetext (SAN moves separated by one space). */
async function movetextHash(movetext: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(movetext))
  return [...new Uint8Array(digest)]
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** '1-0' | '0-1' | '1/2-1/2' | '*' from a PGN Result value. */
export function normaliseResult(value: string | undefined): ImportedGame['result'] {
  const v = (value ?? '').trim()
  if (v === '1-0' || v === '0-1') return v
  if (v === '1/2-1/2' || v === '½-½') return '1/2-1/2'
  return '*'
}

/** `2025.01.04` to `2025-01-04`; other date forms are kept as written, `????.??.??` is dropped. */
export function normaliseDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(value.trim())
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return /^[?.]+$/.test(value.trim()) ? undefined : value.trim()
}

/** A rating from a header or an API field (`WhiteElo` may be a number or a string). */
export function ratingOf(...values: unknown[]): number | undefined {
  for (const v of values) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

/** A chess.com opening URL (public API `eco`, PGN `[ECOUrl]`) as a name: the fallback when the bundled table has
 *  none. `https://www.chess.com/openings/Modern-Defense-with-1-e4-2.d4` gives "Modern Defense with 1.e4 2.d4". */
export function openingFromSlug(url: string | undefined): string | undefined {
  const slug = url?.split(/[?#]/)[0].split('/').filter(Boolean).pop()
  if (!slug || !url?.includes('/openings/')) return undefined
  return decodeURIComponent(slug)
    .replace(/(^|-)(\d+)-(?=[a-hKQRBNO])/g, '$1$2.')
    .replace(/-/g, ' ')
    .trim()
}

/** Drops undefined fields so results compare cleanly and serialise without holes. */
export function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k]
  return o
}
