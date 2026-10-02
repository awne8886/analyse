// Deterministic engine for unit and e2e tests (docs/notes/contracts.md section 1). It answers from a table keyed
// `fen4|depth|multipv` handed to its constructor; it never imports fixture files and never creates a Worker.
import type { EngineApi, EngineProfile, PositionEval, SearchLimits } from '../../types/engine'
import { evalKey, type EnginePoolOptions } from '../pool'

declare global {
  interface Window {
    __USE_MOCK_ENGINE__?: boolean
    __MOCK_EVALS__?: Record<string, PositionEval>
  }
}

export class MockEngine implements EngineApi {
  private readonly table: Record<string, PositionEval>
  private readonly onStatus: EnginePoolOptions['onStatus']
  readonly stats = { workersCreated: 0, uciSent: 0 }

  constructor(table: Record<string, PositionEval>, opts: EnginePoolOptions = {}) {
    this.table = table
    this.onStatus = opts.onStatus
  }

  async init(profile: EngineProfile): Promise<void> {
    await Promise.resolve()
    this.onStatus?.({ phase: 'ready', build: profile.build, threads: profile.threads })
  }

  /** Exact key; else any entry for the same fen4 (multipv 2 preferred), lines truncated to the requested
   *  multiPv; else a rejection naming the key. */
  async evaluate(fen: string, limits: SearchLimits, jobId: number): Promise<PositionEval> {
    void jobId
    await Promise.resolve()
    const key = evalKey(fen, limits)
    const exact = this.table[key]
    if (exact) return { ...exact, fen }
    const prefix = key.slice(0, key.indexOf('|') + 1)
    const candidates = Object.keys(this.table).filter((k) => k.startsWith(prefix))
    const chosen = candidates.find((k) => k.endsWith('|2')) ?? candidates[0]
    if (chosen === undefined) throw new Error(`mock engine: no eval for ${key}`)
    const entry = this.table[chosen]
    return { ...entry, fen, lines: entry.lines.slice(0, limits.multiPv), multiPv: limits.multiPv }
  }

  async stop(): Promise<void> {
    await Promise.resolve()
  }

  dispose(): void {}

  async measureNps(): Promise<number> {
    await Promise.resolve()
    return 1_000_000
  }
}
