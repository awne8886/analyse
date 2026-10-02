// window.__ANALYSE_ENGINE_STATS__ (DoD item 9): the pool's counters, zeros while no pool exists.
import type { EngineApi } from '../types/engine'

declare global {
  interface Window {
    __ANALYSE_ENGINE_STATS__?: () => { workersCreated: number; uciSent: number }
  }
}

let current: EngineApi | null = null

export function setStatsSource(pool: EngineApi | null): void {
  current = pool
}

export function installEngineStats(): void {
  window.__ANALYSE_ENGINE_STATS__ = () => ({
    workersCreated: current?.stats.workersCreated ?? 0,
    uciSent: current?.stats.uciSent ?? 0,
  })
}
