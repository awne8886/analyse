const UA = `analyse-game-review/1.0 (+https://github.com/awne8886/analyse; contact: ${process.env.CONTACT_EMAIL || 'GitHub issues'})`
const UPSTREAM: Record<string, (id: string) => string> = {
  live: (id) => `https://www.chess.com/callback/live/game/${id}`,
  daily: (id) => `https://www.chess.com/callback/daily/game/${id}`,
  computer: (id) => `https://www.chess.com/computer/callback/game/${id}`,
}
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, 'cache-control': 'no-store' },
  })
}
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
    if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' })
    const url = new URL(request.url)
    const kind = url.searchParams.get('kind') ?? ''
    const id = url.searchParams.get('id') ?? ''
    if (!Object.hasOwn(UPSTREAM, kind) || !/^[1-9]\d{0,14}$/.test(id)) {
      return json(400, { error: 'bad_request', message: 'kind must be live|daily|computer and id numeric' })
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    let r: Response
    try {
      r = await fetch(UPSTREAM[kind](id), {
        headers: { accept: 'application/json', 'user-agent': UA },
        redirect: 'manual',
        signal: ctrl.signal,
      })
    } catch (e) {
      clearTimeout(timer)
      const timeout = (e as Error).name === 'AbortError'
      return json(timeout ? 504 : 502, { error: timeout ? 'upstream_timeout' : 'upstream_unreachable' })
    }
    clearTimeout(timer)
    const ctype = r.headers.get('content-type') ?? ''
    const isJson = ctype.includes('application/json')
    const text = await r.text()
    if (r.status === 200 && isJson) {
      let finished: boolean
      try {
        finished = JSON.parse(text)?.game?.isFinished === true
      } catch {
        finished = false
      }
      return new Response(text, {
        status: 200,
        headers: { ...JSON_HEADERS, 'cache-control': finished ? 'public, s-maxage=86400' : 'no-store' },
      })
    }
    if ((r.status === 404 || r.status === 429) && isJson) {
      return new Response(text, {
        status: r.status,
        headers: { ...JSON_HEADERS, 'cache-control': 'no-store' },
      })
    }
    if (r.status === 403 || r.headers.get('cf-mitigated') || !isJson) {
      return json(503, {
        error: 'upstream_blocked',
        upstreamStatus: r.status,
        cfMitigated: r.headers.get('cf-mitigated'),
      })
    }
    return json(502, { error: 'upstream_error', upstreamStatus: r.status })
  },
}
