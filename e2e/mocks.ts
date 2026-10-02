// Network and engine mocks shared by e2e/review.spec.ts and e2e/parity-shots.mjs (PROMPT.md D.4, R33).
// The suite never touches the network: the proxy, the public API and lichess answer from the recorded
// wrappers in src/test/fixtures/network/ (PLAN.md Assumption 13: { url, status, contentType, acao, body }),
// every other non-local request is aborted, and the mock engine answers from src/test/fixtures/evals/*.json.
// Plain erasable TypeScript only: parity-shots.mjs imports this file directly under Node's type stripping.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { BrowserContext, Page, Route } from '@playwright/test'

declare global {
  interface Window {
    __USE_MOCK_ENGINE__?: boolean
    __MOCK_EVALS__?: Record<string, MockEval>
    __ANALYSE_ENGINE_STATS__?: () => { workersCreated: number; uciSent: number }
  }
}

/** The part of a recorded PositionEval (White-perspective scores) that the specs read. */
export interface MockEval {
  fen: string
  lines: { multipv: number; depth: number; score: { type: 'cp' | 'mate'; value: number }; pv: string[] }[]
  depth: number
  multiPv: 1 | 2
  bestmove: string | null
}

export interface NetworkFixture {
  url: string
  status: number
  contentType: string
  acao: string | null
  body: unknown
}

const fixturesDir = fileURLToPath(new URL('../src/test/fixtures/', import.meta.url))

export function readNetworkFixture(name: string): NetworkFixture {
  return JSON.parse(readFileSync(`${fixturesDir}network/${name}`, 'utf8')) as NetworkFixture
}

/** The merged content of src/test/fixtures/evals/*.json, keyed `FEN(4 fields)|depth|multipv`. */
export function loadMockEvals(): Record<string, MockEval> {
  const dir = `${fixturesDir}evals/`
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : []
  if (files.length === 0) throw new Error(`no eval tables in ${dir}; run npm run record-evals`)
  const table: Record<string, MockEval> = {}
  for (const f of files) Object.assign(table, JSON.parse(readFileSync(dir + f, 'utf8')))
  return table
}

/** Sets the mock-engine flag and the eval table before any app code runs, on every navigation of `page`. */
export async function enableMockEngine(page: Page, evals: Record<string, MockEval>): Promise<void> {
  await page.addInitScript((table) => {
    window.__USE_MOCK_ENGINE__ = true
    window.__MOCK_EVALS__ = table
  }, evals)
}

/** The recorded fixture file that answers `url`, or null when the request was never recorded. */
function fixtureFor(url: URL): string | null {
  let m: RegExpMatchArray | null
  if (url.pathname === '/api/chesscom') {
    const kind = url.searchParams.get('kind')
    const id = url.searchParams.get('id')
    return kind && id ? `www.chess.com-${kind}-${id}.json` : null
  }
  if ((m = url.pathname.match(/^\/api\/cc-rewrite\/(live|daily)\/(\d+)$/)))
    return `www.chess.com-${m[1]}-${m[2]}.json`
  if (url.hostname === 'api.chess.com') {
    const p = url.pathname.replace(/\/$/, '')
    if ((m = p.match(/^\/pub\/player\/([^/]+)\/games\/archives$/)))
      return `api.chess.com-archives-${m[1]}.json`
    if ((m = p.match(/^\/pub\/player\/([^/]+)\/games\/(\d{4})\/(\d{2})$/)))
      return `api.chess.com-month-${m[1]}-${m[2]}-${m[3]}.json`
    if ((m = p.match(/^\/pub\/player\/([^/]+)\/games$/))) return `api.chess.com-games-${m[1]}.json`
    if ((m = p.match(/^\/pub\/player\/([^/]+)$/))) return `api.chess.com-player-${m[1]}.json`
    return null
  }
  if (url.hostname === 'lichess.org' && (m = url.pathname.match(/^\/game\/export\/([A-Za-z0-9]{8})$/)))
    return `lichess.org-game-${m[1]}.json`
  return null
}

/**
 * Routes the proxy, the public API and lichess to the recorded fixtures and aborts every other non-local
 * request. `requests` lists every proxy / public API / lichess URL the app asked for (in order); `unmocked`
 * the ones without a recording (they are aborted, which the app sees as a network error).
 */
export async function mockNetwork(
  context: BrowserContext,
): Promise<{ requests: string[]; unmocked: string[] }> {
  const requests: string[] = []
  const unmocked: string[] = []
  // Registered first, so it runs last: Playwright tries the most recently registered matching route first.
  await context.route(/^(?!https?:\/\/(localhost|127\.0\.0\.1)[:/])/, (route) => {
    unmocked.push(route.request().url())
    return route.abort()
  })
  const fromFixture = async (route: Route) => {
    const href = route.request().url()
    requests.push(href)
    const name = fixtureFor(new URL(href))
    if (!name || !existsSync(`${fixturesDir}network/${name}`)) {
      unmocked.push(href)
      return route.abort()
    }
    const f = readNetworkFixture(name)
    return route.fulfill({
      status: f.status,
      contentType: f.contentType,
      headers: f.acao ? { 'access-control-allow-origin': f.acao } : {},
      body: typeof f.body === 'string' ? f.body : JSON.stringify(f.body),
    })
  }
  await context.route('**/api/chesscom**', fromFixture)
  await context.route('**/api/cc-rewrite/**', fromFixture)
  await context.route('https://api.chess.com/**', fromFixture)
  await context.route('https://lichess.org/**', fromFixture)
  return { requests, unmocked }
}
