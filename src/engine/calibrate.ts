// Speed calibration (PROMPT.md R14, Appendix C.4, PLAN Assumption 15).
import { REVIEW_CONFIG } from '../analysis'
import type { EngineApi, Tier } from '../types/engine'

export const TIER_STORAGE_KEY = 'analyse:engineTier'
const DAY_MS = 24 * 60 * 60 * 1000

/** nps -> tier per Appendix C.4: >= 600,000 auto-18; >= 300,000 auto-16; else fast-14. */
export function tierForNps(nps: number): Tier {
  const c = REVIEW_CONFIG.calibration
  if (nps >= c.auto18MinNps) return 'auto-18'
  if (nps >= c.auto16MinNps) return 'auto-16'
  return 'fast-14'
}

export interface StoredTier {
  nps: number
  tier: Tier
  at: number
}

/** The persisted calibration when it is younger than 7 days, else null. */
export function readStoredTier(now = Date.now()): StoredTier | null {
  try {
    const raw = localStorage.getItem(TIER_STORAGE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<StoredTier>
    if (typeof v.nps !== 'number' || typeof v.at !== 'number') return null
    if (now - v.at > REVIEW_CONFIG.calibration.maxAgeDays * DAY_MS || v.at > now) return null
    return { nps: v.nps, tier: tierForNps(v.nps), at: v.at }
  } catch {
    return null
  }
}

/** Returns the calibrated tier: the stored one (reused for 7 days) unless `force` ("Re-test speed"), else a fresh
 *  `position startpos` + `go depth 12` on the pool's first free worker. An EngineApi without `measureNps`
 *  gets the provisional tier `standard-16` and nothing is sent. */
export async function calibrate(
  pool: EngineApi & { measureNps?: () => Promise<number> },
  opts: { force?: boolean } = {},
): Promise<Tier> {
  if (typeof pool.measureNps !== 'function') return 'standard-16'
  if (!opts.force) {
    const stored = readStoredTier()
    if (stored) return stored.tier
  }
  const nps = await pool.measureNps()
  const tier = tierForNps(nps)
  try {
    localStorage.setItem(TIER_STORAGE_KEY, JSON.stringify({ nps, tier, at: Date.now() } satisfies StoredTier))
  } catch {
    /* storage unavailable: the tier holds for this session only */
  }
  return tier
}
