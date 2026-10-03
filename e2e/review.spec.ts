// End-to-end review flows (PROMPT.md R33, section 5.3 items 1 to 9 and 10/11, R30, Appendix G.5) over the three
// recorded fixture games with the network blocked and mocked (e2e/mocks.ts) and, except where a test says
// otherwise, the mock engine. Written against the DOM contract of docs/notes/contracts.md section 5.
// DoD item 6 (classification, accuracy, TCN, URL, UCI, detector and string-table fixtures) is a vitest suite.
import { expect, test, type Page } from '@playwright/test'
import { Chess } from 'chess.js'
import { enableMockEngine, loadMockEvals, mockNetwork, readNetworkFixture } from './mocks.js'

const evals = loadMockEvals()

const LIVE = 'https://www.chess.com/game/live/129688175007'
const DAILY = 'https://www.chess.com/game/daily/1000337106'
const LICHESS = 'https://lichess.org/4S1PZUvW'
const PAGES = 'http://localhost:4181/analyse/'

// Appendix F, verbatim.
const I2 =
  "Couldn't find this live game. If it's still being played, Chess.com only publishes it once it ends. Try again after the game finishes."
const I15 = 'Started from a custom position. Opening-book moves are not shown.'
const P5 =
  "Importing by link needs a small server proxy, which this static build doesn't have. Enter the Chess.com username of either player (we'll find game 129688175007 through Chess.com's public API), or paste the PGN."
const CLASSIFICATIONS = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
  'forced',
]
const CLASS_LABEL = /^(Brilliant|Great|Best|Excellent|Good|Book|Inaccuracy|Mistake|Miss|Blunder|Forced)$/i
const ENGINE_FILE = /\/engine\/sf19\/stockfish-19-lite(-single)?\.(js|wasm)$/

let net: { requests: string[]; unmocked: string[] }
let requested: string[]

test.describe.configure({ timeout: 120_000 })

test.beforeEach(async ({ context }) => {
  net = await mockNetwork(context)
  requested = []
  context.on('request', (r) => requested.push(r.url()))
})

// DoD 10: WebKit never loads the pthreads build (R12), in any test of this file.
test.afterEach(() => {
  if (test.info().project.name === 'webkit')
    expect(requested.filter((u) => u.includes('stockfish-19-lite.js'))).toEqual([])
})

async function importGame(page: Page, input: string, base = '/'): Promise<void> {
  await page.goto(base)
  await page.getByTestId('import-input').fill(input)
  await page.getByTestId('import-submit').click()
}

async function waitForCompleteReview(page: Page): Promise<void> {
  await expect(page.getByTestId('review')).toHaveAttribute('data-complete', 'true', { timeout: 90_000 })
}

/** The move-list entries `move-<ply>` as [ply, data-classification] pairs, in DOM order. */
async function moveEntries(page: Page): Promise<[number, string | null][]> {
  return page
    .locator('[data-testid^="move-"]')
    .evaluateAll((els) =>
      els
        .filter((e) => /^move-\d+$/.test(e.getAttribute('data-testid')!))
        .map((e) => [Number(e.getAttribute('data-testid')!.slice(5)), e.getAttribute('data-classification')]),
    ) as Promise<[number, string | null][]>
}

/** The FEN piece placement shown on the board, read from react-chessboard's `data-square` / `data-piece`. */
async function boardPlacement(page: Page): Promise<string> {
  const pieces = await page
    .getByTestId('board')
    .locator('[data-square]')
    .evaluateAll((els) =>
      Object.fromEntries(
        els.map((e) => [
          e.getAttribute('data-square'),
          e.querySelector('[data-piece]')?.getAttribute('data-piece') ?? '',
        ]),
      ),
    )
  const rows: string[] = []
  for (let r = 8; r >= 1; r--) {
    let row = ''
    let empty = 0
    for (const f of 'abcdefgh') {
      const p = pieces[f + r]
      if (!p) {
        empty++
        continue
      }
      if (empty) row += empty
      empty = 0
      row += p[0] === 'w' ? p[1].toUpperCase() : p[1].toLowerCase()
    }
    rows.push(empty ? row + empty : row)
  }
  return rows.join('/')
}

async function tallySum(page: Page, side: 'white' | 'black'): Promise<number> {
  let sum = 0
  for (const c of CLASSIFICATIONS) sum += Number(await page.getByTestId(`tally-${side}-${c}`).innerText())
  return sum
}

/** Plays `uci` on the board by dragging (react-chessboard listens to mouse events). */
async function dragMove(page: Page, uci: string): Promise<void> {
  const board = page.getByTestId('board')
  // Entering Retry steps the board back one ply; wait until the piece has landed on its square (animation).
  await expect(board.locator(`[data-square="${uci.slice(0, 2)}"] [data-piece]`)).toBeVisible()
  const from = await board.locator(`[data-square="${uci.slice(0, 2)}"]`).boundingBox()
  const to = await board.locator(`[data-square="${uci.slice(2, 4)}"]`).boundingBox()
  if (!from || !to) throw new Error(`squares of ${uci} not on screen`)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()
}

test.describe('mock engine', () => {
  test.beforeEach(async ({ page }) => {
    await enableMockEngine(page, evals)
  })

  test('DoD 1: chess.com live link gives a complete 112-ply review', async ({ page }) => {
    await importGame(page, LIVE)
    await waitForCompleteReview(page)
    await expect(page.getByTestId('review')).toHaveAttribute('data-game-id', 'cc:live:129688175007')
    expect(new URL(page.url()).searchParams.get('game')).toBe('cc:live:129688175007')

    await expect(page.getByTestId('player-white-name')).toHaveText('Arystanner')
    await expect(page.getByTestId('player-black-name')).toHaveText('Hikaru')
    await expect(page.getByTestId('result')).toContainText('1-0')
    await expect(page.getByTestId('accuracy-white')).toHaveText(/\b\d{1,3}\.\d\b/)
    await expect(page.getByTestId('accuracy-black')).toHaveText(/\b\d{1,3}\.\d\b/)
    await expect(page.getByTestId('eval-graph')).toHaveAttribute('data-points', '112')
    for (const side of ['white', 'black'])
      for (const phase of ['opening', 'middlegame', 'endgame'])
        await expect(page.getByTestId(`phase-grade-${side}-${phase}`)).toBeVisible()
    // Both header ratings are known (3015 / 3282), so the regression estimate is shown, not the ACPL fallback.
    for (const side of ['white', 'black']) {
      await expect(page.getByTestId(`rating-${side}`)).toHaveText(/\b\d{3,4}\b/)
      await expect(page.getByTestId(`rating-${side}`)).not.toContainText('n/a')
      await expect(page.getByTestId(`rating-${side}`)).not.toContainText('rough estimate')
    }
    expect(await page.getByTestId('key-moment-tick').count()).toBeGreaterThanOrEqual(1)
    // 56 moves per side, none in notAnalysed in a mock-engine run.
    expect(await tallySum(page, 'white')).toBe(56)
    expect(await tallySum(page, 'black')).toBe(56)

    await page.getByTestId('start-review').click()
    const moves = await moveEntries(page)
    expect(moves.map(([ply]) => ply)).toEqual(Array.from({ length: 112 }, (_, i) => i + 1))
    for (const [ply, cls] of moves) expect(CLASSIFICATIONS, `class of ply ${ply}`).toContain(cls)
    expect(net.unmocked.filter((u) => !u.includes('chesscomfiles.com'))).toEqual([])
  })

  test('DoD 2: daily custom-start game decodes every ply with castling normalised', async ({ page }) => {
    await importGame(page, DAILY)
    await waitForCompleteReview(page)
    await expect(page.getByTestId('banner-custom-start')).toHaveText(I15)
    await expect(page.getByTestId('tally-white-book')).toHaveText('0')
    await expect(page.getByTestId('tally-black-book')).toHaveText('0')

    await page.getByTestId('start-review').click()
    const moves = await moveEntries(page)
    expect(moves.map(([ply]) => ply)).toEqual(Array.from({ length: 144 }, (_, i) => i + 1))
    expect(moves.filter(([, cls]) => cls === 'book')).toEqual([])
    await expect(page.getByTestId('move-14')).toContainText('O-O-O') // Black, encoded e8a8
    await expect(page.getByTestId('move-15')).toContainText('O-O-O') // White, encoded e1c1
    await page.getByTestId('first').click()
    await expect.poll(() => boardPlacement(page)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR')
  })

  test('DoD 3: a live 404 shows I-2 and never calls the daily endpoint', async ({ page }) => {
    await importGame(page, 'https://www.chess.com/game/live/1859764312')
    await expect(page.getByTestId('import-error')).toHaveText(I2)
    expect(net.requests.some((u) => u.includes('kind=live') && u.includes('id=1859764312'))).toBe(true)
    expect(net.requests.filter((u) => /kind=daily|\/cc-rewrite\/daily\//.test(u))).toEqual([])
  })

  test.describe('Pages build', () => {
    // Routes do not see requests a service worker makes in WebKit, so this import test runs without the coi
    // worker (the app continues single-threaded after the 3 s timer of D.8); isolation is pages-coi.spec.ts.
    test.use({ serviceWorkers: 'block' })

    test('DoD 4: a chess.com link asks for a username and finds the game in at most 3 requests', async ({
      page,
    }) => {
      await importGame(page, LIVE, PAGES)
      await expect(page.getByTestId('import-notice')).toContainText(P5)
      await page.getByTestId('import-username').fill('arystanner')
      await page.getByTestId('import-submit').click()
      await waitForCompleteReview(page)
      await expect(page.getByTestId('review')).toHaveAttribute('data-game-id', 'cc:live:129688175007')
      const api = net.requests.filter((u) => u.startsWith('https://api.chess.com/'))
      expect(api[0]).toBe('https://api.chess.com/pub/player/arystanner/games/archives')
      expect(api.length).toBeLessThanOrEqual(3)
      expect(net.requests.filter((u) => u.includes('/api/'))).toEqual([])
    })
  })

  test('DoD 5: lichess from-position game against the computer', async ({ page }) => {
    await importGame(page, LICHESS)
    await waitForCompleteReview(page)
    await expect(page.getByTestId('banner-custom-start')).toHaveText(I15)
    await expect(page.getByTestId('player-black')).toContainText('Bot')
    await expect(page.getByTestId('tally-white-book')).toHaveText('0')
    await expect(page.getByTestId('tally-black-book')).toHaveText('0')

    await page.getByTestId('start-review').click()
    const moves = await moveEntries(page)
    expect(moves.map(([ply]) => ply)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1))
    expect(moves.filter(([, cls]) => cls === 'book')).toEqual([])
    await expect(page.getByTestId('move-13')).toHaveAttribute('data-classification', 'best') // Ra7#
    await page.getByTestId('first').click()
    await expect.poll(() => boardPlacement(page)).toBe('8/8/8/8/3k4/8/R7/R3K3')
  })

  test('DoD 7: the Explain toggle hides the coaching only, answers to e and survives a reload', async ({
    page,
  }) => {
    await importGame(page, LIVE)
    await waitForCompleteReview(page)
    await page.getByTestId('start-review').click()
    const moves = await moveEntries(page)
    const error = moves.find(
      ([, c]) => c === 'inaccuracy' || c === 'mistake' || c === 'blunder' || c === 'miss',
    )
    expect(error, 'the live game has at least one inaccuracy, mistake, miss or blunder').toBeDefined()
    const ply = error![0]
    await page.getByTestId(`move-${ply}`).click()
    await expect(page.getByTestId(`move-${ply}`)).toHaveAttribute('aria-current', 'true')

    const toggle = page.getByTestId('explain-toggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true') // default on
    await expect(page.getByTestId('coach-text')).toBeVisible()
    await expect(page.getByTestId('best-chip')).toBeVisible()
    const arrows = page.getByTestId('board').locator('marker')
    const arrowsOn = await arrows.count()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('coach-text')).toBeHidden()
    await expect(page.getByTestId('best-chip')).toBeHidden()
    // Only the played-move arrow stays (E.8: drawn independent of the toggle).
    const arrowsOff = await arrows.count()
    expect(arrowsOff).toBeLessThanOrEqual(1)
    expect(arrowsOff).toBeLessThanOrEqual(arrowsOn)
    await expect(page.getByTestId('board-badge').first()).toBeVisible()
    await expect(page.getByTestId('eval-bar')).toBeVisible()
    await expect(page.getByTestId('move-list').getByLabel(CLASS_LABEL).first()).toBeVisible()
    await page.getByTestId('back-to-overview').click()
    await expect(page.getByTestId('eval-graph')).toBeVisible()
    await page.getByTestId('start-review').click()

    await page.keyboard.press('e')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('coach-text')).toBeVisible()
    await page.keyboard.press('e')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await page.reload()
    await expect(page.getByTestId('review')).toBeVisible()
    if (!(await toggle.isVisible())) await page.getByTestId('start-review').click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('coach-text')).toBeHidden()
  })

  test('DoD 8: Retry grades a move played on the board per G.4', async ({ page }) => {
    // Candidate White plies (the board faces the default "You played: White") from the eval table: the
    // engine's top move must give Correct; the second line gives OK when its loss is in the Good band
    // (2 to 5 win% points) and Incorrect when it is at least an Inaccuracy (soft cap and mate tables kept out).
    const month = readNetworkFixture('api.chess.com-month-arystanner-2025-01.json').body as {
      games: { url: string; pgn: string }[]
    }
    const chess = new Chess()
    chess.loadPgn(month.games.find((g) => g.url.endsWith('/129688175007'))!.pgn)
    const win = (cp: number) =>
      50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1)
    const candidates = chess
      .history({ verbose: true })
      .map((m, i) => ({ ply: i + 1, ev: evals[`${m.before.split(' ').slice(0, 4).join(' ')}|16|2`] }))
      .filter(({ ply, ev }) => ply % 2 === 1 && ply > 16 && ev?.lines.length === 2)
      .filter(({ ev }) => ev.lines.every((l) => l.score.type === 'cp' && l.pv[0]?.length === 4))
      .map(({ ply, ev }) => {
        const before = win(ev.lines[0].score.value)
        return {
          ply,
          best: ev.lines[0].pv[0],
          second: ev.lines[1].pv[0],
          before,
          loss: before - win(ev.lines[1].score.value),
        }
      })
      .filter((c) => c.before > 10 && c.before < 90)
    const correct = candidates[0]
    const ok = candidates.find((c) => c.loss >= 2.3 && c.loss <= 4.7)
    const incorrect = candidates.find((c) => c.loss >= 7)
    expect(correct && ok && incorrect, 'retry candidates in the eval table').toBeTruthy()

    // The board respects prefers-reduced-motion: without the step-back animation of Retry the drag starts on a
    // settled piece in every browser version.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await importGame(page, LIVE)
    await waitForCompleteReview(page)
    await page.getByTestId('start-review').click()
    for (const [c, uci, feedback] of [
      [correct!, correct!.best, 'Correct'],
      [ok!, ok!.second, 'OK'],
      [incorrect!, incorrect!.second, 'Incorrect'],
    ] as const) {
      // A graded attempt stays in Retry mode (the button then reads "Exit retry"): leave it before the next one.
      if ((await page.getByTestId('retry').getAttribute('aria-pressed')) === 'true')
        await page.getByTestId('retry').click()
      await page.getByTestId(`move-${c.ply}`).click()
      await expect(page.getByTestId(`move-${c.ply}`)).toHaveAttribute('aria-current', 'true')
      await page.getByTestId('retry').click()
      await expect(page.getByTestId('retry')).toHaveAttribute('aria-pressed', 'true')
      await dragMove(page, uci)
      await expect(page.getByTestId('retry-feedback'), `ply ${c.ply} ${uci}`).toContainText(feedback)
    }
  })

  test('DoD 9: reopening a reviewed game renders from IndexedDB without starting the engine', async ({
    page,
    context,
  }) => {
    await importGame(page, LIVE)
    await waitForCompleteReview(page)
    await page.close()

    // A fresh page in the same browser context (same IndexedDB) without the mock flag: the real engine
    // would boot if anything asked for it.
    const reopened = await context.newPage()
    requested.length = 0
    await reopened.goto('/?game=cc:live:129688175007&ply=40')
    await waitForCompleteReview(reopened)
    if (!(await reopened.getByTestId('move-40').isVisible()))
      await reopened.getByTestId('start-review').click()
    await expect(reopened.getByTestId('move-40')).toHaveAttribute('aria-current', 'true')
    await reopened.waitForLoadState('networkidle')
    await reopened.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 500))),
    )
    expect(await reopened.evaluate(() => window.__ANALYSE_ENGINE_STATS__?.())).toEqual({
      workersCreated: 0,
      uciSent: 0,
    })
    expect(requested.filter((u) => ENGINE_FILE.test(new URL(u).pathname))).toEqual([])
  })

  test.describe('360 px', () => {
    test.use({ viewport: { width: 360, height: 780 } })

    test('R30: no horizontal scroll at 360 px on any screen', async ({ page }) => {
      const scrollWidth = () => page.evaluate(() => document.documentElement.scrollWidth)
      await page.goto('/')
      await expect(page.getByTestId('import-input')).toBeVisible()
      expect(await scrollWidth()).toBeLessThanOrEqual(360)
      await page.getByTestId('import-input').fill(LIVE)
      await page.getByTestId('import-submit').click()
      await waitForCompleteReview(page)
      await expect(page.getByTestId('overview')).toBeVisible()
      expect(await scrollWidth()).toBeLessThanOrEqual(360)
      await page.getByTestId('start-review').click()
      await expect(page.getByTestId('board')).toBeVisible()
      expect(await scrollWidth()).toBeLessThanOrEqual(360)
    })
  })

  test.describe('G.5 screenshots', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('finished review at ply 40, desktop 1280x800 and mobile 390x844 @2x', async ({
      page,
      browser,
    }, testInfo) => {
      // The committed screenshots come from Chromium; WebKit writes its pair to its test-results folder.
      const shot = (name: string) =>
        testInfo.project.name === 'chromium' ? `e2e/screenshots/${name}` : testInfo.outputPath(name)

      await importGame(page, LIVE)
      await waitForCompleteReview(page)
      await page.goto('/?game=cc:live:129688175007&ply=40')
      await waitForCompleteReview(page)
      if (!(await page.getByTestId('move-40').isVisible())) await page.getByTestId('start-review').click()
      await expect(page.getByTestId('move-40')).toHaveAttribute('aria-current', 'true')
      await expect(page.getByTestId('board-badge').first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280)
      await page.screenshot({ path: shot('review-desktop.png'), fullPage: true })

      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
      try {
        await mockNetwork(mobile)
        const phone = await mobile.newPage()
        await enableMockEngine(phone, evals)
        await importGame(phone, LIVE)
        await waitForCompleteReview(phone)
        await phone.goto('/?game=cc:live:129688175007&ply=40')
        await waitForCompleteReview(phone)
        if (!(await phone.getByTestId('board').isVisible())) await phone.getByTestId('start-review').click()
        await expect(phone.getByTestId('move-40')).toHaveAttribute('aria-current', 'true')
        await expect(phone.getByTestId('board-badge').first()).toBeVisible()
        expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
        await phone.screenshot({ path: shot('review-mobile.png'), fullPage: true })
      } finally {
        await mobile.close()
      }
    })
  })
})

test.describe('real engine', () => {
  // DoD 10 is not vacuous: the engine really boots here, and in WebKit it must be the lite-single build.
  test('the engine boots on the first analysis; WebKit loads lite-single only', async ({
    page,
  }, testInfo) => {
    await importGame(page, LICHESS)
    await expect(page.getByTestId('engine-status')).toHaveText(/Single-core mode|Multi-core: \d+ threads/, {
      timeout: 60_000,
    })
    const engine = requested.filter((u) => ENGINE_FILE.test(new URL(u).pathname))
    expect(engine.length).toBeGreaterThan(0)
    if (testInfo.project.name === 'webkit') {
      await expect(page.getByTestId('engine-status')).toHaveText(/Single-core mode/)
      expect(engine.some((u) => u.endsWith('/stockfish-19-lite-single.js'))).toBe(true)
    }
  })
})
