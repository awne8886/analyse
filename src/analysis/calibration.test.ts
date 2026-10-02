// Data helper of /?dev=calibration (R20): both presets against chess.com's reported accuracies.
import { describe, expect, it } from 'vitest'
import { analyzeGame, calibrationReport } from './index'
import { cp, DESKTOP_PROFILE, FakeEngine, lineEval, makeGame, otherMove } from './test-helpers'

async function reviewed(reported?: { white: number; black: number }) {
  const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7']
  const game = {
    ...makeGame(sans, { customStart: true }),
    ...(reported ? { reportedAccuracies: reported } : {}),
  }
  const fens = [...game.moves.map((m) => m.before), game.moves[game.moves.length - 1].after]
  // White-perspective evals drifting by position, with every other played move not the engine's choice
  const engine = new FakeEngine((fen, limits) => {
    const k = fens.indexOf(fen)
    const played = game.moves[k]?.uci ?? otherMove(fen, '')
    const top = k % 3 === 0 ? played : otherMove(fen, played)
    return lineEval(fen, [[top, cp(40 * (k % 4) - 60)]], limits.multiPv)
  })
  return { game, review: await analyzeGame(game, engine, DESKTOP_PROFILE, {}) }
}

describe('calibrationReport', () => {
  it('computes both presets per side and their MAE and bias against the reported accuracies', async () => {
    const a = await reviewed({ white: 80, black: 75 })
    const b = await reviewed()
    const report = calibrationReport([a, { ...b, reported: { white: 90, black: 60 } }])
    expect(report.sides).toBe(4)
    expect(report.rows.map((r) => [r.side, r.reported])).toEqual([
      ['white', 80],
      ['black', 75],
      ['white', 90],
      ['black', 60],
    ])
    // the harmonic preset is exactly what the review shows
    expect(report.rows[0].harmonic).toBeCloseTo(a.review.accuracy.white as number, 10)
    expect(report.rows[1].harmonic).toBeCloseTo(a.review.accuracy.black as number, 10)
    for (const key of ['harmonic', 'lichess'] as const) {
      const diffs = report.rows.map((r) => r[key] - r.reported)
      expect(report[key]?.mae).toBeCloseTo(diffs.reduce((s, d) => s + Math.abs(d), 0) / 4, 10)
      expect(report[key]?.bias).toBeCloseTo(diffs.reduce((s, d) => s + d, 0) / 4, 10)
    }
    expect(report.rows.every((r) => r.lichess >= 0 && r.lichess <= 100)).toBe(true)
  })

  it('skips games without reported accuracies', async () => {
    const report = calibrationReport([await reviewed()])
    expect(report).toEqual({ rows: [], sides: 0, harmonic: null, lichess: null })
  })
})
