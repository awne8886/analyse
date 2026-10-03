// UCI wrapper around one Stockfish 19 lite worker (PROMPT.md Appendix C.1 sketch with its required modifications).
// Scores here are side-to-move as UCI reports them; the pool converts them to White's perspective exactly once.
import { REVIEW_CONFIG } from '../analysis'
import type { Score } from '../types/engine'

/** One parsed `info` line; scores are side-to-move as UCI reports them. */
export interface PvLine {
  multipv: number
  depth: number
  seldepth?: number
  score: Score
  pv: string[]
  nodes?: number
  nps?: number
  time?: number
  bound?: 'upper' | 'lower'
  wdl?: [number, number, number]
}
export interface AnalysisResult {
  lines: PvLine[]
  bestmove: string | null
  depth: number
  terminal?: 'checkmate' | 'stalemate'
}
/** Counters shared with the pool (B.0 `EngineApi.stats`). */
export interface EngineCounters {
  workersCreated: number
  uciSent: number
}
export interface EngineHooks {
  counters: EngineCounters
  /** Download progress of the .wasm, 0 to 1 (C.1 item 9). */
  onDownloadProgress?: (percent: number) => void
}

export type Variant = 'multi' | 'single'
// Directory and file names are separate literals joined at runtime (R11 build-output greps).
const FILES: Record<Variant, string> = {
  multi: 'stockfish-19-lite.js',
  single: 'stockfish-19-lite-single.js',
}
const BASE = `${import.meta.env.BASE_URL}engine/sf19/` // files live in public/engine/sf19/
export const VARIANT_STORAGE_KEY = 'analyse:engineVariant'

export function parseInfo(line: string): PvLine | null {
  if (!line.startsWith('info ') || line.includes(' string ')) return null
  const t = line.split(' ')
  const out: Partial<PvLine> = { multipv: 1 }
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        out.depth = +t[++i]
        break
      case 'seldepth':
        out.seldepth = +t[++i]
        break
      case 'multipv':
        out.multipv = +t[++i]
        break
      case 'nodes':
        out.nodes = +t[++i]
        break
      case 'nps':
        out.nps = +t[++i]
        break
      case 'time':
        out.time = +t[++i]
        break
      case 'score': {
        const type = t[++i] as 'cp' | 'mate'
        const value = +t[++i]
        out.score = { type, value }
        if (t[i + 1] === 'upperbound') {
          out.bound = 'upper'
          i++
        } else if (t[i + 1] === 'lowerbound') {
          out.bound = 'lower'
          i++
        }
        break
      }
      case 'wdl':
        out.wdl = [+t[++i], +t[++i], +t[++i]]
        break
      case 'pv':
        out.pv = t.slice(i + 1)
        i = t.length
        break
    }
  }
  if (out.depth === undefined || !out.score) return null
  return { ...out, pv: out.pv ?? [] } as PvLine
}

/** Side-to-move score to White's perspective (R17). Called exactly once per score, in pool.ts. */
export const toWhite = (s: Score, stm: 'w' | 'b'): Score =>
  stm === 'w' ? { type: s.type, value: s.value } : { type: s.type, value: -s.value }

function readStoredVariant(): string | null {
  try {
    return localStorage.getItem(VARIANT_STORAGE_KEY)
  } catch {
    return null
  }
}

export class Engine {
  private readonly w: Worker
  readonly variant: Variant
  private readonly hooks: EngineHooks
  private readonly listeners = new Set<(l: string) => void>()
  private readonly failers = new Set<(e: Error) => void>()
  private busy = false
  private dead: Error | null = null
  private multiPv = 0

  private constructor(w: Worker, variant: Variant, hooks: EngineHooks) {
    this.w = w
    this.variant = variant
    this.hooks = hooks
    w.onmessage = (e: MessageEvent) => {
      if (typeof e.data === 'string') for (const cb of [...this.listeners]) cb(e.data)
    }
    // Mid-analysis worker death (e.g. "RuntimeError: memory access out of bounds"): fail every pending wait.
    w.onerror = (e: ErrorEvent) => {
      e.preventDefault?.()
      this.fail(new Error(`${variant}: worker error ${e.message ?? ''}`))
    }
  }

  /** Variant order of R12 / C.1 item 2: multi first only for the pthreads build, unless it failed before. */
  static variantOrder(build: 'lite' | 'lite-single'): Variant[] {
    return build === 'lite' && readStoredVariant() !== 'single' ? ['multi', 'single'] : ['single']
  }

  static async create(order: Variant[], hooks: EngineHooks): Promise<Engine> {
    let lastErr: unknown
    for (const v of order) {
      try {
        return await Engine.boot(v, hooks)
      } catch (e) {
        lastErr = e
        console.warn(`[stockfish] ${v} failed:`, e)
        if (v === 'multi') {
          try {
            localStorage.setItem(VARIANT_STORAGE_KEY, 'single') // fall back once and remember it
          } catch {
            /* storage unavailable: fall back for this session only */
          }
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }

  private static boot(variant: Variant, hooks: EngineHooks): Promise<Engine> {
    const timeoutMs = REVIEW_CONFIG.engineTimeouts.bootMs
    return new Promise((resolve, reject) => {
      const w = new Worker(BASE + FILES[variant]) // classic worker on purpose; do NOT pass {type:'module'}
      hooks.counters.workersCreated++
      let port: MessagePort | null = null
      const closePort = () => {
        port?.close()
        port = null
      }
      const timer = setTimeout(() => {
        closePort()
        w.terminate()
        reject(new Error(`${variant}: no uciok within ${timeoutMs}ms`))
      }, timeoutMs)
      w.onerror = (e: ErrorEvent) => {
        clearTimeout(timer)
        closePort()
        w.terminate()
        reject(new Error(`${variant}: worker error ${e.message ?? ''}`)) // e.g. "SharedArrayBuffer is not defined", MIME errors
      }
      w.onmessage = (e: MessageEvent) => {
        if (e.data === 'uciok') {
          clearTimeout(timer)
          resolve(new Engine(w, variant, hooks))
        }
      }
      w.postMessage('uci')
      hooks.counters.uciSent++
      const onProgress = hooks.onDownloadProgress
      if (onProgress && typeof MessageChannel !== 'undefined') {
        w.postMessage('setoption name CanOutputEngineDownloadProgress')
        hooks.counters.uciSent++
        const channel = new MessageChannel()
        port = channel.port1
        port.onmessage = (e: MessageEvent) => {
          const percent = (e.data as { percent?: unknown } | null)?.percent
          if (typeof percent !== 'number') return
          onProgress(percent)
          if (percent >= 1) closePort()
        }
        w.postMessage({ progressPort: channel.port2 }, [channel.port2])
      }
    })
  }

  send(cmd: string): void {
    if (this.dead) return
    this.w.postMessage(cmd)
    this.hooks.counters.uciSent++
  }

  /** Subscribe to every output line (the pool's watchdog); returns the unsubscribe function. */
  listen(cb: (l: string) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private waitFor(
    pred: (l: string) => boolean,
    onLine?: (l: string) => void,
    timeoutMs = 120000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.dead) {
        reject(this.dead)
        return
      }
      const done = () => {
        clearTimeout(timer)
        this.listeners.delete(cb)
        this.failers.delete(fail)
      }
      const fail = (e: Error) => {
        done()
        reject(e)
      }
      const timer = setTimeout(() => fail(new Error('engine timeout')), timeoutMs)
      const cb = (l: string) => {
        onLine?.(l)
        if (pred(l)) {
          done()
          resolve(l)
        }
      }
      this.listeners.add(cb)
      this.failers.add(fail)
    })
  }

  async isready(): Promise<void> {
    this.send('isready')
    await this.waitFor((l) => l === 'readyok')
  }

  /** Once per game, never per position (C.1 item 5): Threads (multi only), Hash, MultiPV, ucinewgame, isready. */
  async newGame(o: { threads?: number; hash?: number; multipv?: number }): Promise<void> {
    if (this.variant === 'multi' && o.threads) this.send(`setoption name Threads value ${o.threads}`)
    this.send(`setoption name Hash value ${o.hash ?? 32}`)
    this.multiPv = o.multipv ?? 2
    this.send(`setoption name MultiPV value ${this.multiPv}`)
    this.send('ucinewgame')
    await this.isready()
  }

  /** One position. Serialised: never call while busy. Depth target + movetime in one command (R14, issue #124).
   *  `multiPv` differing from the current option (phone re-search) is set between searches, after `bestmove`. */
  async analyse(fen: string, o: { depth: number; maxMs: number; multiPv?: number }): Promise<AnalysisResult> {
    if (this.dead) throw this.dead
    if (this.busy) throw new Error('engine busy')
    this.busy = true
    const best = new Map<number, PvLine>()
    let depth = 0
    let terminal: AnalysisResult['terminal']
    if (o.multiPv !== undefined && o.multiPv !== this.multiPv) {
      this.multiPv = o.multiPv
      this.send(`setoption name MultiPV value ${o.multiPv}`)
    }
    this.send(`position fen ${fen}`)
    this.send(`go depth ${o.depth} movetime ${o.maxMs}`)
    const stopTimer = setTimeout(() => this.send('stop'), o.maxMs + 2000)
    try {
      const bm = await this.waitFor(
        (l) => l.startsWith('bestmove'),
        (l) => {
          const p = parseInfo(l)
          if (!p) return
          if (p.depth === 0) {
            terminal = p.score.type === 'mate' ? 'checkmate' : 'stalemate'
            return
          }
          if (p.bound || p.pv.length === 0) return // ignore fail-high/low and incomplete lines
          if (p.depth >= (best.get(p.multipv)?.depth ?? 0)) {
            best.set(p.multipv, p)
            depth = Math.max(depth, p.depth)
          }
        },
        o.maxMs + 10000,
      )
      const mv = bm.split(' ')[1]
      const bestmove = mv && mv !== '(none)' ? mv : null
      return {
        lines: [...best.values()].sort((a, b) => a.multipv - b.multipv),
        bestmove,
        depth,
        // depth-0 line plus `bestmove (none)` (C.1 item 7)
        terminal: bestmove === null ? terminal : undefined,
      }
    } finally {
      clearTimeout(stopTimer)
      this.busy = false
    }
  }

  /** Calibration search (C.4): the only plain `go depth` ever sent, and only on startpos. Returns the nps of the
   *  last complete `info` line. */
  async measureNps(depth: number): Promise<number> {
    if (this.dead) throw this.dead
    if (this.busy) throw new Error('engine busy')
    this.busy = true
    let nps = 0
    this.send('position startpos')
    this.send(`go depth ${depth}`)
    try {
      await this.waitFor(
        (l) => l.startsWith('bestmove'),
        (l) => {
          const p = parseInfo(l)
          if (p?.nps !== undefined) nps = p.nps
        },
      )
      return nps
    } finally {
      this.busy = false
    }
  }

  stop(): void {
    if (this.busy) this.send('stop')
  }

  private fail(e: Error): void {
    if (this.dead) return
    this.dead = e
    for (const f of [...this.failers]) f(e)
  }

  /** Kills the worker; every pending wait rejects with `reason`. */
  terminate(reason = 'engine terminated'): void {
    try {
      this.send('quit')
    } catch {
      /* worker already gone */
    }
    this.fail(new Error(reason))
    this.w.terminate()
  }
}
