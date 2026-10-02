// Steps (1) and (2) of the Vercel import chain (R3, section 3.3): the Node function `${proxyUrl}?kind=&id=`, then the
// zero-code rewrite `/api/cc-rewrite/<live|daily>/<id>` (none exists for `computer`). Every response's content-type
// must include application/json before it is parsed. A failure of both paths sets the `proxyDown` memo in
// sessionStorage, and both paths are skipped for 10 minutes.
import type { ChesscomKind } from '../types/game'
import type { CallbackBody } from './chesscomGame'
import { formatImportString } from './errors'
import { jsonBody, serial, type Waits } from './net'

export const PROXY_TIMEOUT_MS = 12_000
export const PROXY_RETRY_MS = 2_000
export const PROXY_DOWN_KEY = 'proxyDown'
export const PROXY_DOWN_TTL_MS = 10 * 60 * 1000

/** Why the proxy chain gave up; each maps onto one Appendix F.2 / F.1 row. */
export type ProxyFailure = 'blocked' | 'timeout' | 'unreachable' | 'rate_limited'
export type ProxyOutcome =
  | { status: 'found'; body: CallbackBody; via: 'proxy' | 'rewrite' }
  | { status: 'not_found' }
  | { status: 'failed'; reason: ProxyFailure }

type Attempt = Exclude<ProxyOutcome, { status: 'failed' }> | { status: 'retryable'; reason: ProxyFailure }

function sessionStore(): Storage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

export function proxyIsDown(now = Date.now()): boolean {
  try {
    const at = Number(sessionStore()?.getItem(PROXY_DOWN_KEY))
    return Number.isFinite(at) && at > 0 && now - at < PROXY_DOWN_TTL_MS
  } catch {
    return false
  }
}

function markProxyDown(): void {
  try {
    sessionStore()?.setItem(PROXY_DOWN_KEY, String(Date.now()))
  } catch {
    // private mode or blocked storage: the memo is a convenience only
  }
}

/** One request to one path, classified. */
async function attempt(url: string, via: 'proxy' | 'rewrite'): Promise<Attempt> {
  let res: Response
  try {
    res = await serial('chesscom', () =>
      fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(PROXY_TIMEOUT_MS) }),
    )
  } catch (e) {
    const name = (e as { name?: string } | null)?.name
    return {
      status: 'retryable',
      reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable',
    }
  }
  const body = await jsonBody(res)
  if (body === undefined) return { status: 'retryable', reason: 'blocked' } // HTML challenge or the SPA index.html
  if (res.status === 200) {
    const game = (body as Partial<CallbackBody> | null)?.game
    return game && typeof game.moveList === 'string'
      ? { status: 'found', body: body as CallbackBody, via }
      : { status: 'retryable', reason: 'unreachable' }
  }
  if (res.status === 404) return { status: 'not_found' }
  if (res.status === 429) return { status: 'retryable', reason: 'rate_limited' }
  if (
    res.status === 403 ||
    (res.status === 503 && (body as { error?: unknown })?.error === 'upstream_blocked')
  ) {
    return { status: 'retryable', reason: 'blocked' }
  }
  if (res.status === 504) return { status: 'retryable', reason: 'timeout' }
  return { status: 'retryable', reason: 'unreachable' }
}

/**
 * Looks up one chess.com game of one kind through the proxy chain. A 404 is final (never another kind); 429 from
 * the function shows P-2, waits 2 s and retries once; a second 429, or 502/503/504, an HTML body or a network
 * error moves on to the rewrite. The caller decides what a failure shows (P-1, P-3, P-4, I-18).
 */
export async function lookupViaProxy(
  kind: ChesscomKind,
  id: string,
  proxyUrl: string,
  w: Waits,
): Promise<ProxyOutcome> {
  const fnUrl = `${proxyUrl}?kind=${kind}&id=${id}`
  let first = await attempt(fnUrl, 'proxy')
  if (first.status === 'retryable' && first.reason === 'rate_limited') {
    w.onStatus?.('P-2', formatImportString('P-2'))
    await w.wait(PROXY_RETRY_MS)
    first = await attempt(fnUrl, 'proxy')
  }
  if (first.status !== 'retryable') return first

  let last: Attempt = first
  if (kind !== 'computer') last = await attempt(`/api/cc-rewrite/${kind}/${id}`, 'rewrite')
  if (last.status !== 'retryable') return last
  if (last.reason !== 'rate_limited') markProxyDown()
  return { status: 'failed', reason: last.reason }
}
