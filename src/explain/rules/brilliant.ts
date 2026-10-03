// Brilliant rules (PROMPT.md Appendix E.4, "Brilliant"): every claim starts from the sacrifice motif.
import { REVIEW_CONFIG } from '../../analysis'
import type { Motif, MoveFacts } from '../../types/explain'
import {
  describeTactic,
  gainCount,
  generic,
  materialOf,
  numberedLine,
  pieceAfter,
  pieceBefore,
  playedMotifProven,
  rule,
  type Rule,
} from './shared'

type Sacrifice = Extract<Motif, { type: 'sacrifice' }>
const sacOf = (f: MoveFacts) => f.motifsPlayed.find((m): m is Sacrifice => m.type === 'sacrifice')
const SAC_TACTICS = new Set(['fork', 'pin', 'skewer', 'discoveredAttack', 'discoveredCheck', 'mateThreat'])

/**
 * Mate distance of the played move (L9): `mateAfter` when the move keeps a forced mate. Facts without a board
 * (the hand-written E.5 fixtures) that give no score after the move fall back to the best line's distance.
 */
function playedMateIn(f: MoveFacts): number | null {
  if (f.mateAfter !== undefined) return f.mateAfter > 0 ? f.mateAfter : null
  if (!f.fenBefore && (f.bestLeadsToMateIn ?? 0) > 0) return f.bestLeadsToMateIn!
  return null
}

export const sacMate = rule({
  code: 'Brilliant(Sacrifice)+Mate',
  when: (f) => Boolean(sacOf(f)) && playedMateIn(f) !== null,
  prove: (f) => {
    const sac = sacOf(f)!
    const n = playedMateIn(f)!
    return {
      tpl: 'sacMate',
      cites: { sacrifice: sac.square, mateAfter: n },
      squares: [sac.square],
      vars: { piece: pieceAfter(f, sac.square), square: sac.square, n: String(n) },
    }
  },
})

export const sacMaterial = rule({
  code: 'Brilliant(Sacrifice)+Material',
  when: (f) => Boolean(sacOf(f)),
  prove: (f) => {
    const sac = sacOf(f)!
    const c = gainCount(f)
    const after = c.shown.slice(1) // the counted plies after the sacrifice, quoted as {pv}
    if (c.net < 1 || after.length === 0 || after.length > 5) return null
    return {
      tpl: 'sacMaterial',
      cites: { sacrifice: sac.square, netGain: c.net, counted: c.shown },
      squares: [sac.square],
      vars: {
        piece: pieceAfter(f, sac.square),
        square: sac.square,
        pv: numberedLine(f, 1, after),
        material: materialOf(c),
      },
    }
  },
})

export const sacTactic = rule({
  code: 'Brilliant(Sacrifice)+Tactic',
  when: (f) => Boolean(sacOf(f)) && f.loss <= REVIEW_CONFIG.brilliant.maxLoss,
  prove: (f) => {
    const sac = sacOf(f)!
    for (const m of f.motifsPlayed) {
      if (!SAC_TACTICS.has(m.type) || !playedMotifProven(f, m)) continue
      const t = describeTactic(
        m,
        (sq) => pieceAfter(f, sq),
        (sq) => pieceBefore(f, sq),
      )
      if (t)
        return {
          tpl: 'sacTactic',
          cites: { sacrifice: sac.square, motif: m.type, loss: f.loss },
          squares: [sac.square, ...t.squares],
          vars: { piece: pieceAfter(f, sac.square), square: sac.square, tacIng: t.ing },
        }
    }
    return null
  },
})

export const BRILLIANT_RULES: Rule[] = [
  sacMate,
  sacMaterial,
  sacTactic,
  generic('Brilliant', 'brilliantGeneric', 'brilliantGeneric'),
]
