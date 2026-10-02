// R19: the B.3 decision procedure, the B.2 bands and mate tables, the B.4 Miss rules.
// The conversion from White's perspective to the mover's happens here and nowhere else (R18, risk 5).
import { Chess, type Square } from 'chess.js'
import type { Score } from '../types/engine'
import type { GameMove } from '../types/game'
import type { Classification } from '../types/review'
import { REVIEW_CONFIG } from './config'
import { canBeTakenByLowerPiece, enPrise, isDefended, materialDiff, other, see } from './see'
import type { ClassifyContext, ClassifyResult } from './types'
import { winPct } from './winPercent'

const C = REVIEW_CONFIG
const VAL = C.pieceValues

type Label = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'
/** Order used by `milder`: Best < Excellent < Good < Inaccuracy < Mistake < Blunder. */
const SEVERITY: Label[] = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder']
interface Labelled {
  label: Label
  reason: string
}

/** The single White -> mover rule of B.2: `color === 'w' ? v : -v`, for cp and mate counts alike. */
export const toMover = (s: Score, color: 'w' | 'b'): Score => ({
  type: s.type,
  value: color === 'w' ? s.value : -s.value,
})

function bandLabel(loss: number): Label {
  const b = C.bands
  if (loss <= b.best) return 'best'
  if (loss < b.excellent) return 'excellent'
  if (loss < b.good) return 'good'
  if (loss < b.inaccuracy) return 'inaccuracy'
  if (loss < b.mistake) return 'mistake'
  return 'blunder'
}

/** B.2 `pointLossClassify`: both scores mover POV; the mate tables precede the bands. */
function pointLossClassify(before: Score, after: Score): Labelled {
  if (before.type === 'mate' && after.type === 'mate') {
    const reason = 'MateTable:mate-mate'
    if (before.value > 0 && after.value < 0)
      return { label: after.value < -3 ? 'mistake' : 'blunder', reason }
    const ml = after.value - before.value
    if (ml < 0 || (ml === 0 && after.value < 0)) return { label: 'best', reason }
    if (ml < 2) return { label: 'excellent', reason }
    if (ml < 7) return { label: 'good', reason }
    return { label: 'inaccuracy', reason }
  }
  if (before.type === 'mate' && after.type === 'cp') {
    const reason = 'MateTable:mate-cp'
    if (before.value < 0) return { label: 'best', reason }
    const v = after.value
    const label: Label =
      v >= 800 ? 'excellent' : v >= 400 ? 'good' : v >= 200 ? 'inaccuracy' : v >= 0 ? 'mistake' : 'blunder'
    return { label, reason }
  }
  if (before.type === 'cp' && after.type === 'mate') {
    const reason = 'MateTable:cp-mate'
    if (after.value > 0) return { label: 'best', reason }
    return { label: after.value >= -2 ? 'blunder' : after.value >= -5 ? 'mistake' : 'inaccuracy', reason }
  }
  return { label: bandLabel(winPct(before) - winPct(after)), reason: 'Band' }
}

const milder = (a: Labelled, b?: Labelled): Labelled =>
  b && SEVERITY.indexOf(b.label) < SEVERITY.indexOf(a.label) ? b : a

/** The opponent (to move in `board`) takes on `square` with its cheapest legal capturer. The sacrifice is real
 *  when that capture neither allows a mate in 1 for the mover nor hangs an opponent piece bigger than the one
 *  sacrificed (B.3 step 8a). */
function captureIsReal(board: Chess, square: Square, sacrificedValue: number): boolean {
  const captures = board
    .moves({ verbose: true })
    .filter((m) => m.to === square)
    .sort((x, y) => VAL[x.piece] - VAL[y.piece])
  if (!captures.length) return false
  const t = new Chess(board.fen())
  t.move({ from: captures[0].from, to: captures[0].to, promotion: captures[0].promotion })
  if (t.moves().some((s) => s.endsWith('#'))) return false
  const opponent = board.turn()
  for (const row of t.board())
    for (const cell of row) {
      if (!cell || cell.color !== opponent || cell.type === 'k' || VAL[cell.type] <= sacrificedValue) continue
      if (enPrise(t, cell.square)) return false
    }
  return true
}

/** B.3 step 8(a): after the move some mover piece (not pawn, not king) worth more than the piece just captured is
 *  en prise, and losing it costs at least `minSacrificePawnUnits` net of what the move captured. */
function sacrificeLeftEnPrise(move: GameMove): boolean {
  const board = new Chess(move.after)
  const capturedValue = move.captured ? VAL[move.captured] : 0
  for (const row of board.board())
    for (const cell of row) {
      if (!cell || cell.color !== move.color || cell.type === 'p' || cell.type === 'k') continue
      if (VAL[cell.type] <= capturedValue || !enPrise(board, cell.square)) continue
      if (see(board, cell.square, other(move.color)) - capturedValue < C.brilliant.minSacrificePawnUnits)
        continue
      if (captureIsReal(board, cell.square, VAL[cell.type])) return true
    }
  return false
}

/** B.3 step 8(b): replaying the first plies of PV1 of the position after the move (stopping at the end of the PV
 *  or after two consecutive quiet plies) leaves the mover at least `minSacrificePawnUnits` down in material
 *  balance against the position before the move. */
function sacrificeInPv(move: GameMove, pv: string[]): boolean {
  if (!pv.length) return false
  const start = materialDiff(new Chess(move.before), move.color)
  const board = new Chess(move.after)
  let quiet = 0
  for (const uci of pv.slice(0, C.brilliant.pvPliesForMaterialCount)) {
    let m
    try {
      m = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      break
    }
    quiet = m.captured || m.promotion ? 0 : quiet + 1
    if (quiet >= 2) break
  }
  return start - materialDiff(board, move.color) >= C.brilliant.minSacrificePawnUnits
}

/** B.3 step 9 exclusions (spec-gap resolution 3). */
function greatExcluded(move: GameMove, previous: ClassifyContext['previous']): boolean {
  const g = C.great
  if (g.excludeRecapture && previous?.captured && move.to === previous.to) return true
  const board = new Chess(move.before)
  if (move.captured && g.excludeFreeOrHigherValueCapture) {
    const enPassant = move.piece === 'p' && !board.get(move.to as Square)
    const capturedOn = (enPassant ? move.to[0] + move.from[1] : move.to) as Square
    if (!isDefended(board, capturedOn) || VAL[move.captured] > VAL[move.piece]) return true
  }
  return g.excludeEscapeFromCheaperAttacker && canBeTakenByLowerPiece(board, move.from as Square)
}

/** One-function implementation of the B.3 decision procedure. */
export function classifyPly(ctx: ClassifyContext): ClassifyResult {
  const { move, before, after, previous } = ctx
  const color = move.color
  const top = before.lines[0]
  if (!top) throw new Error(`classifyPly: no engine line for ${move.before}`)
  const beforePov = toMover(top.score, color)
  const winBefore = winPct(beforePov)

  // B.3 steps 3 and 4 read the importer's flag (mirrored on the synthesised PositionEval)
  const mated = move.terminal === 'checkmate' || after.terminal === 'checkmate'
  const drawn = !mated && (move.terminal !== undefined || after.terminal !== undefined)
  let afterTopPov: Score
  if (mated) afterTopPov = { type: 'mate', value: 0 }
  else if (drawn) afterTopPov = { type: 'cp', value: 0 }
  else {
    const afterTop = after.lines[0]
    if (!afterTop) throw new Error(`classifyPly: no engine line for ${move.after}`)
    afterTopPov = toMover(afterTop.score, color)
  }
  const playedLine = before.lines.find((l) => l.pv[0] === move.uci)
  const afterPlayedPov = playedLine ? toMover(playedLine.score, color) : undefined

  const winAfter = mated ? 100 : winPct(afterTopPov)
  const lossTop = Math.max(0, winBefore - winAfter)
  const lossPlayed = afterPlayedPov ? Math.max(0, winBefore - winPct(afterPlayedPov)) : Infinity
  const loss = mated ? 0 : Math.min(lossTop, lossPlayed)
  const result = (classification: Classification, reasonCode: string): ClassifyResult => ({
    classification,
    reasonCode,
    winBefore,
    winAfter,
    loss,
  })

  // 1. Forced (chess.js, not the engine)
  const beforeBoard = new Chess(move.before)
  if (beforeBoard.moves().length === 1) return result('forced', 'Forced')
  // 2. Book
  if (ctx.isBook) return result('book', 'Book')

  // 3, 4, 5. Checkmate, draw on board, top move or the tables
  const isBest = move.uci === top.pv[0]
  let base: Labelled
  if (mated) base = { label: 'best', reason: 'CheckmateBest' }
  else if (drawn && winBefore >= C.drawOnBoardBlunderFromWin) return result('blunder', 'DrawFromWinning')
  else if (isBest) base = { label: 'best', reason: 'BestTop' }
  else
    base = milder(
      pointLossClassify(beforePov, afterTopPov),
      afterPlayedPov && pointLossClassify(beforePov, afterPlayedPov),
    )
  let label: Classification = base.label
  let reason = base.reason

  // 6. Soft cap
  if (
    (label === 'blunder' || label === 'mistake') &&
    (winAfter >= C.softCap.winAfterAtLeast || winBefore <= C.softCap.winBeforeAtMost)
  ) {
    label = 'good'
    reason = 'SoftCap'
  }

  // 7. Shared Brilliant/Great gate
  const second = before.lines[1]
  const secondPov = second && toMover(second.score, color)
  const gate =
    (label === 'best' || label === 'excellent') &&
    !(C.great.excludeInCheck && beforeBoard.inCheck()) &&
    secondPov !== undefined &&
    !(secondPov.type === 'cp' && secondPov.value >= C.alreadyWinningSecondBestCp) &&
    !(secondPov.type === 'mate' && secondPov.value > 0) &&
    !(C.great.excludeQueenPromotion && move.promotion === 'q')

  // 8. Brilliant (promotions never)
  if (gate && winAfter >= C.brilliant.minWinAfter && loss <= C.brilliant.maxLoss && !move.promotion) {
    if (sacrificeLeftEnPrise(move)) return result('brilliant', 'Brilliant:a')
    if (!mated && sacrificeInPv(move, after.lines[0]?.pv ?? [])) return result('brilliant', 'Brilliant:b')
  }

  // 9. Great
  if (gate && isBest && winAfter >= C.great.minWinAfter && secondPov) {
    const winGap = winBefore - winPct(secondPov)
    const cpGap =
      beforePov.type === 'cp' && secondPov.type === 'cp' ? beforePov.value - secondPov.value : -Infinity
    const sub = winGap >= C.great.minWinGap ? 'gap' : cpGap >= C.great.minCpGap ? 'cpgap' : null
    const opponentErred =
      !C.greatRequireOpponentError ||
      (previous !== undefined && previous.winBefore - previous.winAfter >= C.miss.minOpponentGain)
    if (sub && opponentErred && !greatExcluded(move, previous)) return result('great', `Great:${sub}`)
  }

  // 10. Miss overlay (B.4): (a) before (b)
  if (previous && (label === 'inaccuracy' || label === 'mistake' || label === 'blunder')) {
    const preMistakeWin = 100 - previous.winBefore
    if (
      winBefore - preMistakeWin >= C.miss.minOpponentGain &&
      loss >= C.miss.minGivenBack &&
      winAfter > 0 &&
      Math.abs(winAfter - preMistakeWin) <= C.miss.tolerance
    )
      return result('miss', 'Miss:a')
  }
  if (
    (label === 'inaccuracy' || label === 'mistake' || label === 'blunder' || label === 'good') &&
    beforePov.type === 'mate' &&
    beforePov.value > 0 &&
    beforePov.value <= C.missForcedMate.maxMateIn &&
    !mated &&
    !drawn &&
    afterTopPov.type === 'cp' &&
    winAfter >= C.missForcedMate.minWinAfter
  )
    return result('miss', 'Miss:b')

  return result(label, reason)
}

/** R15: on phones (MultiPV 1 pass) a ply is re-searched with MultiPV 2 when its base label is Best or Excellent,
 *  when the opponent's previous move raised the mover's win% by at least 10 (Miss precondition), or when the best
 *  line before the move is a mate in at most 5 for the mover. Forced and Book are final whatever the lines say. */
export function isRefineCandidate(ctx: ClassifyContext, base: ClassifyResult): boolean {
  if (base.classification === 'forced' || base.classification === 'book') return false
  if (base.classification === 'best' || base.classification === 'excellent') return true
  if (ctx.previous && base.winBefore - (100 - ctx.previous.winBefore) >= C.miss.minOpponentGain) return true
  const top = ctx.before.lines[0]
  const pov = top && toMover(top.score, ctx.move.color)
  return !!pov && pov.type === 'mate' && pov.value > 0 && pov.value <= C.missForcedMate.maxMateIn
}
