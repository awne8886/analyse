// Engine strings (PROMPT.md Appendix F.3, E-rows), keyed by row key; `{x}` placeholders stay in the stored string.
// The only user-facing engine strings; src/main.tsx reads E-7 before anything else is loaded.
export const ENGINE_STRINGS: Record<string, string> = {
  'E-1':
    "Your browser can't run the analysis engine. It needs WebAssembly SIMD, which is available in Safari 16.4+ (iOS 16.4+), Chrome 91+, Firefox 89+, Edge 91+. Please update your browser or open this page on a newer device.",
  'E-2':
    "The engine couldn't start (WebAssembly error: {message}). This usually means the device is low on memory. Close other tabs and apps, then tap Retry. If it keeps failing, use a desktop browser.",
  'E-3': 'Analysis was interrupted (your device ran out of memory). Resuming from move {n} in fast mode.',
  'E-4': 'Fast mode (depth 14)',
  'E-5': 'Multi-core: {n} threads',
  'E-6': 'Single-core mode',
  'E-7': 'Enabling multi-core analysis…',
  'E-8': 'Analysing move {n} of {total}, about {s} s left',
  'E-8b': 'Keep this tab in the foreground while analysing.',
  'E-9': 'Not analysed (engine timed out on this position).',
  'E-10': 'Refining {k} candidate moves…',
}
