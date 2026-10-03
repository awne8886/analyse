// Parity screenshots for the review-parity reviewer (PROMPT.md section 4.2 Phase 4, Appendix G).
// A plain Node script, never run by the test runner:
//   npx vite preview --port 4190 &   then   node e2e/parity-shots.mjs 4190
// It loads cc:live:129688175007 through the mock engine with the same mocks as e2e/review.spec.ts and saves the
// import, overview and move-by-move screens at 1280 px and 360 px wide under test-results/parity/.
// PW_CHROMIUM_PATH selects a preinstalled Chromium, as in playwright.config.ts.
/* global console */
import { mkdirSync } from 'node:fs'
import process from 'node:process'
import { chromium } from '@playwright/test'
import { enableMockEngine, loadMockEvals, mockNetwork } from './mocks.ts'

const port = process.argv[2]
if (!/^\d+$/.test(port ?? '')) {
  console.error('usage: node e2e/parity-shots.mjs <port>')
  process.exit(2)
}
const base = `http://localhost:${port}/`
const outDir = 'test-results/parity'
mkdirSync(outDir, { recursive: true })

const evals = loadMockEvals()
const executablePath = process.env.PW_CHROMIUM_PATH
const browser = await chromium.launch(executablePath ? { executablePath } : {})
try {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 360, height: 780 },
  ]) {
    const context = await browser.newContext({ viewport })
    const net = await mockNetwork(context)
    const page = await context.newPage()
    await enableMockEngine(page, evals)
    const shot = async (screen) => {
      const path = `${outDir}/${screen}-${viewport.width}.png`
      await page.screenshot({ path, fullPage: true })
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      console.log(`${path} (scrollWidth ${scrollWidth})`)
    }

    await page.goto(base)
    await page.getByTestId('import-input').waitFor()
    await shot('import')

    await page.getByTestId('import-input').fill('https://www.chess.com/game/live/129688175007')
    await page.getByTestId('import-submit').click()
    await page.locator('[data-testid="review"][data-complete="true"]').waitFor({ timeout: 120_000 })
    await page.getByTestId('overview').waitFor()
    await shot('overview')

    await page.getByTestId('start-review').click()
    await page.getByTestId('move-40').click()
    await page.locator('[data-testid="move-40"][aria-current="true"]').waitFor()
    await shot('move-by-move')

    if (net.unmocked.length) console.log(`aborted (not recorded): ${net.unmocked.join(', ')}`)
    await context.close()
  }
} finally {
  await browser.close()
}
