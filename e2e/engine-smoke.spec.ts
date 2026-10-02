// Real-engine smoke test (R33, DoD 10, risk 3): the vendored stockfish 19 lite single build boots as a classic
// worker on the served Vercel-style build and answers `uciok` and a `bestmove` within 10 s with no console
// errors, in Chromium and WebKit. It creates the worker itself, so it does not depend on src/engine.
import { expect, test } from '@playwright/test'

test('stockfish 19 lite single answers uciok and bestmove within 10 s', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    // The browser's own favicon probe for the plain-text document below is not engine output.
    if (msg.type() === 'error' && !msg.location().url.endsWith('/favicon.ico'))
      errors.push(`console: ${msg.text()} (${msg.location().url})`)
  })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`)
  })

  // A same-origin document of the served build (with its COOP/COEP headers) that runs no app code, so only
  // the engine can produce console output here.
  const res = await page.goto('/engine/sf19/Copying.txt')
  expect(res?.ok()).toBe(true)

  const result = await page.evaluate(
    () =>
      new Promise<{ uciok: boolean; bestmove: string; ms: number; lines: number }>((resolve, reject) => {
        const started = performance.now()
        const worker = new Worker('/engine/sf19/stockfish-19-lite-single.js')
        let uciok = false
        let lines = 0
        const timer = setTimeout(() => {
          worker.terminate()
          reject(new Error(`timeout after 10 s (uciok: ${uciok}, ${lines} lines)`))
        }, 10_000)
        worker.onerror = (e) => {
          clearTimeout(timer)
          worker.terminate()
          reject(new Error(`worker error: ${e.message}`))
        }
        worker.onmessage = (e: MessageEvent) => {
          const line = String(e.data)
          lines++
          if (line === 'uciok') {
            uciok = true
            worker.postMessage('position startpos')
            worker.postMessage('go depth 12 movetime 2000')
          } else if (line.startsWith('bestmove')) {
            clearTimeout(timer)
            worker.terminate()
            resolve({ uciok, bestmove: line, ms: performance.now() - started, lines })
          }
        }
        worker.postMessage('uci')
      }),
  )

  expect(result.uciok).toBe(true)
  expect(result.bestmove).toMatch(/^bestmove [a-h][1-8][a-h][1-8][qrbn]?( ponder \S+)?$/)
  expect(result.ms).toBeLessThan(10_000)
  expect(errors).toEqual([])
})
