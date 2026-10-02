// Engine pool (PROMPT.md Appendix C.1 item 8, section 3.4, R16, R17): N Engine workers, a main-pass FIFO dealt
// round-robin to idle workers, a priority lane for MultiPV 2 requests, job ids and cancel, the 10 s watchdog
// (terminate, respawn, retry once at depth 12, then `notAnalysed`), the evalKey cache, progress/ETA and stats.
// Scores leave this file in White's perspective (toWhite, exactly once, here).
import { REVIEW_CONFIG } from '../analysis'
import type { EngineApi, EngineProfile, PositionEval, SearchLimits } from '../types/engine'
import { Engine, toWhite, type AnalysisResult, type EngineCounters } from './Engine'

export type EngineStatus =
  | { phase: 'loading'; percent: number | null }
  | { phase: 'ready'; build: 'lite-single' | 'lite'; threads: number }
  | { phase: 'error'; key: 'E-2'; message: string }
export interface EnginePoolOptions {
  onStatus?: (s: EngineStatus) => void
}
export interface EngineProgress {
  queued: number
  inFlight: number
  /** Positions searched by a worker (cache hits excluded). */
  completed: number
  cacheHits: number
  /** Running mean wall-clock time per searched position, null before the first one. */
  meanMs: number | null
  /** Live workers. */
  workers: number
}
export type EnginePool = EngineApi & {
  measureNps(): Promise<number>
  progress(): EngineProgress
  /** remaining positions x running mean per-position time / active workers (section 3.4); null before data. */
  etaMs(remainingPositions: number): number | null
}

/** The one builder of the cache / mock-table / recorded-eval key: `fen4|depth|multipv`. */
export function evalKey(fen: string, limits: Pick<SearchLimits, 'depth' | 'multiPv'>): string {
  return fen.split(' ').slice(0, 4).join(' ') + '|' + limits.depth + '|' + limits.multiPv
}

/** Rejection of a request that was cancelled by `stop()`, `dispose()` or a newer job id. */
export function cancelledError(message: string): Error {
  const e = new Error(message)
  e.name = 'AbortError'
  return e
}

interface Request {
  kind: 'eval' | 'nps'
  fen: string
  limits: SearchLimits
  jobId: number
  attempts: number
  cancelled: boolean
  resolve(v: PositionEval | number): void
  reject(e: Error): void
}
interface Slot {
  engine: Engine | null
  busy: boolean
  newGamePending: boolean
  current: Request | null
  running: Promise<void> | null
}

const stmOf = (fen: string): 'w' | 'b' => (fen.split(' ')[1] === 'b' ? 'b' : 'w')
const buildOf = (e: Engine): 'lite' | 'lite-single' => (e.variant === 'multi' ? 'lite' : 'lite-single')

class Pool implements EnginePool {
  private profile: EngineProfile
  private readonly onStatus: (s: EngineStatus) => void
  private readonly hasStatusListener: boolean
  private readonly counters: EngineCounters = { workersCreated: 0, uciSent: 0 }
  private readonly cache = new Map<string, PositionEval>()
  private slots: Slot[] = []
  private priority: Request[] = []
  private fifo: Request[] = []
  private booting: Promise<void> | null = null
  private disposed = false
  private currentJobId = Number.NEGATIVE_INFINITY
  private rr = 0
  private completed = 0
  private cacheHits = 0
  private totalMs = 0

  constructor(profile: EngineProfile, opts: EnginePoolOptions) {
    this.profile = profile
    this.onStatus = opts.onStatus ?? (() => undefined)
    this.hasStatusListener = opts.onStatus !== undefined
  }

  get stats(): { workersCreated: number; uciSent: number } {
    return { ...this.counters }
  }

  /** Boots the workers (nothing exists before the first call). A later call with the same build and worker count
   *  keeps the workers and re-sends the per-game options before their next search. */
  async init(profile: EngineProfile): Promise<void> {
    if (this.disposed) throw new Error('engine pool disposed')
    if (this.booting) await this.booting.catch(() => undefined)
    const prev = this.profile
    this.profile = profile
    const live = this.slots.filter((s) => s.engine)
    if (live.length && prev.build === profile.build && prev.workers === profile.workers) {
      for (const s of this.slots) s.newGamePending = true
      this.pump()
      return
    }
    if (this.slots.length) {
      await this.stop()
      for (const s of this.slots) s.engine?.terminate()
      this.slots = []
    }
    this.booting = this.boot(profile)
    try {
      await this.booting
    } finally {
      this.booting = null
    }
  }

  private spawn(profile: EngineProfile, withProgress: boolean): Promise<Engine> {
    const onDownloadProgress =
      withProgress && this.hasStatusListener
        ? (percent: number) => this.onStatus({ phase: 'loading', percent })
        : undefined
    return Engine.create(Engine.variantOrder(profile.build), {
      counters: this.counters,
      onDownloadProgress,
    }).then(async (engine) => {
      try {
        await engine.newGame({ threads: profile.threads, hash: profile.hashMb, multipv: profile.multiPv })
        return engine
      } catch (e) {
        engine.terminate()
        throw e
      }
    })
  }

  private async boot(profile: EngineProfile): Promise<void> {
    this.onStatus({ phase: 'loading', percent: null })
    const n = Math.max(1, profile.workers)
    const results = await Promise.allSettled(
      Array.from({ length: n }, (_, i) => this.spawn(profile, i === 0)),
    )
    const engines = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    if (this.disposed) {
      for (const e of engines) e.terminate()
      throw new Error('engine pool disposed')
    }
    if (!engines.length) {
      const failure = results.find((r) => r.status === 'rejected')
      const reason: unknown = failure?.status === 'rejected' ? failure.reason : undefined
      const message = reason instanceof Error ? reason.message : String(reason)
      this.onStatus({ phase: 'error', key: 'E-2', message })
      throw new Error(message)
    }
    this.slots = engines.map((engine) => ({
      engine,
      busy: false,
      newGamePending: false,
      current: null,
      running: null,
    }))
    const first = engines[0]
    this.onStatus({
      phase: 'ready',
      build: buildOf(first),
      threads: first.variant === 'multi' ? profile.threads : 1,
    })
    this.pump()
  }

  evaluate(fen: string, limits: SearchLimits, jobId: number): Promise<PositionEval> {
    if (this.disposed) return Promise.reject(new Error('engine pool disposed'))
    if (jobId < this.currentJobId) return Promise.reject(cancelledError(`engine: stale job ${jobId}`))
    if (jobId > this.currentJobId) {
      this.currentJobId = jobId
      void this.cancel((r) => r.kind === 'eval' && r.jobId < jobId, `engine: job superseded by ${jobId}`)
    }
    const hit = this.cache.get(evalKey(fen, limits))
    if (hit) {
      this.cacheHits++
      return Promise.resolve({ ...hit, fen })
    }
    return new Promise<PositionEval>((resolve, reject) => {
      const req: Request = {
        kind: 'eval',
        fen,
        limits,
        jobId,
        attempts: 0,
        cancelled: false,
        resolve: (v) => resolve(v as PositionEval),
        reject,
      }
      // MultiPV 2 requests (the phone re-search of candidate plies) run ahead of the main-pass FIFO (section 3.4)
      if (limits.multiPv === 2) this.priority.push(req)
      else this.fifo.push(req)
      this.pump()
    })
  }

  /** Calibration search on the first free worker (C.4, PLAN Assumption 15). */
  measureNps(): Promise<number> {
    if (this.disposed) return Promise.reject(new Error('engine pool disposed'))
    return new Promise<number>((resolve, reject) => {
      this.priority.unshift({
        kind: 'nps',
        fen: 'startpos',
        limits: { depth: REVIEW_CONFIG.calibration.depth, movetimeMs: 0, multiPv: this.profile.multiPv },
        jobId: this.currentJobId,
        attempts: 0,
        cancelled: false,
        resolve: (v) => resolve(v as number),
        reject,
      })
      this.pump()
    })
  }

  /** Cancels every queued and running request (`stop`, then wait for each `bestmove`); their promises reject with
   *  an AbortError and late results are dropped. */
  async stop(): Promise<void> {
    await this.cancel(() => true, 'engine: job cancelled')
  }

  private cancel(pred: (r: Request) => boolean, message: string): Promise<void> {
    const keep = (lane: Request[]) =>
      lane.filter((r) => {
        if (!pred(r)) return true
        r.cancelled = true
        r.reject(cancelledError(message))
        return false
      })
    this.priority = keep(this.priority)
    this.fifo = keep(this.fifo)
    const waits: Promise<void>[] = []
    for (const slot of this.slots) {
      const r = slot.current
      if (!r || !pred(r)) continue
      if (!r.cancelled) {
        r.cancelled = true
        r.reject(cancelledError(message))
      }
      slot.engine?.stop()
      if (slot.running) waits.push(slot.running)
    }
    return Promise.all(waits).then(() => undefined)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    void this.cancel(() => true, 'engine pool disposed')
    for (const s of this.slots) s.engine?.terminate('engine pool disposed')
    this.slots = []
    this.cache.clear()
  }

  progress(): EngineProgress {
    return {
      queued: this.priority.length + this.fifo.length,
      inFlight: this.slots.filter((s) => s.current).length,
      completed: this.completed,
      cacheHits: this.cacheHits,
      meanMs: this.completed ? this.totalMs / this.completed : null,
      workers: this.slots.filter((s) => s.engine).length,
    }
  }

  etaMs(remainingPositions: number): number | null {
    const { meanMs, workers } = this.progress()
    if (meanMs === null) return null
    return (Math.max(0, remainingPositions) * meanMs) / Math.max(1, workers)
  }

  /** Deals the next requests to idle workers, round-robin; the cache is checked before every dispatch. */
  private pump(): void {
    if (this.disposed) return
    const n = this.slots.length
    for (let k = 0; k < n; k++) {
      const i = (this.rr + k) % n
      const slot = this.slots[i]
      if (!slot.engine || slot.busy) continue
      const req = this.next()
      if (!req) return
      this.rr = (i + 1) % n
      slot.busy = true
      slot.current = req
      slot.running = this.run(slot, req).finally(() => {
        slot.current = null
        slot.running = null
        slot.busy = false
        this.pump()
      })
    }
  }

  private next(): Request | undefined {
    for (;;) {
      const req = this.priority.shift() ?? this.fifo.shift()
      if (!req) return undefined
      const hit = req.kind === 'eval' ? this.cache.get(evalKey(req.fen, req.limits)) : undefined
      if (!hit) return req
      this.cacheHits++
      req.resolve({ ...hit, fen: req.fen })
    }
  }

  /** One search under the watchdog: no `info` or `bestmove` line for watchdogMs terminates the worker. */
  private async attempt(slot: Slot, req: Request, limits: SearchLimits): Promise<AnalysisResult | number> {
    const engine = slot.engine
    if (!engine) throw new Error('engine: no worker')
    const watchdogMs = REVIEW_CONFIG.engineTimeouts.watchdogMs
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(
        () => engine.terminate(`watchdog: no engine output for ${watchdogMs} ms`),
        watchdogMs,
      )
    }
    const unlisten = engine.listen((l) => {
      if (l.startsWith('info') || l.startsWith('bestmove')) arm()
    })
    arm()
    try {
      if (slot.newGamePending) {
        slot.newGamePending = false
        const p = this.profile
        await engine.newGame({ threads: p.threads, hash: p.hashMb, multipv: p.multiPv })
      }
      if (req.kind === 'nps') return await engine.measureNps(limits.depth)
      return await engine.analyse(req.fen, {
        depth: limits.depth,
        maxMs: limits.movetimeMs,
        multiPv: limits.multiPv,
      })
    } finally {
      clearTimeout(timer)
      unlisten()
    }
  }

  private async run(slot: Slot, req: Request): Promise<void> {
    // the retry after a watchdog or worker failure runs once, at depth 12 (R16)
    const limits =
      req.attempts === 0 ? req.limits : { ...req.limits, depth: REVIEW_CONFIG.engineTimeouts.retryDepth }
    const started = Date.now()
    let result: AnalysisResult | number
    try {
      result = await this.attempt(slot, req, limits)
    } catch (err) {
      if (this.disposed) {
        req.reject(err instanceof Error ? err : new Error(String(err)))
        return
      }
      const fatal = await this.respawn(slot)
      if (req.cancelled) return
      if (fatal) {
        req.reject(fatal)
        return
      }
      if (req.kind === 'nps') {
        req.reject(err instanceof Error ? err : new Error(String(err)))
        return
      }
      req.attempts++
      if (req.attempts >= 2) {
        req.resolve({
          fen: req.fen,
          lines: [],
          depth: 0,
          multiPv: req.limits.multiPv,
          bestmove: null,
          notAnalysed: true,
        })
        return
      }
      this.priority.unshift(req) // retry next, ahead of everything else
      return
    }
    if (req.cancelled) return // stale result of a stopped search: dropped
    if (typeof result === 'number') {
      req.resolve(result)
      return
    }
    this.completed++
    this.totalMs += Date.now() - started
    const stm = stmOf(req.fen)
    const multiPv = req.limits.multiPv
    const evaluation: PositionEval = result.terminal
      ? { fen: req.fen, lines: [], depth: 0, multiPv, bestmove: null, terminal: result.terminal }
      : {
          fen: req.fen,
          lines: result.lines
            .filter((l) => l.multipv <= multiPv)
            .map((l) => ({ multipv: l.multipv, depth: l.depth, score: toWhite(l.score, stm), pv: l.pv })),
          depth: result.depth,
          multiPv,
          bestmove: result.bestmove,
        }
    if (evaluation.terminal || evaluation.lines.length) this.cache.set(evalKey(req.fen, limits), evaluation)
    req.resolve(evaluation)
  }

  /** Replaces a failed worker. When no worker is left, every queued request fails with the E-2 status and the
   *  error is returned for the request in hand. */
  private async respawn(slot: Slot): Promise<Error | null> {
    slot.engine?.terminate()
    slot.engine = null
    try {
      const engine = await this.spawn(this.profile, false)
      if (this.disposed) engine.terminate()
      else slot.engine = engine
      return null
    } catch (err) {
      if (this.disposed) return null
      this.slots = this.slots.filter((s) => s !== slot)
      if (this.slots.some((s) => s.engine || s.busy)) return null
      const fatal = new Error(err instanceof Error ? err.message : String(err))
      this.onStatus({ phase: 'error', key: 'E-2', message: fatal.message })
      for (const r of [...this.priority, ...this.fifo]) r.reject(fatal)
      this.priority = []
      this.fifo = []
      return fatal
    }
  }
}

export function createRealEnginePool(profile: EngineProfile, opts: EnginePoolOptions = {}): EnginePool {
  return new Pool(profile, opts)
}
