// Blunder rules (PROMPT.md Appendix E.4, "Blunder"), in binding order. A Blunder never says "wins" (E.3).
import { Chess } from 'chess.js'
import { VAL } from '../detectors'
import type { MoveFacts } from '../../types/explain'
import {
  allowedMotifProven,
  bestCount,
  generic,
  hasBest,
  letterAfter,
  lossCount,
  materialOf,
  pieceAfter,
  rule,
  sanDest,
  swingKey,
  swingSentence,
  targetAfterReply,
  type Proof,
  type Rule,
} from './shared'

/** E.3 PV truncation: reply-based rules need the reply and at least one ply after it. */
const replyProven = (f: { replySan?: string; playedPv: string[] }) =>
  Boolean(f.replySan) && f.playedPv.length >= 2

/** E.6 `{materialDetail}` is at most 3 plies, so `{line}` (the reply plus the detail) is at most 4. */
const LINE_MAX = 4
/**
 * The loss along the played line and `{line}`: exactly the counted plies after the move (the reply first), which
 * hold every capture the figure rests on; null when the loss is under `min` or its window is longer than E.6 allows.
 */
function lossLine(f: MoveFacts, min: number) {
  const c = lossCount(f)
  const line = c.shown.slice(1)
  if (c.net < min || line.length === 0 || line.length > LINE_MAX) return null
  return { c, line: line.join(' ') }
}

export const hangsMate = rule({
  code: 'HangsMate',
  arrows: ['reply'],
  when: (f) => f.replyIsMate,
  prove: (f) => {
    let mate = f.replySan?.endsWith('#') ? f.replySan : undefined
    if (!mate && f.fenAfter) {
      try {
        mate = new Chess(f.fenAfter).moves().find((s) => s.endsWith('#'))
      } catch {
        mate = undefined
      }
    }
    if (!mate) return null
    return {
      tpl: 'hangsMate',
      cites: { replyIsMate: true, mateInOne: mate },
      squares: [],
      vars: { reply: mate },
    }
  },
})

export const gettingMated = rule({
  code: 'GettingMated',
  arrows: ['reply'],
  when: (f) => f.opponentMateIn !== undefined && f.mateBefore === undefined && Boolean(f.replySan),
  prove: (f) => ({
    tpl: 'gettingMated',
    cites: { opponentMateIn: f.opponentMateIn!, replySan: f.replySan! },
    squares: [],
    vars: { n: String(f.opponentMateIn) },
  }),
})

export const hangsPiece = rule({
  code: 'HangsPiece',
  arrows: ['reply'],
  when: (f) => replyProven(f) && f.motifsAllowed.some((m) => m.type === 'hangs'),
  prove: (f): Proof | null => {
    const reply = f.replySan!
    for (const m of f.motifsAllowed) {
      if (m.type !== 'hangs') continue
      for (const sq of m.squares) {
        const piece = pieceAfter(f, sq)
        const letter = letterAfter(f, sq)
        const cites = { hangs: m.squares, replySan: reply, playedMaterialLoss: f.playedMaterialLoss }
        if (reply.includes('x') && sanDest(reply) === sq)
          return { tpl: 'hangsPiece', cites, squares: [sq], vars: { piece, square: sq } }
        const lost = letter ? lossLine(f, VAL[letter]) : null
        const takenOnSq = lost && (lost.c.taken?.some((t) => !t.byMover && t.path.includes(sq)) ?? true)
        if (lost && takenOnSq)
          return {
            tpl: 'hangsPieceLine',
            cites: { ...cites, counted: lost.c.shown },
            squares: [sq],
            vars: { piece, square: sq, line: lost.line },
          }
      }
    }
    return null
  },
})

export const permitsFork = rule({
  code: 'PermitsFork',
  arrows: ['reply'],
  when: (f) => replyProven(f) && f.playedMaterialLoss >= 2,
  prove: (f) => {
    const fork = f.motifsAllowed.find((m) => m.type === 'fork' && allowedMotifProven(f, m, 2))
    if (!fork || fork.type !== 'fork') return null
    const [a, b] = fork.targets
    return {
      tpl: 'permitsFork',
      cites: { fork: fork.targets, playedMaterialLoss: f.playedMaterialLoss },
      squares: [fork.by, ...fork.targets],
      vars: { t1: targetAfterReply(f, a), t2: targetAfterReply(f, b) },
    }
  },
})

export const permitsPin = rule({
  code: 'PermitsPinOrSkewer',
  arrows: ['reply'],
  when: (f) => replyProven(f) && f.playedMaterialLoss >= 1,
  prove: (f) => {
    const m = f.motifsAllowed.find(
      (x) => (x.type === 'pin' || x.type === 'skewer') && allowedMotifProven(f, x),
    )
    if (!m || (m.type !== 'pin' && m.type !== 'skewer')) return null
    const front = m.type === 'pin' ? m.pinned : m.front
    const behind = m.type === 'pin' ? m.to : m.behind
    const verbs =
      m.type === 'skewer'
        ? { ing: 'skewering', s: 'skewers', link: 'against' }
        : { ing: 'pinning', s: 'pins', link: m.absolute ? 'to' : 'against' }
    return {
      tpl: 'permitsPin',
      cites: { [m.type]: [front, behind], playedMaterialLoss: f.playedMaterialLoss },
      squares: [m.by, front, behind],
      vars: { ...verbs, front: targetAfterReply(f, front), behind: targetAfterReply(f, behind) },
    }
  },
})

export const allowsDiscovered = rule({
  code: 'AllowsDiscovered',
  arrows: ['reply'],
  when: (f) => replyProven(f) && (f.playedMaterialLoss >= 1 || f.opponentMateIn !== undefined),
  prove: (f) => {
    const m = f.motifsAllowed.find(
      (x) => (x.type === 'discoveredAttack' || x.type === 'discoveredCheck') && allowedMotifProven(f, x),
    )
    if (!m || (m.type !== 'discoveredAttack' && m.type !== 'discoveredCheck')) return null
    const t = targetAfterReply(f, m.target)
    const check = m.type === 'discoveredCheck'
    return {
      tpl: 'allowsDiscovered',
      cites: { [m.type]: m.target, playedMaterialLoss: f.playedMaterialLoss },
      squares: [...m.by, m.target],
      vars: {
        disc: check ? 'a discovered check' : `a discovered attack on the ${t}`,
        discYour: check ? 'a discovered check' : `a discovered attack on your ${t}`,
      },
    }
  },
})

/** LosesMaterial; `tpl` picks the Blunder or the softer Mistake wording. */
export const losesMaterial = (tpl: 'losesMaterial' | 'losesMaterialSoft') =>
  rule({
    code: 'LosesMaterial',
    arrows: ['reply'],
    when: (f) => replyProven(f) && f.playedMaterialLoss >= 1,
    prove: (f) => {
      const lost = lossLine(f, 1)
      if (!lost) return null
      return {
        tpl,
        cites: { playedMaterialLoss: lost.c.net, counted: lost.c.shown },
        squares: [],
        vars: { material: materialOf(lost.c), line: lost.line },
      }
    },
  })

export const missedMate = rule({
  code: 'MissedMate',
  arrows: ['best'],
  when: (f) => hasBest(f) && (f.bestLeadsToMateIn ?? 0) > 0 && !f.isMate && !((f.mateAfter ?? 0) > 0),
  prove: (f) => ({
    tpl: 'missedMate',
    cites: { bestLeadsToMateIn: f.bestLeadsToMateIn!, mateAfter: f.mateAfter ?? 'none' },
    squares: [],
    vars: { n: String(f.bestLeadsToMateIn) },
  }),
})

export const missedWin = rule({
  code: 'MissedWin',
  arrows: ['best'],
  when: hasBest,
  prove: (f): Proof | null => {
    const c = bestCount(f)
    if (c.net >= 3)
      return {
        tpl: 'missedWinMaterial',
        cites: { bestMaterialGain: c.net, counted: c.shown },
        squares: [],
        vars: { material: materialOf(c) },
      }
    const { povBefore: b, povAfter: a } = f
    if (b.type === 'cp' && a.type === 'cp' && b.value >= 300 && a.value <= 50)
      return { tpl: 'missedWinEval', cites: { cpBefore: b.value, cpAfter: a.value }, squares: [], vars: {} }
    return null
  },
})

const swingRule = rule({
  code: 'EvalSwing',
  swing: true,
  when: (f) => swingKey(f) !== null,
  prove: (f) => ({
    tpl: 'evalSwing',
    cites: { winBefore: f.winBefore, winAfter: f.winAfter, bucketChange: swingKey(f)! },
    squares: [],
    vars: {},
  }),
})
/** EvalSwing: the E.7 sentence itself (its wording depends on the voice, so it is filled in `text`). */
export const evalSwing: Rule = {
  ...swingRule,
  text: (f, p, voice) => swingRule.text(f, { ...p, vars: { swing: swingSentence(f, voice)! } }, voice),
}

export const BLUNDER_RULES: Rule[] = [
  hangsMate,
  gettingMated,
  hangsPiece,
  permitsFork,
  permitsPin,
  allowsDiscovered,
  losesMaterial('losesMaterial'),
  missedMate,
  missedWin,
  evalSwing,
  generic('Generic', 'blunderGeneric', 'blunderGenericNoBest'),
]
