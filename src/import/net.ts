// Network etiquette shared by the import paths: one upstream request at a time per provider (section 3.3), and
// waits that tests can fake (setTimeout) or replace (ImportOptions.wait).

export interface Waits {
  wait: (ms: number) => Promise<void>
  onStatus?: (key: string, message: string) => void
}

export const timerWait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const queues = new Map<string, Promise<unknown>>()

/** Runs `request` after every earlier request to the same provider has settled (never two in flight). */
export function serial<T>(provider: string, request: () => Promise<T>): Promise<T> {
  const previous = queues.get(provider) ?? Promise.resolve()
  const run = previous.then(request, request)
  queues.set(
    provider,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}

/** The response's body as JSON when its content-type says JSON; undefined for anything else. */
export async function jsonBody(res: Response): Promise<unknown> {
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) return undefined
  try {
    return JSON.parse(await res.text()) as unknown
  } catch {
    return undefined
  }
}
