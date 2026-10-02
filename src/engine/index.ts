// Public entry point of src/engine (PROMPT.md section 4.5). Importing it creates nothing: no worker, no pool.
import type { EngineApi, EngineProfile } from '../types/engine'
import { MockEngine } from './mock/MockEngine'
import { createRealEnginePool, type EnginePool, type EnginePoolOptions } from './pool'

/** What createEnginePool returns (docs/notes/contracts.md section 1); progress/ETA exist on the real pool only. */
export type EngineHandle = EngineApi & { measureNps(): Promise<number> } & Partial<
    Pick<EnginePool, 'progress' | 'etaMs'>
  >

export { deviceProfile, type DeviceEnv } from './deviceProfile'
export { parseInfo, toWhite, type PvLine } from './Engine'
export { calibrate, tierForNps, TIER_STORAGE_KEY } from './calibrate'
export {
  evalKey,
  type EnginePool,
  type EnginePoolOptions,
  type EngineProgress,
  type EngineStatus,
} from './pool'
export { ENGINE_STRINGS } from './errors'
export { MockEngine } from './mock/MockEngine'

/** The engine pool of C.1 item 8, lazily booted by `init`; the mock engine when `window.__USE_MOCK_ENGINE__`. */
export function createEnginePool(profile: EngineProfile, opts: EnginePoolOptions = {}): EngineHandle {
  if (typeof window !== 'undefined' && window.__USE_MOCK_ENGINE__ === true) {
    return new MockEngine(window.__MOCK_EVALS__ ?? {}, opts)
  }
  return createRealEnginePool(profile, opts)
}
