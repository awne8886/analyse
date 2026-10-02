// Rule plumbing shared by the per-class rule lists (PROMPT.md Appendix E.3 to E.7).
import { Chess, type Square } from 'chess.js'
import { REVIEW_CONFIG } from '../../analysis'
import type { Arrow, Motif, MoveFacts, Voice } from '../../types/explain'
import type { Classification } from '../../types/review'
import { withTurn } from '../detectors'
import { materialAlong } from '../facts'
import { describeMaterial, fill, PIECE_NAME, SWING, T, type SwingKey, type TemplateId } from '../templates'

/** Every concrete claim carries the engine (or board) data it rests on. */
export interface Proof {
  tpl: TemplateId
  cites: Record<string, string | number | boolean | string[]>
  squares: string[]
  vars: Record<string, string>
}
export interface Rule {
  code: string
  /** Section 3.8: rules that rest on engine data run only when the depth gate is open. */
  needsDepth: boolean
  /** The sentence is itself an eval-swing sentence, so no E.7 second sentence is added. */
  swing: boolean
  when: (f: MoveFacts) => boolean
  prove: (f: MoveFacts) => Proof | null
  text: (f: MoveFacts, p: Proof, voice: Voice) => string[]
  arrows: (f: MoveFacts, p: Proof) => Arrow[]
}

type ArrowKind = 'best' | 'reply' | 'threat'
export function rule(def: {
  code: string
  needsDepth?: boolean
  swing?: boolean
  arrows?: ArrowKind[]
  when: (f: MoveFacts) => boolean
  prove: (f: MoveFacts) => Proof | null
}): Rule {
  return {
    code: def.code,
    needsDepth: def.needsDepth ?? true,
    swing: def.swing ?? false,
    when: def.when,
    prove: def.prove,
    text: (f, p, voice) => {
      const vars = { ...baseVars(f, voice), ...p.vars }
      const numbered: Record<string, string> = {}
      for (const [key, offset] of Object.entries(NUMBER_OFFSET))
        if (vars[key] !== undefined) numbered[key] = numberedLine(f, offset, [vars[key]])
      return T[p.tpl][voice].map((t) => fill(t, vars, numbered))
    },
    arrows: (f, p) => (def.arrows ?? []).flatMap((kind) => arrowFor(f, p, kind)),
  }
}

/** Generic rule of a class: always proves; names the best move when there is one that differs from the move. */
export function generic(code: string, withBest: TemplateId, noBest: TemplateId): Rule {
  return rule({
    code,
    needsDepth: false,
    arrows: ['best'],
    when: () => true,
    prove: (f) => ({ tpl: hasBest(f) ? withBest : noBest, cites: { bestSan: f.bestSan ?? 'none' }, squares: [], vars: {} }),
  })
}

export const hasBest = (f: MoveFacts): f is MoveFacts & { bestSan: string } =>
  f.bestSan !== null && f.bestSan !== f.san

export const gateOpen = (f: MoveFacts) => f.depthReached >= Math.min(f.depthTarget, REVIEW_CONFIG.explainDepthGate)

// --------------------------------------------------------------------------------------------------------------
// Placeholder values

function baseVars(f: MoveFacts, voice: Voice): Record<string, string> {
  const name = f.color === 'w' ? 'White' : 'Black'
  const opp = f.color === 'w' ? 'Black' : 'White'
  const vars: Record<string, string> = {
    san: f.san,
    Color: voice === 'personal' ? 'you' : name,
    OpposingColor: voice === 'personal' ? 'your opponent' : opp,
  }
  if (f.bestSan) vars.best = f.bestSan
  if (f.replySan) vars.reply = f.replySan
  if (f.previous) vars.oppLastMove = f.previous.san
  return vars
}

/** Ply offset of each SAN placeholder relative to the played move (E.6 move numbers). */
const NUMBER_OFFSET: Record<string, number> = { san: 0, best: 0, reply: 1, oppLastMove: -1, threat: 2 }

/** SAN line starting `offset` plies after the played move, with move numbers (`12.Nf3 Nf6 13.Bc4`, `12...Nf6`). */
export function numberedLine(f: MoveFacts, offset: number, sans: string[]): string {
  const fullmove = Number(f.fenBefore?.split(' ')[5])
  const moveNo = Number.isFinite(fullmove) && fullmove > 0 ? fullmove : Math.ceil(f.ply / 2)
  const start = (moveNo - 1) * 2 + (f.color === 'w' ? 0 : 1) + offset
  return sans
    .map((san, i) => {
      const h = start + i
      const num = Math.floor(h / 2) + 1
      if (h % 2 === 0) return `${num}.${san}`
      return i === 0 ? `${num}...${san}` : san
    })
    .join(' ')
}

/** `{line}`: the first plies of a line up to its last capture (at most 3 plies, at least 1). */
export function captureLine(sans: string[]): string {
  const head = sans.slice(0, 3)
  let end = 0
  head.forEach((s, i) => {
    if (s.includes('x')) end = i + 1
  })
  return head.slice(0, Math.max(1, end)).join(' ')
}

/** `{pvShort}`: 3 to 5 plies of a line, cut after its last capture, with move numbers. */
export function pvShort(f: MoveFacts, offset: number, sans: string[]): string {
  const head = sans.slice(0, 5)
  let end = 0
  head.forEach((s, i) => {
    if (s.includes('x') || s.includes('=')) end = i + 1
  })
  return numberedLine(f, offset, head.slice(0, Math.max(Math.min(3, head.length), end)))
}

const boardOf = (fen?: string): Chess | null => {
  if (!fen) return null
  try {
    return new Chess(fen)
  } catch {
    return null
  }
}
const play = (fen: string | undefined, san: string | undefined) => {
  const c = boardOf(fen)
  if (!c || !san) return null
  try {
    const move = c.move(san)
    return { board: c, move }
  } catch {
    return null
  }
}
/** Destination square of a SAN (`Qxf3+` -> `f3`); castling has none. */
export const sanDest = (san: string) => san.match(/[a-h][1-8]/g)?.at(-1)

const nameOf = (letter: string | undefined) => (letter ? PIECE_NAME[letter] : 'piece')
/** Name of the piece on `sq` before the move ("piece" only when the type is unknown). */
export function pieceBefore(f: MoveFacts, sq: string): string {
  const onBoard = boardOf(f.fenBefore)?.get(sq as Square)?.type
  return nameOf(onBoard ?? (sq === f.to && f.captured ? f.captured : sq === f.from ? f.piece : undefined))
}
/** Letter of the piece on `sq` after the move, when known. */
export function letterAfter(f: MoveFacts, sq: string): string | undefined {
  return boardOf(f.fenAfter)?.get(sq as Square)?.type ?? (sq === f.to ? (f.promotion ?? f.piece) : undefined)
}
/** Name of the piece on `sq` after the move. */
export const pieceAfter = (f: MoveFacts, sq: string): string => nameOf(letterAfter(f, sq))
/** Name of the piece on `sq` after the engine's reply. */
export function pieceAfterReply(f: MoveFacts, sq: string): string {
  const after = play(f.fenAfter, f.replySan)
  if (after) return nameOf(after.board.get(sq as Square)?.type)
  return f.replySan && sanDest(f.replySan) === sq ? 'piece' : pieceAfter(f, sq)
}
/** A fork or pin target: the piece name, or "piece on e4" when the type is unknown. */
const target = (name: string, sq: string) => (name === 'piece' ? `piece on ${sq}` : name)
/** Target name of a mover piece after the engine's reply. */
export const targetAfterReply = (f: MoveFacts, sq: string) => target(pieceAfterReply(f, sq), sq)

/** Chess.js view of the boards for rules that recompute a detector. */
export const boards = (f: MoveFacts) => {
  const before = boardOf(f.fenBefore)
  const played = play(f.fenBefore, f.san)
  return before && played ? { before, after: played.board, move: played.move } : null
}

/** `{material}` lost along the played line (mover POV), with the pieces named when the board is known. */
export function lossMaterial(f: MoveFacts): string {
  if (f.fenBefore) {
    const ml = materialAlong(f.fenBefore, [f.san, ...f.playedPv], f.color, 'loss')
    if (-ml.net === f.playedMaterialLoss) return describeMaterial(f.playedMaterialLoss, ml.lost, ml.gained, ml.captures)
  }
  return describeMaterial(f.playedMaterialLoss)
}
/** `{material}` won along `sans` played from the position before the move. */
export function gainMaterial(f: MoveFacts, sans: string[], gain: number): string {
  if (f.fenBefore) {
    const ml = materialAlong(f.fenBefore, sans, f.color, 'gain')
    if (ml.net === gain) return describeMaterial(gain, ml.gained, ml.lost, ml.captures)
  }
  return describeMaterial(gain)
}

/** Material the played move nets for the mover (positive classes): the best line when it is the best move. */
export const playedGain = (f: MoveFacts) => (f.bestSan === f.san ? f.bestMaterialGain : -f.playedMaterialLoss)
export const playedGainLine = (f: MoveFacts) => (f.bestSan === f.san ? f.bestPv : [f.san, ...f.playedPv])

// --------------------------------------------------------------------------------------------------------------
// Tactics (E.6 `{tacticDescription}`), as an "-ing" phrase and a third-person verb phrase

export interface Tactic {
  motif: Motif
  ing: string
  s: string
  squares: string[]
}
const TACTIC_ORDER = [
  'fork',
  'skewer',
  'pin',
  'discoveredAttack',
  'discoveredCheck',
  'trapped',
  'freePiece',
  'mateThreat',
] as const

/** `names` maps a square to a piece name on the relevant board; `captured` names a piece taken on its square. */
export function describeTactic(
  m: Motif,
  names: (sq: string) => string,
  captured: (sq: string) => string,
): Tactic | null {
  const t = (sq: string) => target(names(sq), sq)
  switch (m.type) {
    case 'fork': {
      const [a, b] = m.targets
      return {
        motif: m,
        ing: `forking the ${t(a)} and ${t(b)}`,
        s: `forks the ${t(a)} and ${t(b)}`,
        squares: [m.by, ...m.targets],
      }
    }
    case 'pin': {
      const link = m.absolute ? 'to' : 'against'
      return {
        motif: m,
        ing: `pinning the ${t(m.pinned)} ${link} the ${t(m.to)}`,
        s: `pins the ${t(m.pinned)} ${link} the ${t(m.to)}`,
        squares: [m.by, m.pinned, m.to],
      }
    }
    case 'skewer':
      return {
        motif: m,
        ing: `skewering the ${t(m.front)} and winning the ${t(m.behind)}`,
        s: `skewers the ${t(m.front)} and wins the ${t(m.behind)}`,
        squares: [m.by, m.front, m.behind],
      }
    case 'discoveredAttack':
      return {
        motif: m,
        ing: `uncovering an attack on the ${t(m.target)}`,
        s: `uncovers an attack on the ${t(m.target)}`,
        squares: [...m.by, m.target],
      }
    case 'discoveredCheck':
      return {
        motif: m,
        ing: 'giving a discovered check',
        s: 'gives a discovered check',
        squares: [...m.by, m.target],
      }
    case 'mateThreat':
      return { motif: m, ing: `threatening ${m.san}`, s: `threatens ${m.san}`, squares: [] }
    case 'freePiece':
      return {
        motif: m,
        ing: `picking up the undefended ${captured(m.square)} on ${m.square}`,
        s: `picks up the undefended ${captured(m.square)} on ${m.square}`,
        squares: [m.square],
      }
    case 'trapped':
      return {
        motif: m,
        ing: `trapping the ${names(m.square)} on ${m.square}`,
        s: `traps the ${names(m.square)} on ${m.square}`,
        squares: [m.square],
      }
    default:
      return null
  }
}

function firstTactic(
  motifs: Motif[],
  agreed: (m: Motif) => boolean,
  names: (sq: string) => string,
  captured: (sq: string) => string,
  types: readonly string[] = TACTIC_ORDER,
): Tactic | null {
  for (const type of types)
    for (const m of motifs)
      if (m.type === type && agreed(m)) {
        const d = describeTactic(m, names, captured)
        if (d) return d
      }
  return null
}

/** The best move's tactic, claimed only when the engine's best line agrees (material or mate). */
export function bestTactic(f: MoveFacts, minGain = 1): Tactic | null {
  return firstTactic(
    f.motifsBest,
    (m) =>
      m.type === 'mateThreat'
        ? (f.bestLeadsToMateIn ?? 0) > 0 || f.bestMaterialGain >= minGain
        : f.bestMaterialGain >= minGain,
    (sq) => pieceBefore(f, sq),
    (sq) => pieceBefore(f, sq),
  )
}
/** `bestTactic` behind the depth gate (the Excellent sentence and the Excellent best line). */
export const bestTacticGated = (f: MoveFacts) => (gateOpen(f) ? bestTactic(f) : null)
/** The played move's tactic, claimed only when the played line agrees. */
export function playedTactic(f: MoveFacts, types: readonly string[] = TACTIC_ORDER): Tactic | null {
  return firstTactic(
    f.motifsPlayed,
    (m) => (m.type === 'mateThreat' ? (f.mateAfter ?? 0) > 0 || playedGain(f) >= 1 : playedGain(f) >= 1),
    (sq) => pieceAfter(f, sq),
    (sq) => pieceBefore(f, sq),
    types,
  )
}
/** The opponent's tactic after the reply, claimed only when the played line shows its consequence. */
export function allowedTactic(f: MoveFacts): Tactic | null {
  return firstTactic(
    f.motifsAllowed,
    () => f.playedMaterialLoss >= 1 || f.opponentMateIn !== undefined,
    (sq) => pieceAfterReply(f, sq),
    (sq) => pieceAfter(f, sq),
  )
}

// --------------------------------------------------------------------------------------------------------------
// E.7 eval swing

/** 4 winning (>= 80), 3 better (>= 60), 2 equal, 1 worse (> 20), 0 losing (<= 20); mover POV win%. */
export const bucket = (w: number) => (w >= 80 ? 4 : w >= 60 ? 3 : w > 40 ? 2 : w > 20 ? 1 : 0)
const WORSENING = new Set<Classification>(['inaccuracy', 'mistake', 'blunder', 'miss'])
const IMPROVING = new Set<Classification>(['brilliant', 'great', 'best', 'excellent'])

export function swingKey(f: MoveFacts): SwingKey | null {
  const b = bucket(f.winBefore)
  const a = bucket(f.winAfter)
  if (a < b && WORSENING.has(f.classification)) {
    if (b === 4) return a >= 2 ? 'winningToCloser' : 'winningToPressure'
    if (b === 3) return a === 2 ? 'edgeGone' : 'betterToWorse'
    if (b === 2) return a === 1 ? 'levelToWorse' : 'levelToLost'
    return 'worseToLost'
  }
  if (a > b && IMPROVING.has(f.classification)) {
    if (a === 2) return 'climbedBack'
    if (a === 4 && b === 3) return 'grown'
    if (a >= 3) return 'upperHand'
  }
  return null
}
export function swingSentence(f: MoveFacts, voice: Voice): string | null {
  const key = swingKey(f)
  return key ? fill(SWING[key][voice], baseVars(f, voice)) : null
}

// --------------------------------------------------------------------------------------------------------------
// Arrows

function arrowFor(f: MoveFacts, p: Proof, kind: ArrowKind): Arrow[] {
  let res: { move: { from: string; to: string } } | null = null
  if (kind === 'best') res = hasBest(f) ? play(f.fenBefore, f.bestSan) : null
  if (kind === 'reply') res = play(f.fenAfter, p.vars.reply ?? f.replySan)
  if (kind === 'threat') {
    const after = boardOf(f.fenAfter)
    res = after && p.vars.threat ? play(withTurn(after, f.color).fen(), p.vars.threat) : null
  }
  return res ? [{ from: res.move.from, to: res.move.to, kind }] : []
}
