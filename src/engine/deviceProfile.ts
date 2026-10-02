// Device detection (PROMPT.md Appendix C.2 snippet with its seven required modifications; the C.4 table is the
// reference). Browser facts can be injected through `DeviceEnv` so every R12/R13 case is unit-testable.
import type { DeviceProfile } from '../types/engine'

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

// wasm-feature-detect SIMD probe (Appendix C.3)
const SIMD_PROBE = [
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98,
  11,
]

type NavigatorExtras = Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } }

/** Returns null when WebAssembly SIMD is missing (the caller shows E-1 and never creates a worker). */
export function deviceProfile(env: DeviceEnv = {}): DeviceProfile | null {
  const nav: Partial<NavigatorExtras> = typeof navigator === 'undefined' ? {} : (navigator as NavigatorExtras)
  const ua = (env.userAgent ?? nav.userAgent ?? '').toLowerCase()
  const maxTouchPoints = env.maxTouchPoints ?? nav.maxTouchPoints ?? 0
  const isIPad = maxTouchPoints > 2 && /ipad|macintosh/.test(ua) // iPadOS masquerades as macOS
  const isIOS = /iphone|ipod/.test(ua) || isIPad // all iOS browsers are WebKit
  const isAndroid = ua.includes('android')
  const isMobile = isIOS || isAndroid || (env.userAgentDataMobile ?? nav.userAgentData?.mobile) === true
  const isWebKit = isIOS || (/safari/.test(ua) && !/chrome|chromium|crios|fxios|edg|opr|android/.test(ua))
  const hc = (env.hardwareConcurrency ?? nav.hardwareConcurrency) || 2 // iPhone always 4, iPad M* 8
  const mem = env.deviceMemory ?? nav.deviceMemory // undefined on Safari/Firefox
  const lowMem = isIOS ? !isIPad : mem !== undefined ? mem <= 4 : isMobile
  const isTablet = isIPad || (isAndroid && !lowMem)
  const simd =
    env.simd ?? (typeof WebAssembly !== 'undefined' && WebAssembly.validate(new Uint8Array(SIMD_PROBE)))
  if (!simd) return null
  const crossOriginIsolated =
    env.crossOriginIsolated ?? (typeof self !== 'undefined' && self.crossOriginIsolated === true)
  const sharedArrayBuffer = env.sharedArrayBuffer ?? typeof SharedArrayBuffer === 'function'
  const coi = crossOriginIsolated && sharedArrayBuffer
  const pthreads = coi && !isWebKit && !isMobile // R12
  return {
    isIOS,
    isIPad,
    isAndroid,
    isMobile,
    isTablet,
    isWebKit,
    lowMem,
    hc,
    simd,
    coi,
    pthreads,
    build: pthreads ? 'lite' : 'lite-single',
    workers: pthreads || isMobile || isWebKit ? 1 : Math.max(1, Math.min(hc - 1, 4)),
    threads: pthreads ? Math.max(1, Math.min(hc - 1, 8)) : 1,
    hashMb: isMobile ? (isTablet ? 32 : 16) : pthreads ? 128 : 64,
    multiPv: isMobile && !isTablet ? 1 : 2,
  }
}
