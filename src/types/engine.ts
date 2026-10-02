// Shared contracts (PROMPT.md Appendix B.0). Frozen after Phase 0: implementers never edit this file.
export type Score = { type: 'cp' | 'mate'; value: number } // White's perspective after normalisation
export interface EngineLine {
  multipv: number
  depth: number
  score: Score
  pv: string[] // pv in UCI
}
export interface PositionEval {
  fen: string
  lines: EngineLine[]
  depth: number
  multiPv: 1 | 2
  bestmove: string | null
  terminal?: 'checkmate' | 'stalemate' | 'draw'
  notAnalysed?: boolean
}
export interface SearchLimits {
  depth: number
  movetimeMs: number
  multiPv: 1 | 2
}
export type ProfileName = 'auto' | 'standard' | 'deep'
export type Tier = 'auto-18' | 'auto-16' | 'fast-14' | 'standard-16' | 'deep-20'
export interface DeviceProfile {
  isIOS: boolean
  isIPad: boolean
  isAndroid: boolean
  isMobile: boolean
  isTablet: boolean
  isWebKit: boolean
  lowMem: boolean
  hc: number
  simd: boolean
  coi: boolean
  pthreads: boolean
  build: 'lite-single' | 'lite' // build = pthreads ? 'lite' : 'lite-single'
  workers: number
  threads: number
  hashMb: number
  multiPv: 1 | 2
}
export interface EngineProfile {
  build: 'lite-single' | 'lite'
  workers: number
  threads: number
  hashMb: number
  multiPv: 1 | 2
  limits: SearchLimits
  tier: Tier
}
// implemented by src/engine/pool.ts and src/engine/mock/MockEngine.ts
export interface EngineApi {
  init(profile: EngineProfile): Promise<void>
  evaluate(fen: string, limits: SearchLimits, jobId: number): Promise<PositionEval>
  stop(): Promise<void>
  dispose(): void
  // read by the e2e test of DoD item 9 through window.__ANALYSE_ENGINE_STATS__ (src/state/)
  readonly stats: { workersCreated: number; uciSent: number }
}
