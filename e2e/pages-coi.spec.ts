// GitHub Pages first visit (PROMPT.md risk 4 and 12, D.8, DoD 11): the preview of dist-pages/ at base /analyse/
// sends no COOP/COEP headers, so isolation can only come from the vendored coi service worker. The first visit
// reloads at most once (at most 2 main-frame documents), keeps the query string, ends cross-origin isolated
// and is controlled by a worker whose scope is the base path.
import { expect, test } from '@playwright/test'

const URL_UNDER_TEST = 'http://localhost:4181/analyse/?game=cc:live:129688175007&ply=5'

test('the Pages build isolates through the coi service worker and keeps the URL', async ({ page }) => {
  // Counts main-frame documents across reloads (sessionStorage survives a reload of the same tab).
  await page.addInitScript(() => {
    if (window !== window.top) return
    sessionStorage.setItem(
      '__e2eDocuments',
      String(Number(sessionStorage.getItem('__e2eDocuments') ?? 0) + 1),
    )
    // Diagnostics for a failure: how each document started (isolated / controlled) and when.
    const log = JSON.parse(sessionStorage.getItem('__e2eDocLog') ?? '[]') as unknown[]
    log.push({
      isolated: window.crossOriginIsolated,
      controlled: navigator.serviceWorker?.controller != null,
      t: Math.round(performance.timeOrigin) % 100000,
    })
    sessionStorage.setItem('__e2eDocLog', JSON.stringify(log))
  })
  const consoleLines: string[] = []
  page.on('console', (m) => consoleLines.push(m.text()))
  await page.goto(URL_UNDER_TEST)

  const snapshot = () =>
    page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return {
        isolated: window.crossOriginIsolated,
        documents: Number(sessionStorage.getItem('__e2eDocuments')),
        coiReloading: sessionStorage.getItem('coiReloading'),
        scope: registration?.scope ?? null,
        active: registration?.active?.state ?? null,
        controlled: navigator.serviceWorker.controller !== null,
        href: location.href,
      }
    })
  // A failure reports the last snapshot, i.e. how far the first visit got.
  let last: unknown = null
  try {
    await expect
      .poll(
        async () => {
          try {
            last = await snapshot()
            return (last as { isolated: boolean }).isolated
          } catch {
            return false // the execution context went away during the reload
          }
        },
        { timeout: 15_000 },
      )
      .toBe(true)
  } catch (e) {
    throw new Error(`${(e as Error).message}\nlast snapshot: ${JSON.stringify(last)}`, { cause: e })
  }
  await page.waitForLoadState('load')

  const state = await snapshot()
  expect(state.documents).toBeGreaterThanOrEqual(1)
  const docLog = await page.evaluate(() => sessionStorage.getItem('__e2eDocLog'))
  // Chromium: at most one reload (risk 4). WebKit 26.6 (CI, 2026-10-03) does not isolate the document reloaded from
  // the non-isolated first visit even though the coi worker controls it ([{isolated:false,controlled:false},
  // {isolated:false,controlled:true},{isolated:true,controlled:true}]); the vendored script's coepdegrade reload
  // then isolates it, so WebKit needs exactly one more document (PLAN.md Assumption 28).
  const maxDocuments = test.info().project.name === 'webkit' ? 3 : 2
  expect(
    state.documents,
    `documents: ${docLog}\nconsole: ${JSON.stringify(consoleLines)}`,
  ).toBeLessThanOrEqual(maxDocuments)
  expect(state.isolated).toBe(true)
  expect(state.scope).toMatch(/\/analyse\/$/)
  expect(state.controlled).toBe(true)
  const url = new URL(state.href)
  expect(url.origin + url.pathname).toBe('http://localhost:4181/analyse/')
  expect(url.searchParams.get('game')).toBe('cc:live:129688175007')
  expect(url.searchParams.get('ply')).toBe('5')
})
