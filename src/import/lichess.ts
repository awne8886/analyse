// Lichess game export, fetched directly from the browser (R8): one request at a time, a 429 waits 60 s and retries
// once, a fetch rejection (the 404 has no CORS header, so the browser reports a TypeError) is "not found".
import type { Player } from '../types/game'
import { compact, ratingOf, type Draft } from './draft'
import { ImportFailure, formatImportString } from './errors'
import { STANDARD_FEN, playSan, replay } from './replay'
import { serial, type Waits } from './net'

interface LichessPlayer {
  user?: { name?: string; title?: string }
  name?: string
  rating?: number
  aiLevel?: number
}
export interface LichessGame {
  id?: string
  rated?: boolean
  variant?: string
  speed?: string
  createdAt?: number
  status?: string
  source?: string
  players?: { white?: LichessPlayer; black?: LichessPlayer }
  initialFen?: string
  winner?: 'white' | 'black'
  moves?: string
  clocks?: number[]
  opening?: { eco?: string; name?: string }
  clock?: { initial?: number; increment?: number }
  daysPerTurn?: number
}

export const LICHESS_RETRY_MS = 60_000
const exportUrl = (id: string) =>
  `https://lichess.org/game/export/${id}?pgnInJson=true&clocks=true&evals=false&opening=true&accuracy=true`

export async function fetchLichessGame(id: string, w: Waits): Promise<LichessGame> {
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await serial('lichess', () => fetch(exportUrl(id), { headers: { accept: 'application/json' } }))
    } catch {
      throw new ImportFailure('lichess_not_found')
    }
    if (res.status === 429) {
      if (attempt > 0) throw new ImportFailure('lichess_rate_limited')
      w.onStatus?.('I-27', formatImportString('I-27'))
      await w.wait(LICHESS_RETRY_MS)
      continue
    }
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) {
      throw new ImportFailure('lichess_not_found')
    }
    try {
      return (await res.json()) as LichessGame
    } catch {
      throw new ImportFailure('lichess_not_found')
    }
  }
}

const UNFINISHED = new Set(['created', 'started', 'aborted', 'noStart', 'unknownFinish'])

function lichessPlayer(p: LichessPlayer | undefined, fallback: string): Player {
  const ai = typeof p?.aiLevel === 'number'
  return compact({
    name: p?.user?.name ?? p?.name ?? (ai ? `Stockfish level ${p?.aiLevel}` : fallback),
    rating: ratingOf(p?.rating),
    title: p?.user?.title,
    isComputer: ai ? true : undefined,
  })
}

export function lichessDraft(id: string, g: LichessGame): Draft {
  const sans = (g.moves ?? '').split(/\s+/).filter(Boolean)
  const status = g.status ?? ''
  const ongoing =
    ['created', 'started'].includes(status) && !['import', 'importlive'].includes(g.source ?? '')
  const result =
    g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : UNFINISHED.has(status) ? '*' : '1/2-1/2'
  const clock = g.clock
  return {
    id: `li:${id}`,
    facts: { lichessVariant: g.variant ?? 'standard', startFen: g.initialFen, sanMoves: sans },
    zeroMoves: sans.length === 0 || status === 'aborted' || status === 'noStart',
    startFen: g.initialFen || STANDARD_FEN,
    replay: (fen) => replay(fen, sans, playSan),
    meta: compact({
      site: 'lichess',
      sourceUrl: `https://lichess.org/${id}`,
      white: lichessPlayer(g.players?.white, 'White'),
      black: lichessPlayer(g.players?.black, 'Black'),
      result,
      termination: status || undefined,
      timeControl: clock ? `${clock.initial ?? 0}+${clock.increment ?? 0}` : undefined,
      timeClass: g.speed,
      date: typeof g.createdAt === 'number' ? new Date(g.createdAt).toISOString().slice(0, 10) : undefined,
      rated: g.rated,
      eco: g.opening?.eco,
      openingName: g.opening?.name,
      clocks: g.clocks?.length ? g.clocks.map((cs) => Math.round(cs / 10)) : undefined,
    }),
    pending: ongoing ? 'in_progress_lichess' : undefined,
  }
}
