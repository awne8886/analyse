// MoveFacts from a reviewed ply (PROMPT.md Appendix E.1, E.2; data sources in docs/notes/contracts.md section 3).
// Engine data comes from PlyReview; every motif comes from the E.1 detectors run with chess.js on the boards before
// the move, after it, after the engine's reply and after the engine's best move.
import { Chess, type Color, type Move } from 'chess.js'
import { lookupOpening, REVIEW_CONFIG, winPct } from '../analysis'
import type { Score } from '../types/engine'
import type { Motif, MoveFacts } from '../types/explain'
import type { GameReview } from '../types/review'
import * as D from './detectors'

/** PV SANs are capped at this many plies (E.2). */
const MAX_PV = 8

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')
const moverPov = (s: Score, color: Color): Score => (color === 'w' ? s : { type: s.type, value: -s.value })
const uciMove = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
const epd = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

/** Replays UCI moves from `fen` and returns their SAN (stops at the first illegal move or at `max`). */
export function pvToSan(fen: string, ucis: string[], max = MAX_PV): string[] {
  const c = new Chess(fen)
  const out: string[] = []
  for (const u of ucis.slice(0, max)) {
    try {
      out.push(c.move(uciMove(u)).san)
    } catch {
      break
    }
  }
  return out
}

export interface MaterialLine {
  /** Net material change in pawn units, from `mover`'s point of view. */
  net: number
  /** Piece letters `mover` lost and gained along the counted part of the line. */
  lost: string[]
  gained: string[]
  captures: number
  /** Plies consumed up to the point where the material was settled. */
  plies: number
}

/**
 * Material along a SAN line (E.2): replay on a chess.js copy and take materialDiff(after) - materialDiff(before)
 * from the mover's POV, stopping at the end of the line or after a quiet move that follows a capture. When the line
 * ends mid-exchange the last capture is not counted as a net gain for its side: with `measure` 'gain' a final
 * capture by the mover is dropped, with 'loss' a final capture by the opponent is dropped.
 */
export function materialAlong(
  fen: string,
  sans: string[],
  mover: Color,
  measure: 'gain' | 'loss',
  max = MAX_PV + 1,
): MaterialLine {
  const c = new Chess(fen)
  const start = D.materialDiff(c, mover)
  const lost: string[] = []
  const gained: string[] = []
  let captures = 0
  let seenChange = false
  let plies = 0
  let last: { move: Move; diffBefore: number } | null = null
  let endsOnChange = false
  for (const san of sans.slice(0, max)) {
    const diffBefore = D.materialDiff(c, mover)
    let m: Move
    try {
      m = c.move(san)
    } catch {
      break
    }
    plies++
    const changes = Boolean(m.captured || m.promotion)
    if (m.captured) {
      captures++
      if (m.color === mover) gained.push(m.captured)
      else lost.push(m.captured)
    }
    endsOnChange = changes
    if (changes) {
      seenChange = true
      last = { move: m, diffBefore }
    } else if (seenChange) break
  }
  let net = D.materialDiff(c, mover) - start
  if (endsOnChange && last) {
    const byMover = last.move.color === mover
    if ((measure === 'gain' && byMover) || (measure === 'loss' && !byMover)) {
      net = last.diffBefore - start
      if (last.move.captured) {
        captures--
        const list = byMover ? gained : lost
        list.splice(list.lastIndexOf(last.move.captured), 1)
      }
    }
  }
  return { net, lost, gained, captures, plies }
}

/** Fork, pins and skewers, discovered attacks, mate threat, free piece and trapped pieces created by `m`. */
function tacticsOf(prev: Chess, next: Chess, m: Move): Motif[] {
  const out: Motif[] = []
  const fork = D.detectFork(next, m.to)
  if (fork) out.push(fork)
  for (const x of D.newPinsAndSkewers(prev, next, m.color)) {
    if (x.type === 'pin') out.push({ type: 'pin', absolute: Boolean(x.absolute), by: x.by, pinned: x.pinned!, to: x.to! })
    else out.push({ type: 'skewer', by: x.by, front: x.front!, behind: x.behind! })
  }
  out.push(...D.detectDiscovered(prev, next, m))
  if (!m.san.endsWith('#')) {
    const threat = D.matesInOneIfPass(next, m.color)
    if (threat) out.push({ type: 'mateThreat', san: threat })
  }
  if (m.captured && prev.get(m.to) && D.isHanging(prev, m.to) && D.see(prev, m.to, m.color) > 0)
    out.push({ type: 'freePiece', square: m.to })
  for (const s of D.newlyTrapped(prev, next, other(m.color))) out.push({ type: 'trapped', square: s })
  return out
}

function safeLookup(fen: string): { eco: string; name: string } | undefined {
  try {
    return lookupOpening(epd(fen))
  } catch {
    return undefined // the opening table is unavailable: treat as "no opening"
  }
}

/** `ply` is the 1-based PlyReview.ply. */
export function buildMoveFacts(review: GameReview, ply: number, userColor: 'w' | 'b'): MoveFacts {
  const idx = review.plies.findIndex((p) => p.ply === ply)
  if (idx < 0) throw new Error(`buildMoveFacts: no ply ${ply}`)
  const p = review.plies[idx]
  const prev = idx > 0 && review.plies[idx - 1].ply === ply - 1 ? review.plies[idx - 1] : undefined
  const next = review.plies[idx + 1]?.ply === ply + 1 ? review.plies[idx + 1] : undefined
  const color = p.color
  const opp = other(color)

  const before = new Chess(p.before)
  const mv = new Chess(p.before).move(uciMove(p.uci))
  const after = new Chess(p.after)
  const moveNumber = Number(p.before.split(' ')[5]) || Math.ceil(ply / 2)

  const povBefore = moverPov(p.evalBefore, color)
  const povAfter = moverPov(p.evalAfter, color)
  const mateBefore = povBefore.type === 'mate' && povBefore.value !== 0 ? povBefore.value : undefined
  const mateAfter = povAfter.type === 'mate' && povAfter.value !== 0 ? povAfter.value : undefined

  const bestPv = pvToSan(p.before, p.bestPv)
  const bestSan = p.bestSan ?? bestPv[0] ?? null
  const playedPv = next?.bestPv.length
    ? pvToSan(p.after, next.bestPv)
    : p.playedLine
      ? pvToSan(p.after, p.playedLine.pv.slice(1))
      : []
  const replySan = playedPv[0]
  const bestLine = materialAlong(p.before, bestPv, color, 'gain')
  const playedLine = materialAlong(p.before, [mv.san, ...playedPv], color, 'loss')

  let gapToSecondBest: MoveFacts['gapToSecondBest']
  if (p.secondLine) {
    const second = moverPov(p.secondLine.score, color)
    gapToSecondBest = {
      winPct: winPct(povBefore) - winPct(second),
      cp: povBefore.type === 'cp' && second.type === 'cp' ? povBefore.value - second.value : undefined,
    }
  }

  // What the move does (mover's motifs).
  const motifsPlayed = tacticsOf(before, after, mv)
  if (p.loss <= REVIEW_CONFIG.brilliant.maxLoss) {
    const sac = D.detectSacrifice(after, mv)
    if (sac) motifsPlayed.push({ type: 'sacrifice', square: sac.square, value: sac.value })
    else if (mv.piece !== 'p' && -playedLine.net >= REVIEW_CONFIG.brilliant.minSacrificePawnUnits)
      motifsPlayed.push({ type: 'sacrifice', square: mv.to, value: D.VAL[mv.piece] })
  }
  if (mv.piece === 'p' && !mv.promotion && D.isPassedPawn(after, mv.to)) motifsPlayed.push({ type: 'passedPawn' })
  if (mv.promotion) motifsPlayed.push({ type: 'promotion' })
  if (mv.isKingsideCastle()) motifsPlayed.push({ type: 'castleKing' })
  if (mv.isQueensideCastle()) motifsPlayed.push({ type: 'castleQueen' })
  if (D.develops(mv, moveNumber)) motifsPlayed.push({ type: 'develops' })
  if (mv.captured && prev && prev.san.includes('x') && prev.uci.slice(2, 4) === mv.to)
    motifsPlayed.push({ type: 'recapture' })
  if (mv.captured && playedLine.captures >= 2 && playedLine.net === 0) motifsPlayed.push({ type: 'equalTrade' })
  if (D.detectKick(after, mv)) motifsPlayed.push({ type: 'kicks' })
  if (D.detectTempo(after, mv)) motifsPlayed.push({ type: 'winsTempo' })
  if (D.defendedSquares(before, after, mv).length) motifsPlayed.push({ type: 'defends' })
  if (D.backRankWeak(after, opp) && !D.backRankWeak(before, opp)) motifsPlayed.push({ type: 'backRankWeak' })

  // What the move allows (the opponent's motifs).
  const motifsAllowed: Motif[] = []
  const hung = D.newlyHanging(before, after, mv)
  if (hung.length) motifsAllowed.push({ type: 'hangs', squares: hung })
  for (const x of D.newPinsAndSkewers(before, after, opp)) {
    if (x.type === 'pin')
      motifsAllowed.push({ type: 'pin', absolute: Boolean(x.absolute), by: x.by, pinned: x.pinned!, to: x.to! })
    else motifsAllowed.push({ type: 'skewer', by: x.by, front: x.front!, behind: x.behind! })
  }
  if (replySan) {
    const afterReply = new Chess(p.after)
    const reply = afterReply.move(replySan)
    const seen = new Set(motifsAllowed.map((m) => JSON.stringify(m)))
    for (const m of tacticsOf(after, afterReply, reply)) if (!seen.has(JSON.stringify(m))) motifsAllowed.push(m)
  }
  if (D.backRankWeak(after, color) && !D.backRankWeak(before, color)) motifsAllowed.push({ type: 'backRankWeak' })

  // What the engine's best move would have done.
  let motifsBest: Motif[] = []
  if (bestPv[0]) {
    const afterBest = new Chess(p.before)
    const bm = afterBest.move(bestPv[0])
    motifsBest = tacticsOf(before, afterBest, bm)
  }

  let opening: MoveFacts['opening']
  const found = safeLookup(p.after)
  if (found) opening = { eco: found.eco, name: found.name, isNewName: safeLookup(p.before)?.name !== found.name }

  return {
    ply,
    color,
    san: mv.san,
    uci: p.uci,
    piece: mv.piece,
    from: mv.from,
    to: mv.to,
    captured: mv.captured,
    promotion: mv.promotion,
    isCheck: /[+#]$/.test(mv.san),
    isMate: mv.san.endsWith('#'),
    isUserMove: color === userColor,
    classification: p.classification,
    reasonCode: p.reasonCode,
    povBefore,
    povAfter,
    winBefore: p.winBefore,
    winAfter: p.winAfter,
    loss: p.loss,
    bestSan,
    bestPv,
    bestMaterialGain: bestLine.net,
    bestLeadsToMateIn: mateBefore !== undefined && mateBefore > 0 ? mateBefore : undefined,
    playedPv,
    replySan,
    playedMaterialLoss: -playedLine.net,
    replyIsMate: D.hangsMate(after),
    opponentMateIn: mateAfter !== undefined && mateAfter < 0 ? -mateAfter : undefined,
    mateBefore,
    mateAfter,
    gapToSecondBest,
    legalMoveCount: before.moves().length,
    motifsPlayed,
    motifsAllowed,
    motifsBest,
    opening,
    depthReached: p.depth,
    depthTarget: review.engine.depth,
    previous: prev && {
      classification: prev.classification,
      san: prev.san,
      loss: prev.loss,
      opponentGain: p.winBefore - (100 - prev.winBefore),
    },
    fenBefore: p.before,
    fenAfter: p.after,
  }
}

