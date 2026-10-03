// The one review configuration (PROMPT.md Appendix B.1). Every threshold is in win% points.
// Calibrated against chess.com's reported accuracies (MAE 4.06 on 244 sides); do not "improve" the constants.
import type { SearchLimits, Tier } from '../types/engine'

export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))

export type AccuracyAggregate = 'harmonic' | 'lichess'
export interface AccuracyPreset {
  decay: number
  aggregate: AccuracyAggregate
  floor: number
}

/** Per-move accuracy from a mover-POV win% drop: clamp(103.1668 * exp(-decay * drop) - 3.1669 + 1, 0, 100). */
export const perMoveAccuracy = (dropWinPct: number, decay: number): number =>
  clamp(103.1668 * Math.exp(-decay * dropWinPct) - 3.1669 + 1, 0, 100)

export const REVIEW_CONFIG = {
  // Eval -> win% (lichess curve). cp clamped to +-1000; mate = 100 / 0 (mate-in-0 = mated side 0).
  winCurveK: 0.00368208,
  cpClamp: 1000,
  // chess.com's published expected-points bands (support article 8572705), as win% points (EP fraction x 100)
  bands: { best: 0, excellent: 2, good: 5, inaccuracy: 10, mistake: 20 },
  // Great ("only move"): top move played AND (winBest - winSecond >= 10 win% OR cpBest - cpSecond >= 300 when both cp)
  great: {
    minWinGap: 10,
    minCpGap: 300,
    minWinAfter: 45,
    excludeInCheck: true,
    excludeQueenPromotion: true,
    excludeRecapture: true,
    excludeFreeOrHigherValueCapture: true,
    excludeEscapeFromCheaperAttacker: true,
  },
  // "already winning" gate shared by Great & Brilliant: second-best line (mover POV) >= 700 cp or a mate for the mover
  alreadyWinningSecondBestCp: 700,
  brilliant: { maxLoss: 2, minSacrificePawnUnits: 2, minWinAfter: 45, pvPliesForMaterialCount: 8 },
  miss: { minOpponentGain: 10, minGivenBack: 10, tolerance: 5 },
  // Missed forced mate (Miss rule b): best line was mate in <= 5 for the mover, played move cp, winAfter >= 90
  missForcedMate: { maxMateIn: 5, minWinAfter: 90 },
  // Soft cap: Blunder or Mistake with winAfter >= 97 or winBefore <= 3 becomes Good (B.3 step 6)
  softCap: { winAfterAtLeast: 97, winBeforeAtMost: 3 },
  // Draw on board reached from win% >= 90 is a Blunder (B.3 step 4)
  drawOnBoardBlunderFromWin: 90,
  // Optional toggle: Great additionally requires the opponent's previous move to have lost >= 10 win%
  greatRequireOpponentError: false,
  pieceValues: { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 } as Record<string, number>,
  // Accuracy (calibrated, MAE 4.06 vs chess.com on 244 sides): harmonic mean of max(acc, 20); Book/Forced = 100
  accuracy: { decay: 0.06, aggregate: 'harmonic', floor: 20 } as AccuracyPreset,
  // Estimated game rating: est = a + b * actualRating + c * accuracy, rounded to 50, clamped
  rating: {
    model: 'regression' as const,
    a: -1613.3,
    b: 0.72597,
    c: 28.179,
    round: 50,
    clamp: [100, 3200] as [number, number],
    fallbackNoRating: (acpl: number): number => 3100 * Math.exp(-0.01 * acpl),
    acplCpClamp: 1000,
    acplMaxPerMove: 1000,
  },
  ratingMinMoves: 10,
  // Key moments (R23)
  keyMoments: {
    mistakeMinSwing: 15,
    bonusBrilliantGreat: 10,
    bonusMiss: 5,
    bonusCross50: 5,
    dedupePlies: 2,
    cap: 8,
  },
  // Phase grade icon by accuracy: >= 90 Best, >= 80 Excellent, >= 70 Good, >= 55 Inaccuracy, >= 40 Mistake, else Blunder
  phaseGradeBands: [90, 80, 70, 55, 40],
  phaseMinMoves: 4,
  // Explanations: tactical rules only when the depth reached is >= min(depthTarget, 14)
  explainDepthGate: 14,
  // Calibration note (what the constants were measured with), not the runtime profile (Appendix C.4)
  engine: { multiPv: 2, depth: 16, perMoveTimeCapMs: 2000, hashMb: 32 },
  // Runtime search profiles and calibration tiers (Appendix C.4)
  profiles: {
    standard: { depth: 16, movetimeMs: 1500 },
    deep: { depth: 20, movetimeMs: 6000 },
  } as Record<'standard' | 'deep', Omit<SearchLimits, 'multiPv'>>,
  tiers: {
    'auto-18': { depth: 18, movetimeMs: 600 },
    'auto-16': { depth: 16, movetimeMs: 400 },
    'fast-14': { depth: 14, movetimeMs: 350 },
    'standard-16': { depth: 16, movetimeMs: 1500 },
    'deep-20': { depth: 20, movetimeMs: 6000 },
  } as Record<Tier, Omit<SearchLimits, 'multiPv'>>,
  calibration: { depth: 12, auto18MinNps: 600_000, auto16MinNps: 300_000, maxAgeDays: 7 },
  engineTimeouts: { bootMs: 15_000, watchdogMs: 10_000, retryDepth: 12 },
}

/** The "lichess" preset: selectable only on the dev calibration page /?dev=calibration (R20). */
export const LICHESS_PRESET: { accuracy: AccuracyPreset } = {
  accuracy: { decay: 0.04354415386753951, aggregate: 'lichess', floor: 0 },
}

export type ReviewConfig = typeof REVIEW_CONFIG
