// Edge cases of the IndexedDB layer (R16, G.5, risk 12): schema guard, idempotent keyed writes (the double app
// start of the first Pages visit), and the Recent-games listing (order, limit, incomplete records).
import { clear } from 'idb-keyval'
import { beforeEach, describe, expect, it } from 'vitest'
import { fixtureGame, fixtureReview } from '../ui/test-fixtures'
import { listRecent, loadGame, loadReview, persistReview, saveGame } from './persistence'

beforeEach(async () => {
  await clear()
})

async function store(id: string, createdAt: number, partial?: number): Promise<void> {
  const game = fixtureGame({ id })
  await saveGame(game)
  await persistReview({ ...fixtureReview(game, partial), gameId: id, createdAt })
}

describe('loadReview', () => {
  it('returns undefined for a missing review and for a stored record of another schema version', async () => {
    expect(await loadReview('cc:live:1')).toBeUndefined()
    const game = fixtureGame({ id: 'cc:live:1' })
    await persistReview({ ...fixtureReview(game), gameId: game.id, schema: 2 } as never)
    expect(await loadReview('cc:live:1')).toBeUndefined()
  })

  it('round-trips a partial review with its pending plies, so a reload can resume from them', async () => {
    await store('cc:live:2', 5, 6)
    const review = await loadReview('cc:live:2')
    expect(review?.complete).toBe(false)
    expect(review?.plies.map((p) => p.status).slice(4, 7)).toEqual(['done', 'pending', 'pending'])
  })

  it('writing the same review twice (double app start) leaves one identical record', async () => {
    await store('cc:live:3', 7)
    const first = await loadReview('cc:live:3')
    await store('cc:live:3', 7)
    expect(await loadReview('cc:live:3')).toEqual(first)
    expect((await listRecent()).filter((r) => r.gameId === 'cc:live:3')).toHaveLength(1)
  })

  it('a later write replaces the earlier partial one (every ply persists the whole review)', async () => {
    await store('cc:live:4', 1, 3)
    await store('cc:live:4', 1)
    expect((await loadReview('cc:live:4'))?.complete).toBe(true)
  })
})

describe('listRecent', () => {
  it('is empty for an empty database', async () => {
    expect(await listRecent()).toEqual([])
  })

  it('lists newest first and honours the limit', async () => {
    await store('cc:live:10', 100)
    await store('cc:live:11', 300)
    await store('cc:live:12', 200)
    expect((await listRecent()).map((r) => r.gameId)).toEqual(['cc:live:11', 'cc:live:12', 'cc:live:10'])
    expect((await listRecent(2)).map((r) => r.gameId)).toEqual(['cc:live:11', 'cc:live:12'])
  })

  it('skips a review without its game, and a game without a review', async () => {
    await store('cc:live:20', 10)
    const orphan = fixtureGame({ id: 'cc:live:21' })
    await persistReview({ ...fixtureReview(orphan), gameId: orphan.id }) // review only
    await saveGame(fixtureGame({ id: 'cc:live:22' })) // game only
    expect((await listRecent()).map((r) => r.gameId)).toEqual(['cc:live:20'])
    expect(await loadGame('cc:live:22')).toBeDefined()
  })

  it('carries the player names, result and accuracy of the stored records', async () => {
    await store('cc:live:30', 10)
    const [row] = await listRecent()
    const game = fixtureGame({ id: 'cc:live:30' })
    expect(row).toMatchObject({
      gameId: 'cc:live:30',
      white: game.white.name,
      black: game.black.name,
      result: game.result,
      createdAt: 10,
    })
    expect(row.accuracy).toEqual((await loadReview('cc:live:30'))?.accuracy)
  })
})
