// Public entry point of src/state (PROMPT.md section 4.5). Phase 0 stub: bodies throw until impl-ui lands.
import type { StoreApi, UseBoundStore } from 'zustand'
import type { ProfileName } from '../types/engine'
import type { ImportedGame, ParsedInput } from '../types/game'
import type { GameReview } from '../types/review'

export interface SettingsState {
  theme: 'dark' | 'light'
  pieceSet: 'kaneo' | 'cburnett'
  profile: ProfileName
  voice: 'me' | 'neutral' // "Coach addresses: me / neutral"
  coloredMoves: boolean
  sounds: boolean
  explain: boolean // the Explain toggle (default on, hotkey e)
  userColor: 'w' | 'b' // "You played", default White
  username: string
  update: (patch: Partial<Omit<SettingsState, 'update' | 'toggleExplain'>>) => void
  toggleExplain: () => void
}
/** zustand `persist` writes the settings slice to localStorage under this key. */
export const SETTINGS_STORAGE_KEY = 'analyse:settings'

export interface ReviewState {
  game?: ImportedGame
  review?: GameReview
  ply: number
}
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

const notImplemented = (..._args: unknown[]): never => {
  void _args
  throw new Error('not implemented')
}
const stubStore = <T>(): UseBoundStore<StoreApi<T>> =>
  new Proxy(() => undefined, {
    apply: () => notImplemented(),
    get: () => notImplemented(),
  }) as unknown as UseBoundStore<StoreApi<T>>

export const useSettingsStore = stubStore<SettingsState>()
export const useReviewStore = stubStore<ReviewState>()

/** Case-insensitive match of `username` against the White and Black names (R7); null when neither matches. */
export function resolveUserColor(white: string, black: string, username?: string): 'w' | 'b' | null {
  return notImplemented(white, black, username)
}
export function readUrlState(search?: string): UrlState {
  return notImplemented(search)
}
/** Pure: the query string (with leading '?') for a UrlState. */
export function toSearch(state: UrlState): string {
  return notImplemented(state)
}
export function writeUrlState(state: UrlState, mode?: 'replace' | 'push'): void {
  return notImplemented(state, mode)
}
/** `${origin}${base}?game=<id>&ply=<n>` (R29, G.27). */
export function buildShareLink(
  gameId: string,
  ply: number | undefined,
  origin: string,
  base: string,
): string {
  return notImplemented(gameId, ply, origin, base)
}
/** The link reconstructed from a game id (cc:live:1 -> https://www.chess.com/game/live/1, li:x -> lichess); null for pgn:. */
export function gameIdToLink(gameId: string): string | null {
  return notImplemented(gameId)
}
export function receiveGameId(
  gameId: string,
  opts: { deployTarget: 'vercel' | 'pages'; cached: boolean; username?: string },
): UrlGameAction {
  return notImplemented(gameId, opts)
}
export function persistReview(review: GameReview): Promise<void> {
  return notImplemented(review)
}
export function loadReview(gameId: string): Promise<GameReview | undefined> {
  return notImplemented(gameId)
}
export function loadGame(gameId: string): Promise<ImportedGame | undefined> {
  return notImplemented(gameId)
}
export function saveGame(game: ImportedGame): Promise<void> {
  return notImplemented(game)
}
