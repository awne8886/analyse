// Step (3) of the import chain: username plus the chess.com public API, called directly from the browser (R9).
// Requests are strictly serial, usernames are lowercased, a live game scans at most the 3 months predicted from the
// Appendix A.5 id anchors (nearest first), a daily game the current games and then the newest 6 months.
import type { ChesscomKind } from '../types/game'
import { archiveDraft, type ArchiveEntry } from './chesscomGame'
import type { Draft } from './draft'
import { ImportFailure, formatImportString } from './errors'
import { jsonBody, serial, type Waits } from './net'

export const PUBLIC_API_RETRY_MS = 2_000
export const LIVE_MONTH_CAP = 3
export const DAILY_MONTH_CAP = 6

// Appendix A.5: first live game of the month in hikaru's archives
const LIVE_ID_ANCHORS: readonly [string, number][] = [
  ['2018-01-01', 2524491235],
  ['2020-01-01', 4355135133],
  ['2022-01-02', 34897913463],
  ['2023-01-03', 66500575131],
  ['2024-01-01', 97872578329],
  ['2025-01-04', 129688175007],
  ['2026-01-01', 161596628091],
  ['2026-09-08', 183193101523],
]
const IDS_PER_MONTH_AFTER_LAST_ANCHOR = 2.6e9
const MEAN_MONTH_MS = (365.2425 / 12) * 86_400_000

const monthKey = (year: number, month0: number): string => {
  const d = new Date(Date.UTC(year, month0, 1))
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * The archive months to scan for a live id, nearest first: the month predicted by linear interpolation between the
 * A.5 anchors (extrapolated at 2.6e9 ids per month past the last anchor), then the previous and the next month.
 */
export function predictLiveMonths(id: string): string[] {
  const n = Number(id)
  const pts = LIVE_ID_ANCHORS.map(([date, anchor]) => [Date.parse(`${date}T00:00:00Z`), anchor] as const)
  const last = pts[pts.length - 1]
  let t: number
  if (n >= last[1]) {
    t = last[0] + ((n - last[1]) / IDS_PER_MONTH_AFTER_LAST_ANCHOR) * MEAN_MONTH_MS
  } else {
    let i = 0
    while (i < pts.length - 2 && n >= pts[i + 1][1]) i++
    const [t0, n0] = pts[i]
    const [t1, n1] = pts[i + 1]
    t = t0 + ((n - n0) / (n1 - n0)) * (t1 - t0)
  }
  const d = new Date(t)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  return [monthKey(y, m), monthKey(y, m - 1), monthKey(y, m + 1)]
}

const USER_NOT_FOUND = /^User ".*" not found\.?$/

/**
 * One public API request, at most once more after a 429 (2 s back-off). Returns the JSON body, or undefined for
 * a 404 that is not "user not found" (a month the archive does not have).
 */
async function getJson(url: string, username: string, w: Waits): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await serial('chesscom', () => fetch(url, { headers: { accept: 'application/json' } }))
    } catch {
      throw new ImportFailure('proxy_unreachable')
    }
    if (res.status === 429) {
      if (attempt > 0) throw new ImportFailure('proxy_rate_limited')
      w.onStatus?.('P-2', formatImportString('P-2'))
      await w.wait(PUBLIC_API_RETRY_MS)
      continue
    }
    if (res.status === 403) throw new ImportFailure('archive_blocked') // text/plain "Blocked: Archive crawl ..."
    const body = await jsonBody(res)
    if (res.status === 404) {
      const message = (body as { message?: unknown } | undefined)?.message
      if (typeof message === 'string' && USER_NOT_FOUND.test(message)) {
        throw new ImportFailure('user_not_found', { username })
      }
      return undefined
    }
    if (res.status !== 200 || body === undefined) throw new ImportFailure('proxy_unreachable')
    return body
  }
}

const gamesOf = (body: unknown): ArchiveEntry[] => {
  const games = (body as { games?: unknown } | undefined)?.games
  return Array.isArray(games) ? (games as ArchiveEntry[]) : []
}

export interface PublicApiMatch {
  kind: ChesscomKind
  draft: Draft
}

/**
 * Finds chess.com game `id` among `username`'s public games. `kind` 'unknown' (a bare link) matches either
 * `/game/live/{id}` or `/game/daily/{id}` and scans both month sets. Bot games are never listed (I-8).
 */
export async function findInPublicApi(
  kind: ChesscomKind | 'unknown',
  id: string,
  username: string,
  w: Waits,
): Promise<PublicApiMatch> {
  if (kind === 'computer') throw new ImportFailure('computer_via_public_api')
  const shown = username.trim()
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(shown.toLowerCase())}/games`
  const kinds: ChesscomKind[] = kind === 'unknown' ? ['live', 'daily'] : [kind]
  const find = (games: ArchiveEntry[], inProgress: boolean): PublicApiMatch | undefined => {
    for (const entry of games) {
      const k = kinds.find((c) => typeof entry.url === 'string' && entry.url.endsWith(`/game/${c}/${id}`))
      if (k) return { kind: k, draft: archiveDraft(k, id, entry, inProgress) }
    }
    return undefined
  }
  // in-progress daily games are only in the current-games list, never in a month archive (I-5)
  const currentGames = async () => find(gamesOf(await getJson(base, shown, w)), true)

  if (kind === 'daily') {
    const current = await currentGames()
    if (current) return current
  }
  const archives = (await getJson(`${base}/archives`, shown, w)) as { archives?: unknown } | undefined
  const available = (Array.isArray(archives?.archives) ? archives.archives : [])
    .map((u) => /\/(\d{4})\/(\d{2})$/.exec(String(u)))
    .flatMap((m) => (m ? [`${m[1]}/${m[2]}`] : []))
  const newestDaily = [...available].reverse().slice(0, DAILY_MONTH_CAP)

  const scanned: string[] = []
  const scan = async (months: string[]): Promise<PublicApiMatch | undefined> => {
    for (const month of months) {
      if (scanned.includes(month)) continue
      scanned.push(month)
      if (!available.includes(month)) continue
      const [yyyy, mm] = month.split('/')
      w.onStatus?.('P-8', formatImportString('P-8', { YYYY: yyyy, MM: mm }))
      const match = find(gamesOf(await getJson(`${base}/${month}`, shown, w)), false)
      if (match) return match
    }
    return undefined
  }

  const found =
    kind === 'live'
      ? await scan(predictLiveMonths(id))
      : kind === 'daily'
        ? await scan(newestDaily)
        : ((await scan(predictLiveMonths(id))) ?? (await currentGames()) ?? (await scan(newestDaily)))
  if (found) return found
  if (kind === 'unknown') throw new ImportFailure('ambiguous_kind')
  throw new ImportFailure('archive_not_found', { id, username: shown, months: scanned.join(', ') })
}
