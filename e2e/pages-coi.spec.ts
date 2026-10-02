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
  })
  await page.goto(URL_UNDER_TEST)

  await expect
    .poll(
      async () => {
        try {
          return await page.evaluate(() => window.crossOriginIsolated)
        } catch {
          return false // the execution context went away during the reload
        }
      },
      { timeout: 15_000 },
    )
    .toBe(true)
  await page.waitForLoadState('load')

  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    return {
      documents: Number(sessionStorage.getItem('__e2eDocuments')),
      isolated: window.crossOriginIsolated,
      scope: registration?.scope ?? null,
      controlled: navigator.serviceWorker.controller !== null,
      href: location.href,
    }
  })
  expect(state.documents).toBeGreaterThanOrEqual(1)
  expect(state.documents).toBeLessThanOrEqual(2)
  expect(state.isolated).toBe(true)
  expect(state.scope).toMatch(/\/analyse\/$/)
  expect(state.controlled).toBe(true)
  const url = new URL(state.href)
  expect(url.origin + url.pathname).toBe('http://localhost:4181/analyse/')
  expect(url.searchParams.get('game')).toBe('cc:live:129688175007')
  expect(url.searchParams.get('ply')).toBe('5')
})
