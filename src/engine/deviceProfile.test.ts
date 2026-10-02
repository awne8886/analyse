// Phase 0b RED tests: R12 / R13 device profiles with recorded user-agent strings.
// Contract: Appendix C.2 (snippet plus its 7 required modifications) and the C.4 table (C.4 is the reference).
// Browser facts are injected through the optional DeviceEnv argument; every test passes simd, crossOriginIsolated
// and sharedArrayBuffer explicitly so nothing depends on the jsdom globals. All fail with "not implemented".
import { describe, expect, it } from 'vitest'
import type { DeviceEnv } from './index'
import { deviceProfile } from './index'

const UA = {
  iPhoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iPhoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/137.0.7151.79 Mobile/15E148 Safari/604.1',
  iPhoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15',
  // iPadOS 13+ Safari requests the desktop site and reports a Macintosh UA; only maxTouchPoints gives it away.
  iPadSafariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  iPadSafariClassic:
    'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  androidChromePhone:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
  androidChromeTablet:
    'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  androidFirefoxPhone: 'Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0',
  desktopChromeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  desktopChromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  desktopEdgeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 Edg/137.0.0.0',
  desktopFirefoxWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
  desktopSafariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
} as const

const ISOLATED = { crossOriginIsolated: true, sharedArrayBuffer: true } as const
const PLAIN = { crossOriginIsolated: false, sharedArrayBuffer: false } as const

function env(userAgent: string, rest: Omit<DeviceEnv, 'userAgent' | 'simd'>): DeviceEnv {
  return { userAgent, simd: true, ...rest }
}

// Expected profile fragments per device class (the C.4 table). Flags are spelled out in each case.
const PHONE = {
  isMobile: true,
  isTablet: false,
  build: 'lite-single',
  pthreads: false,
  workers: 1,
  threads: 1,
  hashMb: 16,
  multiPv: 1,
} as const
const TABLET = {
  isMobile: true,
  isTablet: true,
  build: 'lite-single',
  pthreads: false,
  workers: 1,
  threads: 1,
  hashMb: 32,
  multiPv: 2,
} as const

describe('deviceProfile: phones (every phone: 1 lite-single worker, Hash 16, MultiPV 1)', () => {
  it.each([
    ['not isolated', PLAIN, false],
    ['isolated (pthreads still refused)', ISOLATED, true],
  ])('iPhone Safari, %s', (_n, iso, coi) => {
    const p = deviceProfile(env(UA.iPhoneSafari, { maxTouchPoints: 5, hardwareConcurrency: 4, ...iso }))
    expect(p).toMatchObject({
      ...PHONE,
      isIOS: true,
      isIPad: false,
      isAndroid: false,
      isWebKit: true,
      lowMem: true,
      hc: 4,
      simd: true,
      coi,
    })
  })

  it.each([
    ['not isolated', PLAIN, false],
    ['isolated', ISOLATED, true],
  ])('Chrome on iOS (CriOS) is WebKit and a phone, %s', (_n, iso, coi) => {
    const p = deviceProfile(env(UA.iPhoneChrome, { maxTouchPoints: 5, hardwareConcurrency: 4, ...iso }))
    expect(p).toMatchObject({ ...PHONE, isIOS: true, isIPad: false, isWebKit: true, lowMem: true, coi })
  })

  it('Firefox on iOS (FxiOS) is WebKit and a phone, even when isolated', () => {
    const p = deviceProfile(env(UA.iPhoneFirefox, { maxTouchPoints: 5, hardwareConcurrency: 4, ...ISOLATED }))
    expect(p).toMatchObject({ ...PHONE, isIOS: true, isWebKit: true })
  })

  it.each([
    ['not isolated', PLAIN, false],
    ['isolated (pthreads refused on mobile)', ISOLATED, true],
  ])('Android Chrome phone with deviceMemory 4, hc 8, %s', (_n, iso, coi) => {
    const p = deviceProfile(
      env(UA.androidChromePhone, {
        maxTouchPoints: 5,
        hardwareConcurrency: 8,
        deviceMemory: 4,
        userAgentDataMobile: true,
        ...iso,
      }),
    )
    expect(p).toMatchObject({
      ...PHONE,
      isIOS: false,
      isIPad: false,
      isAndroid: true,
      isWebKit: false,
      lowMem: true,
      hc: 8,
      simd: true,
      coi,
    })
  })

  it('Android phone with an 8-core CPU still gets exactly one worker (no 2-worker branch)', () => {
    const p = deviceProfile(
      env(UA.androidChromePhone, {
        maxTouchPoints: 5,
        hardwareConcurrency: 8,
        deviceMemory: 2,
        userAgentDataMobile: true,
        ...PLAIN,
      }),
    )
    expect(p).toMatchObject({ ...PHONE, hc: 8, lowMem: true })
  })

  it('Android Firefox without deviceMemory counts as low memory and a phone', () => {
    const p = deviceProfile(
      env(UA.androidFirefoxPhone, { maxTouchPoints: 5, hardwareConcurrency: 8, ...PLAIN }),
    )
    expect(p).toMatchObject({ ...PHONE, isAndroid: true, isWebKit: false, lowMem: true })
  })

  it('a UA-CH mobile=true browser that is neither iOS nor Android is a phone', () => {
    const p = deviceProfile(
      env(UA.desktopChromeWin, {
        maxTouchPoints: 5,
        hardwareConcurrency: 8,
        userAgentDataMobile: true,
        ...ISOLATED,
      }),
    )
    expect(p).toMatchObject({ ...PHONE, isIOS: false, isAndroid: false, isWebKit: false })
  })
})

describe('deviceProfile: tablets (1 lite-single worker, Hash 32, MultiPV 2)', () => {
  it.each([
    ['not isolated', PLAIN, false],
    ['isolated (pthreads refused on WebKit)', ISOLATED, true],
  ])('iPad Safari with a Macintosh UA and maxTouchPoints 5, %s', (_n, iso, coi) => {
    const p = deviceProfile(env(UA.iPadSafariMac, { maxTouchPoints: 5, hardwareConcurrency: 8, ...iso }))
    expect(p).toMatchObject({
      ...TABLET,
      isIOS: true,
      isIPad: true,
      isAndroid: false,
      isWebKit: true,
      lowMem: false,
      hc: 8,
      simd: true,
      coi,
    })
  })

  it('iPad Safari with the classic iPad UA is an iPad too', () => {
    const p = deviceProfile(
      env(UA.iPadSafariClassic, { maxTouchPoints: 5, hardwareConcurrency: 6, ...PLAIN }),
    )
    expect(p).toMatchObject({ ...TABLET, isIOS: true, isIPad: true, isWebKit: true, lowMem: false })
  })

  it.each([
    ['not isolated', PLAIN, false],
    ['isolated (pthreads refused on mobile)', ISOLATED, true],
  ])('Android tablet with deviceMemory 8, hc 8, %s: never 2 workers', (_n, iso, coi) => {
    const p = deviceProfile(
      env(UA.androidChromeTablet, {
        maxTouchPoints: 5,
        hardwareConcurrency: 8,
        deviceMemory: 8,
        userAgentDataMobile: false,
        ...iso,
      }),
    )
    expect(p).toMatchObject({
      ...TABLET,
      isIOS: false,
      isIPad: false,
      isAndroid: true,
      isWebKit: false,
      lowMem: false,
      hc: 8,
      simd: true,
      coi,
    })
  })
})

describe('deviceProfile: desktop Chromium and Firefox', () => {
  const DESKTOP_LITE = {
    isMobile: false,
    isTablet: false,
    isWebKit: false,
    build: 'lite-single',
    pthreads: false,
    threads: 1,
    hashMb: 64,
    multiPv: 2,
  } as const
  const DESKTOP_PTHREADS = {
    isMobile: false,
    isTablet: false,
    isWebKit: false,
    build: 'lite',
    pthreads: true,
    workers: 1,
    hashMb: 128,
    multiPv: 2,
  } as const

  it('Chrome, hc 8, not isolated: 4 lite-single workers, Hash 64', () => {
    const p = deviceProfile(
      env(UA.desktopChromeWin, { maxTouchPoints: 0, hardwareConcurrency: 8, deviceMemory: 8, ...PLAIN }),
    )
    expect(p).toMatchObject({
      ...DESKTOP_LITE,
      workers: 4,
      isIOS: false,
      isIPad: false,
      isAndroid: false,
      lowMem: false,
      hc: 8,
      simd: true,
      coi: false,
    })
  })

  it('Chrome, hc 8, isolated: 1 pthreads worker with 7 threads and Hash 128', () => {
    const p = deviceProfile(
      env(UA.desktopChromeWin, { maxTouchPoints: 0, hardwareConcurrency: 8, deviceMemory: 8, ...ISOLATED }),
    )
    expect(p).toMatchObject({ ...DESKTOP_PTHREADS, threads: 7, hc: 8, simd: true, coi: true })
  })

  it('Chrome, hc 16, isolated: threads are capped at 8', () => {
    const p = deviceProfile(
      env(UA.desktopChromeWin, { maxTouchPoints: 0, hardwareConcurrency: 16, ...ISOLATED }),
    )
    expect(p).toMatchObject({ ...DESKTOP_PTHREADS, threads: 8 })
  })

  it('Chrome, hc 16, not isolated: workers are capped at 4', () => {
    const p = deviceProfile(
      env(UA.desktopChromeWin, { maxTouchPoints: 0, hardwareConcurrency: 16, ...PLAIN }),
    )
    expect(p).toMatchObject({ ...DESKTOP_LITE, workers: 4 })
  })

  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 3],
    [5, 4],
  ])('Chrome, hc %i, not isolated: %i lite-single worker(s)', (hc, workers) => {
    const p = deviceProfile(
      env(UA.desktopChromeWin, { maxTouchPoints: 0, hardwareConcurrency: hc, ...PLAIN }),
    )
    expect(p).toMatchObject({ ...DESKTOP_LITE, workers, hc })
  })

  it.each([
    [1, 1],
    [2, 1],
    [4, 3],
  ])('Chrome, hc %i, isolated: Threads %i (at least 1)', (hc, threads) => {
    const p = deviceProfile(
      env(UA.desktopChromeWin, { maxTouchPoints: 0, hardwareConcurrency: hc, ...ISOLATED }),
    )
    expect(p).toMatchObject({ ...DESKTOP_PTHREADS, threads })
  })

  it('a missing hardwareConcurrency (0) falls back to 2 cores: one worker', () => {
    const p = deviceProfile(env(UA.desktopChromeWin, { maxTouchPoints: 0, hardwareConcurrency: 0, ...PLAIN }))
    expect(p).toMatchObject({ ...DESKTOP_LITE, workers: 1, hc: 2 })
  })

  it('isolated page without SharedArrayBuffer cannot use pthreads', () => {
    const p = deviceProfile(
      env(UA.desktopChromeWin, {
        maxTouchPoints: 0,
        hardwareConcurrency: 8,
        crossOriginIsolated: true,
        sharedArrayBuffer: false,
      }),
    )
    expect(p).toMatchObject({ ...DESKTOP_LITE, workers: 4, coi: false })
  })

  it('SharedArrayBuffer without isolation cannot use pthreads', () => {
    const p = deviceProfile(
      env(UA.desktopChromeWin, {
        maxTouchPoints: 0,
        hardwareConcurrency: 8,
        crossOriginIsolated: false,
        sharedArrayBuffer: true,
      }),
    )
    expect(p).toMatchObject({ ...DESKTOP_LITE, workers: 4, coi: false })
  })

  it('low deviceMemory on desktop does not change workers or Hash', () => {
    const p = deviceProfile(
      env(UA.desktopChromeWin, { maxTouchPoints: 0, hardwareConcurrency: 8, deviceMemory: 4, ...PLAIN }),
    )
    expect(p).toMatchObject({ ...DESKTOP_LITE, workers: 4, lowMem: true })
  })

  it('Chrome on a Mac (Macintosh UA, no touch) is desktop Chromium, not an iPad and not WebKit', () => {
    const p = deviceProfile(
      env(UA.desktopChromeMac, { maxTouchPoints: 0, hardwareConcurrency: 10, ...ISOLATED }),
    )
    expect(p).toMatchObject({ ...DESKTOP_PTHREADS, threads: 8, isIOS: false, isIPad: false })
  })

  it('Edge (Chrome + Safari + Edg tokens) is not WebKit', () => {
    const p = deviceProfile(
      env(UA.desktopEdgeWin, { maxTouchPoints: 0, hardwareConcurrency: 8, ...ISOLATED }),
    )
    expect(p).toMatchObject({ ...DESKTOP_PTHREADS, threads: 7 })
  })

  it('Edge on a touch-screen Windows laptop stays desktop', () => {
    const p = deviceProfile(env(UA.desktopEdgeWin, { maxTouchPoints: 10, hardwareConcurrency: 8, ...PLAIN }))
    expect(p).toMatchObject({ ...DESKTOP_LITE, workers: 4, isIPad: false, isMobile: false })
  })

  it('Firefox, hc 12, not isolated, deviceMemory undefined: 4 lite-single workers', () => {
    const p = deviceProfile(
      env(UA.desktopFirefoxWin, { maxTouchPoints: 0, hardwareConcurrency: 12, ...PLAIN }),
    )
    expect(p).toMatchObject({ ...DESKTOP_LITE, workers: 4, lowMem: false, hc: 12, coi: false })
  })

  it('Firefox, hc 12, isolated: 1 pthreads worker, Threads 8 (cap), Hash 128', () => {
    const p = deviceProfile(
      env(UA.desktopFirefoxWin, { maxTouchPoints: 0, hardwareConcurrency: 12, ...ISOLATED }),
    )
    expect(p).toMatchObject({ ...DESKTOP_PTHREADS, threads: 8, hc: 12, coi: true })
  })
})

describe('deviceProfile: desktop Safari (WebKit is excluded from pthreads even when isolated)', () => {
  const SAFARI = {
    isIOS: false,
    isIPad: false,
    isAndroid: false,
    isMobile: false,
    isTablet: false,
    isWebKit: true,
    build: 'lite-single',
    pthreads: false,
    workers: 1,
    threads: 1,
    hashMb: 64,
    multiPv: 2,
  } as const

  it('not isolated: lite-single, 1 worker, Hash 64', () => {
    const p = deviceProfile(env(UA.desktopSafariMac, { maxTouchPoints: 0, hardwareConcurrency: 8, ...PLAIN }))
    expect(p).toMatchObject({ ...SAFARI, hc: 8, simd: true, coi: false })
  })

  it('isolated: still lite-single, 1 worker, 1 thread, Hash 64', () => {
    const p = deviceProfile(
      env(UA.desktopSafariMac, { maxTouchPoints: 0, hardwareConcurrency: 8, ...ISOLATED }),
    )
    expect(p).toMatchObject({ ...SAFARI, hc: 8, simd: true, coi: true })
  })

  it('a Mac reporting maxTouchPoints 2 is not an iPad (the iPad rule is more than 2 touch points)', () => {
    const p = deviceProfile(env(UA.desktopSafariMac, { maxTouchPoints: 2, hardwareConcurrency: 8, ...PLAIN }))
    expect(p).toMatchObject(SAFARI)
  })
})

describe('deviceProfile: SIMD gate (E-1 path)', () => {
  it.each([
    [
      'desktop Chrome, not isolated',
      UA.desktopChromeWin,
      { maxTouchPoints: 0, hardwareConcurrency: 8, ...PLAIN },
    ],
    [
      'desktop Chrome, isolated',
      UA.desktopChromeWin,
      { maxTouchPoints: 0, hardwareConcurrency: 8, ...ISOLATED },
    ],
    ['desktop Safari', UA.desktopSafariMac, { maxTouchPoints: 0, hardwareConcurrency: 8, ...PLAIN }],
    ['iPhone Safari', UA.iPhoneSafari, { maxTouchPoints: 5, hardwareConcurrency: 4, ...PLAIN }],
    ['iPad Safari', UA.iPadSafariMac, { maxTouchPoints: 5, hardwareConcurrency: 8, ...PLAIN }],
    [
      'Android Chrome',
      UA.androidChromePhone,
      { maxTouchPoints: 5, hardwareConcurrency: 8, deviceMemory: 4, ...PLAIN },
    ],
  ])('simd false returns null: %s', (_n, ua, rest) => {
    expect(deviceProfile({ userAgent: ua, simd: false, ...rest })).toBeNull()
  })

  it('simd true returns a profile (not null)', () => {
    const p = deviceProfile(env(UA.desktopChromeWin, { maxTouchPoints: 0, hardwareConcurrency: 8, ...PLAIN }))
    expect(p).not.toBeNull()
  })
})

describe('deviceProfile: shape and invariants (B.0, C.2 modification 7)', () => {
  it('returns exactly the DeviceProfile fields (no mem, no hashMB)', () => {
    const p = deviceProfile(
      env(UA.desktopChromeWin, { maxTouchPoints: 0, hardwareConcurrency: 8, deviceMemory: 8, ...ISOLATED }),
    )
    expect(p).not.toBeNull()
    expect(Object.keys(p ?? {}).sort()).toEqual(
      [
        'isIOS',
        'isIPad',
        'isAndroid',
        'isMobile',
        'isTablet',
        'isWebKit',
        'lowMem',
        'hc',
        'simd',
        'coi',
        'pthreads',
        'build',
        'workers',
        'threads',
        'hashMb',
        'multiPv',
      ].sort(),
    )
  })

  it.each([
    ['iPhone Safari', UA.iPhoneSafari, { maxTouchPoints: 5, hardwareConcurrency: 4 }],
    ['iPad Safari', UA.iPadSafariMac, { maxTouchPoints: 5, hardwareConcurrency: 8 }],
    ['Android phone', UA.androidChromePhone, { maxTouchPoints: 5, hardwareConcurrency: 8, deviceMemory: 4 }],
    [
      'Android tablet',
      UA.androidChromeTablet,
      { maxTouchPoints: 5, hardwareConcurrency: 8, deviceMemory: 8 },
    ],
    ['desktop Chrome', UA.desktopChromeWin, { maxTouchPoints: 0, hardwareConcurrency: 8 }],
    ['desktop Firefox', UA.desktopFirefoxWin, { maxTouchPoints: 0, hardwareConcurrency: 12 }],
    ['desktop Safari', UA.desktopSafariMac, { maxTouchPoints: 0, hardwareConcurrency: 8 }],
  ])('%s: build follows pthreads and pthreads implies a single worker', (_n, ua, rest) => {
    for (const iso of [PLAIN, ISOLATED]) {
      const p = deviceProfile(env(ua, { ...rest, ...iso }))
      expect(p).not.toBeNull()
      if (!p) continue
      expect(p.build).toBe(p.pthreads ? 'lite' : 'lite-single')
      if (p.pthreads) expect(p.workers).toBe(1)
      else expect(p.threads).toBe(1)
      // pthreads needs isolation, a non-WebKit browser and a non-mobile device (R12)
      if (p.pthreads) {
        expect(p.coi).toBe(true)
        expect(p.isWebKit).toBe(false)
        expect(p.isMobile).toBe(false)
      }
    }
  })
})
