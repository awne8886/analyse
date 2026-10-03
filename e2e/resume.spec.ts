// R16 check "e2e reload mid-analysis resumes from the persisted ply" (docs/review/performance.md M4).
// The mock engine answers a whole run inside one task, so a reload cannot land between two plies. Instead the
// persisted state a mid-analysis reload leaves behind is produced two ways, then the page is loaded again:
//   1. an interruption the app itself persists: positions from ply 40 on have no recorded evaluation, the engine
//      fails (E-2) after the early plies were stored, and a reload (with the table complete again) resumes;
//   2. a review truncated by hand after 40 plies, written straight into IndexedDB (idb-keyval's `keyval-store`).
// Both assert E-3 with the resume move, completion, 112 move-list entries, unchanged early classifications and
// that no position of an already-finished ply is looked up again (a counting Proxy around `__MOCK_EVALS__`).
import { expect, test, type Page } from '@playwright/test'
import { enableMockEngine, loadMockEvals, mockNetwork } from './mocks.js'

declare global {
  interface Window {
    __EVAL_LOOKUPS__?: string[]
  }
}

const evals = loadMockEvals()
const LIVE = 'https://www.chess.com/game/live/129688175007'
const GAME_ID = 'cc:live:129688175007'
const REVIEW_KEY = `review:v1:${GAME_ID}`
const GAME_KEY = `game:${GAME_ID}`
const KEPT = 40

interface StoredPly {
  ply: number
  status: string
  classification?: string
}
interface StoredReview {
  complete: boolean
  plies: StoredPly[]
  [k: string]: unknown
}
interface StoredGame {
  moves: { ply: number; before: string; after: string }[]
}

test.describe.configure({ timeout: 120_000 })

test.beforeEach(async ({ context }) => {
  await mockNetwork(context)
})

async function idbGet<T>(page: Page, key: string): Promise<T | undefined> {
  return page.evaluate(
    (k) =>
      new Promise<T | undefined>((resolve, reject) => {
        const open = indexedDB.open('keyval-store')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const req = open.result.transaction('keyval').objectStore('keyval').get(k)
          req.onerror = () => reject(req.error)
          req.onsuccess = () => {
            open.result.close()
            resolve(req.result as T | undefined)
          }
        }
      }),
    key,
  )
}

async function idbPut(page: Page, key: string, value: unknown): Promise<void> {
  await page.evaluate(
    ([k, v]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('keyval-store')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('keyval', 'readwrite')
          tx.objectStore('keyval').put(v, k as string)
          tx.onerror = () => reject(tx.error)
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
        }
      }),
    [key, value] as const,
  )
}

async function idbDelete(page: Page, key: string): Promise<void> {
  await page.evaluate(
    (k) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('keyval-store')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('keyval', 'readwrite')
          tx.objectStore('keyval').delete(k)
          tx.onerror = () => reject(tx.error)
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
        }
      }),
    key,
  )
}

async function moveEntries(page: Page): Promise<[number, string | null][]> {
  return page
    .locator('[data-testid^="move-"]')
    .evaluateAll((els) =>
      els
        .filter((e) => /^move-\d+$/.test(e.getAttribute('data-testid')!))
        .map((e) => [Number(e.getAttribute('data-testid')!.slice(5)), e.getAttribute('data-classification')]),
    ) as Promise<[number, string | null][]>
}

/** Every evaluation lookup the mock engine makes is recorded (as its `fen4`) in `window.__EVAL_LOOKUPS__`. */
async function countLookups(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = []
    window.__EVAL_LOOKUPS__ = seen
    window.__MOCK_EVALS__ = new Proxy(window.__MOCK_EVALS__ ?? {}, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && prop.includes('|')) seen.push(prop.slice(0, prop.indexOf('|')))
        return Reflect.get(target, prop, receiver)
      },
    })
  })
}

const fen4 = (fen: string): string => fen.split(' ').slice(0, 4).join(' ')

/** A fully analysed game in IndexedDB and its move-list classifications. */
async function analyseOnce(
  page: Page,
): Promise<{ game: StoredGame; review: StoredReview; entries: [number, string | null][] }> {
  await enableMockEngine(page, evals)
  await page.goto('/')
  await page.getByTestId('import-input').fill(LIVE)
  await page.getByTestId('import-submit').click()
  await expect(page.getByTestId('review')).toHaveAttribute('data-complete', 'true', { timeout: 90_000 })
  const game = (await idbGet<StoredGame>(page, GAME_KEY))!
  const review = (await idbGet<StoredReview>(page, REVIEW_KEY))!
  expect(review.complete).toBe(true)
  expect(game.moves).toHaveLength(112)
  if (!(await page.getByTestId('move-1').isVisible())) await page.getByTestId('start-review').click()
  const entries = await moveEntries(page)
  expect(entries).toHaveLength(112)
  return { game, review, entries }
}

/** Fen4 of the positions only plies 1..from-1 need (one that a later ply shares, by repetition, is excluded). */
function earlyOnlyPositions(game: StoredGame, from: number): Set<string> {
  const early = new Set(game.moves.slice(0, from - 1).map((m) => fen4(m.before)))
  for (const m of game.moves.slice(from - 1)) early.delete(fen4(m.before))
  early.delete(fen4(game.moves[game.moves.length - 1].after))
  return early
}

async function expectResumed(
  page: Page,
  from: number,
  before: [number, string | null][],
  game: StoredGame,
): Promise<void> {
  await expect(page.getByTestId('review')).toHaveAttribute('data-complete', 'true', { timeout: 90_000 })
  // E-3 (engine/errors.ts), with the move the run resumed from.
  await expect(
    page.getByText(
      `Analysis was interrupted (your device ran out of memory). Resuming from move ${from} in fast mode.`,
    ),
  ).toBeVisible()
  if (!(await page.getByTestId('move-1').isVisible())) await page.getByTestId('start-review').click()
  const after = await moveEntries(page)
  expect(after).toHaveLength(112)
  expect(after.slice(0, from - 1)).toEqual(before.slice(0, from - 1))
  // Plies that were already stored were not evaluated again; the unfinished ones were.
  const lookups = new Set(await page.evaluate(() => window.__EVAL_LOOKUPS__ ?? []))
  expect(lookups.size).toBeGreaterThan(0)
  expect(lookups.has(fen4(game.moves[from - 1].before))).toBe(true)
  const early = earlyOnlyPositions(game, from)
  expect(early.size).toBeGreaterThan(Math.min(from, 10) - 3)
  for (const f of early) expect(lookups.has(f), `re-evaluated ${f}`).toBe(false)
  // The mock engine never creates a worker.
  expect(await page.evaluate(() => window.__ANALYSE_ENGINE_STATS__?.())).toEqual({
    workersCreated: 0,
    uciSent: 0,
  })
}

test('R16: a run interrupted by an engine failure resumes from the persisted ply after a reload', async ({
  page,
  context,
}) => {
  const { game, review: full, entries } = await analyseOnce(page)
  await page.close()

  // Forget the finished review and run again while positions from ply KEPT on cannot be evaluated.
  const stalled = new Set(game.moves.slice(KEPT - 1).flatMap((m) => [fen4(m.before), fen4(m.after)]))
  for (const m of game.moves.slice(0, KEPT - 1)) stalled.delete(fen4(m.before))
  const blocked = Object.fromEntries(Object.entries(evals).filter(([k]) => !stalled.has(k.split('|')[0])))
  const interrupted = await context.newPage()
  await enableMockEngine(interrupted, blocked)
  await interrupted.goto('/')
  await idbDelete(interrupted, REVIEW_KEY)
  await interrupted.goto(`/?game=${GAME_ID}`)
  await expect(interrupted.getByRole('alert')).toBeVisible({ timeout: 60_000 })
  await expect(interrupted.getByTestId('review')).toHaveAttribute('data-complete', 'false')
  const partial = (await idbGet<StoredReview>(interrupted, REVIEW_KEY))!
  expect(partial.complete).toBe(false)
  const doneCount = partial.plies.filter((p) => p.status === 'done').length
  expect(doneCount).toBeGreaterThan(0)
  expect(doneCount).toBeLessThan(112)
  await interrupted.close()

  // Reload with the full table: the app resumes at the first unfinished ply.
  const reloaded = await context.newPage()
  await enableMockEngine(reloaded, evals)
  await countLookups(reloaded)
  await reloaded.goto(`/?game=${GAME_ID}`)
  const firstOpen = partial.plies.find((p) => p.status !== 'done' && p.status !== 'not-analysed')!.ply
  await expectResumed(reloaded, firstOpen, entries, game)
  const final = (await idbGet<StoredReview>(reloaded, REVIEW_KEY))!
  expect(final.complete).toBe(true)
  expect(final.plies).toHaveLength(full.plies.length)
  for (const p of partial.plies.filter((p) => p.ply < firstOpen))
    expect(final.plies[p.ply - 1].classification).toBe(p.classification)
})

test('R16: a review truncated after 40 plies resumes at move 41 after a reload', async ({
  page,
  context,
}) => {
  const { game, review, entries } = await analyseOnce(page)
  const truncated: StoredReview = {
    ...review,
    complete: false,
    plies: review.plies.map((p) => (p.ply <= KEPT ? p : { ...p, status: 'pending' })),
  }
  await idbPut(page, REVIEW_KEY, truncated)
  await page.close()

  const reloaded = await context.newPage()
  await enableMockEngine(reloaded, evals)
  await countLookups(reloaded)
  await reloaded.goto(`/?game=${GAME_ID}`)
  await expectResumed(reloaded, KEPT + 1, entries, game)

  // A second reload of the now complete review shows no E-3 and starts no engine.
  await reloaded.reload()
  await expect(reloaded.getByTestId('review')).toHaveAttribute('data-complete', 'true')
  await expect(reloaded.getByText(/Resuming from move/)).toHaveCount(0)
})
