// Public entry point of src/analysis (PROMPT.md section 4.5).
export { REVIEW_CONFIG, LICHESS_PRESET, clamp, type AccuracyPreset } from './config'
export type { ClassifyContext, ClassifyResult, AccuracyInput, RatingInput, AnalyzeOptions } from './types'
export { winPct, winPctWhite } from './winPercent'
export { classifyPly } from './classify'
export { moveAccuracy, gameAccuracy } from './accuracy'
export { estimateRating } from './rating'
export { dividePhases, majorsAndMinors, backrankSparse, mixedness, phaseGrade } from './phases'
export { keyMoments } from './keyMoments'
export { lookupOpening, epdOf } from './openings'
export { analyzeGame, latestJobId, nextJobId } from './analyzeGame'
export { summarySentence } from './summary'
export {
  calibrationReport,
  type CalibrationSample,
  type CalibrationRow,
  type CalibrationReport,
  type PresetError,
} from './calibration'
