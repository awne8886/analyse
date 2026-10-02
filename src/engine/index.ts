// Public entry point of src/engine (PROMPT.md section 4.5). Phase 0 stub: bodies throw until impl-engine lands.
import type { DeviceProfile, EngineApi, EngineProfile, Score, Tier } from '../types/engine'

/** One parsed `info` line (Appendix C.1); scores are side-to-move as UCI reports them. */
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
/** Inputs of deviceProfile(); every field defaults to the browser global (navigator, self, WebAssembly). */
export interface DeviceEnv {
  userAgent?: string
  maxTouchPoints?: number
  hardwareConcurrency?: number
  deviceMemory?: number
  userAgentDataMobile?: boolean
  crossOriginIsolated?: boolean
  sharedArrayBuffer?: boolean
  simd?: boolean
}

const notImplemented = (..._args: unknown[]): never => {
  void _args
  throw new Error('not implemented')
}

export function deviceProfile(env?: DeviceEnv): DeviceProfile | null {
  return notImplemented(env)
}
export function createEnginePool(profile: EngineProfile): EngineApi {
  return notImplemented(profile)
}
export function calibrate(pool: EngineApi): Promise<Tier> {
  return notImplemented(pool)
}
/** nps -> tier per Appendix C.4: >= 600,000 auto-18; >= 300,000 auto-16; else fast-14. */
export function tierForNps(nps: number): Tier {
  return notImplemented(nps)
}
export function parseInfo(line: string): PvLine | null {
  return notImplemented(line)
}
export function toWhite(s: Score, stm: 'w' | 'b'): Score {
  return notImplemented(s, stm)
}
/** Keyed 'E-1' ... 'E-10' and 'E-8b' (Appendix F.3). E-7 is needed by src/main.tsx before anything else. */
export const ENGINE_STRINGS: Record<string, string> = { 'E-7': 'Enabling multi-core analysis…' }
