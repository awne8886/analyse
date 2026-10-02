// Data helper of the dev calibration page /?dev=calibration (R20): accuracy of both presets for reviewed games
// against chess.com's reported `accuracies`, and the mean absolute error of each preset.
import type { ImportedGame } from '../types/game'
import type { GameReview } from '../types/review'
import { gameAccuracy } from './accuracy'
import { LICHESS_PRESET } from './config'
import { whiteWins } from './keyMoments'
import type { AccuracyInput } from './types'

export interface CalibrationSample {
  game: ImportedGame
  review: GameReview
  /** Chess.com's reported accuracies; defaults to `game.reportedAccuracies`. */
  reported?: { white: number; black: number }
}
export interface CalibrationRow {
  gameId: string
  side: 'white' | 'black'
  reported: number
  harmonic: number
  lichess: number
}
export interface PresetError {
  mae: number
  bias: number // mean of (ours - reported)
}
export interface CalibrationReport {
  rows: CalibrationRow[]
  sides: number
  harmonic: PresetError | null
  lichess: PresetError | null
}

export function calibrationReport(samples: CalibrationSample[]): CalibrationReport {
  const rows: CalibrationRow[] = []
  for (const { game, review, reported = game.reportedAccuracies } of samples) {
    if (!reported || !review.plies.length) continue
    const inputs: AccuracyInput[] = review.plies.map((p) => ({
      color: p.color,
      loss: p.loss,
      classification: p.classification,
      notAnalysed: p.status !== 'done',
    }))
    const whiteWinSeries = [whiteWins(review.plies[0])[0], ...review.plies.map((p) => whiteWins(p)[1])]
    const harmonic = gameAccuracy(inputs)
    const lichess = gameAccuracy(inputs, { preset: LICHESS_PRESET.accuracy, whiteWinSeries })
    for (const side of ['white', 'black'] as const) {
      const h = harmonic[side]
      const l = lichess[side]
      if (h === undefined || l === undefined) continue
      rows.push({ gameId: review.gameId, side, reported: reported[side], harmonic: h, lichess: l })
    }
  }
  const error = (key: 'harmonic' | 'lichess'): PresetError | null =>
    rows.length
      ? {
          mae: rows.reduce((s, r) => s + Math.abs(r[key] - r.reported), 0) / rows.length,
          bias: rows.reduce((s, r) => s + (r[key] - r.reported), 0) / rows.length,
        }
      : null
  return { rows, sides: rows.length, harmonic: error('harmonic'), lichess: error('lichess') }
}
