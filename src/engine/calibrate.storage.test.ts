// calibrate(pool): localStorage reuse for 7 days, "Re-test speed" (force), and the provisional tier (C.4, R14).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineApi } from '../types/engine'
import { calibrate, TIER_STORAGE_KEY } from './index'

const DAY = 24 * 60 * 60 * 1000
function fakePool(nps: number) {
  const pool: EngineApi & { measureNps: () => Promise<number> } = {
    init: async () => undefined,
    evaluate: () => Promise.reject(new Error('unused')),
    stop: async () => undefined,
    dispose: () => undefined,
    stats: { workersCreated: 0, uciSent: 0 },
    measureNps: vi.fn(async () => nps),
  }
  return pool
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-02T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('calibrate', () => {
  it('measures, maps with tierForNps and stores { nps, tier, at }', async () => {
    const pool = fakePool(250_000)
    expect(await calibrate(pool)).toBe('fast-14')
    expect(JSON.parse(localStorage.getItem(TIER_STORAGE_KEY) ?? 'null')).toEqual({
      nps: 250_000,
      tier: 'fast-14',
      at: Date.now(),
    })
  })

  it('reuses the stored tier for 7 days without searching, then measures again', async () => {
    await calibrate(fakePool(650_000))
    vi.setSystemTime(Date.now() + 7 * DAY - 1)
    const pool = fakePool(250_000)
    expect(await calibrate(pool)).toBe('auto-18')
    expect(pool.measureNps).not.toHaveBeenCalled()
    vi.setSystemTime(Date.now() + 2)
    expect(await calibrate(pool)).toBe('fast-14')
    expect(pool.measureNps).toHaveBeenCalledTimes(1)
  })

  it('force (Re-test speed) measures even with a fresh stored tier', async () => {
    await calibrate(fakePool(650_000))
    const pool = fakePool(450_000)
    expect(await calibrate(pool, { force: true })).toBe('auto-16')
    expect(pool.measureNps).toHaveBeenCalledTimes(1)
  })

  it('ignores a corrupt stored value', async () => {
    localStorage.setItem(TIER_STORAGE_KEY, '{oops')
    expect(await calibrate(fakePool(450_000))).toBe('auto-16')
  })

  it('an EngineApi without measureNps gets standard-16 and nothing is stored', async () => {
    const { measureNps, ...plain } = fakePool(650_000)
    expect(await calibrate(plain)).toBe('standard-16')
    expect(measureNps).not.toHaveBeenCalled()
    expect(localStorage.getItem(TIER_STORAGE_KEY)).toBeNull()
  })
})
