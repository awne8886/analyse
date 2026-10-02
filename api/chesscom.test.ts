// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from './chesscom.js'

const REPO_URL = 'https://github.com/awne8886/analyse'
const LIVE_ID = '129688175007'

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function call(query: string, init?: RequestInit): Promise<Response> {
  return handler.fetch(new Request(`https://x.test/api/chesscom${query}`, init))
}

function live(): Promise<Response> {
  return call(`?kind=live&id=${LIVE_ID}`)
}

function upstream(body: string, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const headers = new Headers(init.headers)
  return new Response(body, { status: init.status ?? 200, headers })
}

function jsonUpstream(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return upstream(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } })
}

function stubFetch(make: () => Response | Promise<Response>): FetchMock {
  const mock = vi.fn<typeof fetch>(async () => make())
  vi.stubGlobal('fetch', mock)
  return mock
}

function stubFetchRejecting(error: unknown): FetchMock {
  const mock = vi.fn<typeof fetch>(() => Promise.reject(error))
  vi.stubGlobal('fetch', mock)
  return mock
}

function lastCall(mock: FetchMock): { url: string; init: RequestInit } {
  const [input, init] = mock.mock.calls[0] as [string | URL | Request, RequestInit | undefined]
  return { url: String(input instanceof Request ? input.url : input), init: init ?? {} }
}

const savedEmail = process.env.CONTACT_EMAIL

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  if (savedEmail === undefined) delete process.env.CONTACT_EMAIL
  else process.env.CONTACT_EMAIL = savedEmail
})

describe('api/chesscom: successful upstream responses', () => {
  it('200 finished game: passes the body through with a 24 h CDN cache', async () => {
    const body = { game: { isFinished: true } }
    stubFetch(() => jsonUpstream(body))
    const res = await live()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=86400')
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual(body)
  })

  it('200 unfinished game: no-store', async () => {
    const body = { game: { isFinished: false } }
    stubFetch(() => jsonUpstream(body))
    const res = await live()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual(body)
  })

  it('200 JSON whose isFinished is not the boolean true: no-store', async () => {
    stubFetch(() => jsonUpstream({ game: { isFinished: 'true' } }))
    const res = await live()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('api/chesscom: 404 and 429 pass through unchanged', () => {
  it('daily 404 with the literal body []', async () => {
    stubFetch(() => upstream('[]', { status: 404, headers: { 'content-type': 'application/json' } }))
    const res = await call('?kind=daily&id=234150048')
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('[]')
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('live 404 with {"message":"Game is not found."}', async () => {
    const text = '{"message":"Game is not found."}'
    stubFetch(() => upstream(text, { status: 404, headers: { 'content-type': 'application/json' } }))
    const res = await live()
    expect(res.status).toBe(404)
    expect(await res.text()).toBe(text)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('computer 404 with {"error":"Game not found"}', async () => {
    const text = '{"error":"Game not found"}'
    stubFetch(() => upstream(text, { status: 404, headers: { 'content-type': 'application/json' } }))
    const res = await call('?kind=computer&id=1')
    expect(res.status).toBe(404)
    expect(await res.text()).toBe(text)
  })

  it('429 JSON', async () => {
    const text = '{"message":"Too many requests"}'
    stubFetch(() => upstream(text, { status: 429, headers: { 'content-type': 'application/json' } }))
    const res = await live()
    expect(res.status).toBe(429)
    expect(await res.text()).toBe(text)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('api/chesscom: blocked upstream is normalised to 503', () => {
  it('403 text/html with cf-mitigated: challenge', async () => {
    stubFetch(() =>
      upstream('<html><title>Just a moment...</title></html>', {
        status: 403,
        headers: { 'content-type': 'text/html; charset=UTF-8', 'cf-mitigated': 'challenge' },
      }),
    )
    const res = await live()
    expect(res.status).toBe(503)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body.error).toBe('upstream_blocked')
    expect(body.upstreamStatus).toBe(403)
    expect(body.cfMitigated).toBe('challenge')
  })

  it('200 with an HTML body', async () => {
    stubFetch(() => upstream('<html>nope</html>', { headers: { 'content-type': 'text/html' } }))
    const res = await live()
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('upstream_blocked')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('cf-mitigated header on an otherwise JSON response', async () => {
    stubFetch(() => jsonUpstream({ message: 'x' }, 403, { 'cf-mitigated': 'challenge' }))
    const res = await live()
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('upstream_blocked')
  })
})

describe('api/chesscom: network failures', () => {
  it('an AbortError from fetch gives 504 upstream_timeout', async () => {
    stubFetchRejecting(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const res = await live()
    expect(res.status).toBe(504)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect((await res.json()).error).toBe('upstream_timeout')
  })

  it('a TypeError network failure gives 502 upstream_unreachable', async () => {
    stubFetchRejecting(new TypeError('fetch failed'))
    const res = await live()
    expect(res.status).toBe(502)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect((await res.json()).error).toBe('upstream_unreachable')
  })

  it('aborts the upstream request after 10 seconds, not before', async () => {
    vi.useFakeTimers()
    const start = Date.now()
    let abortedAfter = -1
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              abortedAfter = Date.now() - start
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
            })
          }),
      ),
    )
    const pending = live()
    pending.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(10_000)
    const res = await pending
    expect(abortedAfter).toBe(10_000)
    expect(res.status).toBe(504)
    expect((await res.json()).error).toBe('upstream_timeout')
  })

  it('an unexpected upstream status such as 500 JSON gives 502 upstream_error', async () => {
    stubFetch(() => jsonUpstream({ message: 'boom' }, 500))
    const res = await live()
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toBe('upstream_error')
    expect(body.upstreamStatus).toBe(500)
  })
})

describe('api/chesscom: request validation', () => {
  it.each([
    ['missing kind', `?id=${LIVE_ID}`],
    ['missing id', '?kind=live'],
    ['bad kind', `?kind=blitz&id=${LIVE_ID}`],
    ['empty kind', `?kind=&id=${LIVE_ID}`],
    ['kind=constructor', `?kind=constructor&id=${LIVE_ID}`],
    ['kind=__proto__', `?kind=__proto__&id=${LIVE_ID}`],
    ['kind=toString', `?kind=toString&id=${LIVE_ID}`],
    ['id=0', '?kind=live&id=0'],
    ['non-numeric id', '?kind=live&id=abc'],
    ['id with a path traversal', '?kind=live&id=1%2F..%2F2'],
    ['leading zero id', '?kind=live&id=0123'],
    ['too long id', '?kind=live&id=1234567890123456'],
  ])('%s gives 400 and never reaches upstream', async (_name, query) => {
    const mock = stubFetch(() => jsonUpstream({}))
    const res = await call(query)
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect((await res.json()).error).toBe('bad_request')
    expect(mock).not.toHaveBeenCalled()
  })

  it('OPTIONS gives 204 without calling upstream', async () => {
    const mock = stubFetch(() => jsonUpstream({}))
    const res = await call(`?kind=live&id=${LIVE_ID}`, { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(mock).not.toHaveBeenCalled()
  })

  it('POST gives 405 without calling upstream', async () => {
    const mock = stubFetch(() => jsonUpstream({}))
    const res = await call(`?kind=live&id=${LIVE_ID}`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(405)
    expect((await res.json()).error).toBe('method_not_allowed')
    expect(mock).not.toHaveBeenCalled()
  })
})

describe('api/chesscom: upstream request', () => {
  it.each([
    ['live', '129688175007', 'https://www.chess.com/callback/live/game/129688175007'],
    ['daily', '234150048', 'https://www.chess.com/callback/daily/game/234150048'],
    ['computer', '42', 'https://www.chess.com/computer/callback/game/42'],
  ])('kind=%s targets the right chess.com URL', async (kind, id, expected) => {
    const mock = stubFetch(() => jsonUpstream({ game: { isFinished: false } }))
    await call(`?kind=${kind}&id=${id}`)
    expect(mock).toHaveBeenCalledTimes(1)
    expect(lastCall(mock).url).toBe(expected)
  })

  it('uses redirect: manual and an abort signal', async () => {
    const mock = stubFetch(() => jsonUpstream({ game: { isFinished: false } }))
    await live()
    const { init } = lastCall(mock)
    expect(init.redirect).toBe('manual')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal?.aborted).toBe(false)
  })

  it('asks for JSON', async () => {
    const mock = stubFetch(() => jsonUpstream({ game: { isFinished: false } }))
    await live()
    expect(new Headers(lastCall(mock).init.headers).get('accept')).toContain('application/json')
  })

  it('never forwards upstream set-cookie', async () => {
    const headers = new Headers({ 'content-type': 'application/json' })
    headers.append('set-cookie', '__cf_bm=abc; Path=/; HttpOnly')
    headers.append('set-cookie', 'psid=def; Path=/')
    stubFetch(() => new Response(JSON.stringify({ game: { isFinished: true } }), { status: 200, headers }))
    const res = await live()
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('never forwards set-cookie on passthrough and error responses either', async () => {
    const blocked = new Headers({ 'content-type': 'text/html', 'cf-mitigated': 'challenge' })
    blocked.append('set-cookie', '__cf_bm=abc')
    stubFetch(() => new Response('<html></html>', { status: 403, headers: blocked }))
    expect((await live()).headers.get('set-cookie')).toBeNull()

    const notFound = new Headers({ 'content-type': 'application/json' })
    notFound.append('set-cookie', 'visitorid=1')
    stubFetch(() => new Response('[]', { status: 404, headers: notFound }))
    expect((await live()).headers.get('set-cookie')).toBeNull()
  })
})

describe('api/chesscom: User-Agent', () => {
  async function sentUserAgent(email: string | undefined): Promise<string> {
    if (email === undefined) delete process.env.CONTACT_EMAIL
    else process.env.CONTACT_EMAIL = email
    vi.resetModules()
    const { default: fresh } = await import('./chesscom.js')
    const mock = stubFetch(() => jsonUpstream({ game: { isFinished: false } }))
    await fresh.fetch(new Request(`https://x.test/api/chesscom?kind=live&id=${LIVE_ID}`))
    expect(mock).toHaveBeenCalledTimes(1)
    return new Headers(lastCall(mock).init.headers).get('user-agent') ?? ''
  }

  it('names the repository and the CONTACT_EMAIL address when it is set', async () => {
    const ua = await sentUserAgent('me@example.org')
    expect(ua).toContain(REPO_URL)
    expect(ua).toContain('me@example.org')
    expect(ua).not.toContain('contact: GitHub issues')
  })

  it('names the repository and the literal "contact: GitHub issues" when CONTACT_EMAIL is unset', async () => {
    const ua = await sentUserAgent(undefined)
    expect(ua).toContain(REPO_URL)
    expect(ua).toContain('contact: GitHub issues')
  })

  it('treats an empty CONTACT_EMAIL as unset', async () => {
    const ua = await sentUserAgent('')
    expect(ua).toContain(REPO_URL)
    expect(ua).toContain('contact: GitHub issues')
  })
})
