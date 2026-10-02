// Blunder rules (PROMPT.md Appendix E.4, "Blunder"), in binding order. A Blunder never says "wins" (E.3).
import { Chess } from 'chess.js'
import { VAL } from '../detectors'
import {
  captureLine,
  gainMaterial,
  generic,
  hasBest,
  letterAfter,
  lossMaterial,
  pieceAfter,
  rule,
  sanDest,
  swingKey,
  swingSentence,
  targetAfterReply,
  type Proof,
  type Rule,
} from './shared'

const replyProven = (f: { replySan?: string; playedPv: string[] }) =>
  Boolean(f.replySan) && f.playedPv.length >= 2

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
  when: (f) => Boolean(f.replySan) && f.motifsAllowed.some((m) => m.type === 'hangs'),
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
        if (letter && replyProven(f) && f.playedMaterialLoss >= VAL[letter])
          return {
            tpl: 'hangsPieceLine',
            cites,
            squares: [sq],
            vars: { piece, square: sq, line: captureLine(f.playedPv) },
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
    const fork = f.motifsAllowed.find((m) => m.type === 'fork')
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
    const m = f.motifsAllowed.find((x) => x.type === 'pin' || x.type === 'skewer')
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
    const m = f.motifsAllowed.find((x) => x.type === 'discoveredAttack' || x.type === 'discoveredCheck')
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
    prove: (f) => ({
      tpl,
      cites: { playedMaterialLoss: f.playedMaterialLoss, playedPv: f.playedPv },
      squares: [],
      vars: { material: lossMaterial(f), line: captureLine(f.playedPv) },
    }),
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
    if (f.bestMaterialGain >= 3)
      return {
        tpl: 'missedWinMaterial',
        cites: { bestMaterialGain: f.bestMaterialGain, bestPv: f.bestPv },
        squares: [],
        vars: { material: gainMaterial(f, f.bestPv, f.bestMaterialGain) },
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
