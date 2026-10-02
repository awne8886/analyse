// R20: per-move and game accuracy. Default preset: harmonic mean of max(acc, 20). The "lichess" preset (dev
// calibration page only): sliding-window volatility weights, (weighted mean + harmonic mean) / 2, no floor.
import type { Classification } from '../types/review'
import { clamp, perMoveAccuracy, REVIEW_CONFIG, type AccuracyPreset } from './config'
import type { AccuracyInput } from './types'

export function moveAccuracy(loss: number, preset: AccuracyPreset = REVIEW_CONFIG.accuracy): number {
  if (loss <= 0) return 100
  return perMoveAccuracy(loss, preset.decay)
}

const countsAsPerfect = (c?: Classification): boolean => c === 'book' || c === 'forced'

/** Accuracy of one move under a preset: Book and Forced count as 100. */
export const inputAccuracy = (m: AccuracyInput, preset: AccuracyPreset = REVIEW_CONFIG.accuracy): number =>
  countsAsPerfect(m.classification) ? 100 : moveAccuracy(m.loss, preset)

/** Harmonic mean of max(acc, floor); a value of 0 is guarded at 1 (division by zero, as lichess does). */
export function harmonicMean(values: number[], floor: number): number | undefined {
  if (!values.length) return undefined
  return values.length / values.reduce((s, v) => s + 1 / Math.max(v, floor, 1), 0)
}

function populationStdDev(xs: number[]): number {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length)
}

/** Lichess volatility weights, one per move: windowSize = clamp(floor(N / 10), 2, 8); windowSize - 2 copies of
 *  the first window, then every sliding window of the White win% series (position 0 included); weight =
 *  clamp(stddev(window), 0.5, 12). */
function lichessWeights(series: number[]): number[] {
  const n = series.length - 1
  const size = clamp(Math.floor(n / 10), 2, 8)
  const windows: number[][] = []
  for (let i = 0; i < Math.min(size, series.length) - 2; i++) windows.push(series.slice(0, size))
  for (let i = 0; i + size <= series.length; i++) windows.push(series.slice(i, i + size))
  return windows.map((w) => clamp(populationStdDev(w), 0.5, 12))
}

/** Unrounded game accuracy per colour (display rounds to one decimal). `whiteWinSeries` (white-POV win% of
 *  positions 0..N, moves[i] being the move from position i to i + 1) is required by the lichess preset only. */
export function gameAccuracy(
  moves: AccuracyInput[],
  opts: { preset?: AccuracyPreset; whiteWinSeries?: number[] } = {},
): { white?: number; black?: number } {
  const preset = opts.preset ?? REVIEW_CONFIG.accuracy
  const out: { white?: number; black?: number } = {}
  if (preset.aggregate === 'lichess') {
    if (!opts.whiteWinSeries) throw new Error('gameAccuracy: the lichess preset needs whiteWinSeries')
    const weights = lichessWeights(opts.whiteWinSeries)
    for (const color of ['w', 'b'] as const) {
      const rows = moves
        .map((m, i) => ({ m, w: weights[i] ?? 0.5 }))
        .filter(({ m }) => m.color === color && !m.notAnalysed)
        .map(({ m, w }) => ({ acc: inputAccuracy(m, preset), w }))
      if (!rows.length) continue
      const weighted = rows.reduce((s, r) => s + r.acc * r.w, 0) / rows.reduce((s, r) => s + r.w, 0)
      const harmonic = harmonicMean(
        rows.map((r) => r.acc),
        preset.floor,
      ) as number
      out[color === 'w' ? 'white' : 'black'] = (weighted + harmonic) / 2
    }
    return out
  }
  for (const color of ['w', 'b'] as const) {
    const accs = moves.filter((m) => m.color === color && !m.notAnalysed).map((m) => inputAccuracy(m, preset))
    const value = harmonicMean(accs, preset.floor)
    if (value !== undefined) out[color === 'w' ? 'white' : 'black'] = value
  }
  return out
}
