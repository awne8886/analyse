// Phase 0b RED tests: R14 / Appendix C.4 calibration tiers. All fail with "not implemented" against the stubs.
import { describe, expect, it } from 'vitest'
import { tierForNps } from './index'

describe('tierForNps (R14, C.4)', () => {
  it('maps the three R14 sample speeds to the three tiers', () => {
    expect(tierForNps(650_000)).toBe('auto-18')
    expect(tierForNps(450_000)).toBe('auto-16')
    expect(tierForNps(250_000)).toBe('fast-14')
  })

  it('600,000 nps and above is auto-18; 599,999 is auto-16', () => {
    expect(tierForNps(600_000)).toBe('auto-18')
    expect(tierForNps(599_999)).toBe('auto-16')
    expect(tierForNps(1_500_000)).toBe('auto-18')
  })

  it('300,000 to 599,999 nps is auto-16; 299,999 is fast-14', () => {
    expect(tierForNps(300_000)).toBe('auto-16')
    expect(tierForNps(299_999)).toBe('fast-14')
  })

  it('very slow or zero speeds are fast-14', () => {
    expect(tierForNps(0)).toBe('fast-14')
    expect(tierForNps(18_000)).toBe('fast-14')
  })
})
