// Query-string navigation state (R29): `?game=<id>&ply=<n>` on the base path, `?dev=calibration`. No router.
import type { ParsedInput } from '../types/game'

export interface UrlState {
  game?: string
  ply?: number
  dev?: string
}
/** What opening `?game=<id>` does (R29). */
export type UrlGameAction =
  | { type: 'render-cached' }
  | { type: 'import'; parsed: ParsedInput } // Vercel build, chess.com or lichess id: run the import chain
  | { type: 'import-screen'; link: string; focusUsername: true; autoScan: boolean } // Pages build, chess.com id: P-5
  | { type: 'error'; key: 'I-37' } // pgn: id with no cached game

export function readUrlState(search: string = window.location.search): UrlState {
  const params = new URLSearchParams(search)
  const state: UrlState = {}
  const game = params.get('game')
  if (game) state.game = game
  const ply = params.get('ply')
  if (ply !== null && /^\d+$/.test(ply)) state.ply = Number(ply)
  const dev = params.get('dev')
  if (dev) state.dev = dev
  return state
}

/** Pure: the query string (with leading '?') for a UrlState. Game ids are written literally (`cc:live:1`). */
export function toSearch(state: UrlState): string {
  const parts: string[] = []
  if (state.game !== undefined) parts.push(`game=${state.game}`)
  if (state.ply !== undefined) parts.push(`ply=${state.ply}`)
  if (state.dev !== undefined) parts.push(`dev=${encodeURIComponent(state.dev)}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

export function writeUrlState(state: UrlState, mode: 'replace' | 'push' = 'replace'): void {
  const url = `${window.location.pathname}${toSearch(state)}${window.location.hash}`
  if (mode === 'push') window.history.pushState(null, '', url)
  else window.history.replaceState(null, '', url)
}

/** `${origin}${base}?game=<id>&ply=<n>` (R29, G.27). */
export function buildShareLink(
  gameId: string,
  ply: number | undefined,
  origin: string,
  base: string,
): string {
  return `${origin}${base}${toSearch({ game: gameId, ply })}`
}

/** The link reconstructed from a game id (cc:live:1 -> https://www.chess.com/game/live/1, li:x -> lichess); null for pgn:. */
export function gameIdToLink(gameId: string): string | null {
  const cc = /^cc:(live|daily|computer):(\d+)$/.exec(gameId)
  if (cc) return `https://www.chess.com/game/${cc[1]}/${cc[2]}`
  const li = /^li:([A-Za-z0-9]{8})$/.exec(gameId)
  if (li) return `https://lichess.org/${li[1]}`
  return null
}

/** The game id an input resolves to before any network request (null for PGN and bare chess.com ids). */
export function gameIdOf(parsed: ParsedInput): string | null {
  if (parsed.kind === 'chesscom' && parsed.cckind !== 'unknown') return `cc:${parsed.cckind}:${parsed.id}`
  if (parsed.kind === 'lichess') return `li:${parsed.id}`
  return null
}

export function receiveGameId(
  gameId: string,
  opts: { deployTarget: 'vercel' | 'pages'; cached: boolean; username?: string },
): UrlGameAction {
  if (opts.cached) return { type: 'render-cached' }
  const cc = /^cc:(live|daily|computer):(\d+)$/.exec(gameId)
  if (cc) {
    if (opts.deployTarget === 'pages') {
      return {
        type: 'import-screen',
        link: gameIdToLink(gameId) as string,
        focusUsername: true,
        autoScan: Boolean(opts.username?.trim()),
      }
    }
    return {
      type: 'import',
      parsed: { kind: 'chesscom', cckind: cc[1] as 'live' | 'daily' | 'computer', id: cc[2] },
    }
  }
  const li = /^li:([A-Za-z0-9]{8})$/.exec(gameId)
  if (li) return { type: 'import', parsed: { kind: 'lichess', id: li[1] } }
  return { type: 'error', key: 'I-37' }
}
