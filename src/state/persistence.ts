// IndexedDB persistence (idb-keyval): raw game under `game:<id>`, review under `review:v1:<id>` (section 3.3).
// Every write is keyed and idempotent, so the double app start of the first Pages visit is harmless (risk 12).
import { get, getMany, keys, set } from 'idb-keyval'
import type { ImportedGame } from '../types/game'
import type { GameReview } from '../types/review'

const gameKey = (id: string) => `game:${id}`
const reviewKey = (id: string) => `review:v1:${id}`

export interface RecentGame {
  gameId: string
  white: string
  black: string
  result: ImportedGame['result']
  date?: string
  accuracy: { white?: number; black?: number }
  createdAt: number
}

export function persistReview(review: GameReview): Promise<void> {
  return set(reviewKey(review.gameId), review)
}

export async function loadReview(gameId: string): Promise<GameReview | undefined> {
  const review = await get<GameReview>(reviewKey(gameId))
  return review && review.schema === 1 ? review : undefined
}

export function loadGame(gameId: string): Promise<ImportedGame | undefined> {
  return get<ImportedGame>(gameKey(gameId))
}

export function saveGame(game: ImportedGame): Promise<void> {
  return set(gameKey(game.id), game)
}

/** Reviews stored in this browser, newest first (G.5). */
export async function listRecent(limit = 10): Promise<RecentGame[]> {
  const ids = (await keys())
    .map(String)
    .filter((k) => k.startsWith('review:v1:'))
    .map((k) => k.slice('review:v1:'.length))
  const [reviews, games] = await Promise.all([
    getMany<GameReview | undefined>(ids.map(reviewKey)),
    getMany<ImportedGame | undefined>(ids.map(gameKey)),
  ])
  const out: RecentGame[] = []
  ids.forEach((gameId, i) => {
    const review = reviews[i]
    const game = games[i]
    if (!review || !game) return
    out.push({
      gameId,
      white: game.white.name,
      black: game.black.name,
      result: game.result,
      date: game.date,
      accuracy: review.accuracy,
      createdAt: review.createdAt,
    })
  })
  return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
}
