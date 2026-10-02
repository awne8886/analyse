// Brilliant rules (PROMPT.md Appendix E.4, "Brilliant"): every claim starts from the sacrifice motif.
import { REVIEW_CONFIG } from '../../analysis'
import type { Motif, MoveFacts } from '../../types/explain'
import { describeMaterial } from '../templates'
import {
  describeTactic,
  generic,
  pieceAfter,
  pieceBefore,
  playedGain,
  pvShort,
  rule,
  type Rule,
} from './shared'

type Sacrifice = Extract<Motif, { type: 'sacrifice' }>
const sacOf = (f: MoveFacts) => f.motifsPlayed.find((m): m is Sacrifice => m.type === 'sacrifice')
const SAC_TACTICS = new Set(['fork', 'pin', 'skewer', 'discoveredAttack', 'discoveredCheck', 'mateThreat'])

export const sacMate = rule({
  code: 'Brilliant(Sacrifice)+Mate',
  when: (f) => Boolean(sacOf(f)) && (f.bestLeadsToMateIn ?? 0) > 0,
  prove: (f) => {
    const sac = sacOf(f)!
    return {
      tpl: 'sacMate',
      cites: { sacrifice: sac.square, bestLeadsToMateIn: f.bestLeadsToMateIn! },
      squares: [sac.square],
      vars: { piece: pieceAfter(f, sac.square), square: sac.square, n: String(f.bestLeadsToMateIn) },
    }
  },
})

export const sacMaterial = rule({
  code: 'Brilliant(Sacrifice)+Material',
  when: (f) => Boolean(sacOf(f)) && playedGain(f) >= 1 && f.playedPv.length > 0,
  prove: (f) => {
    const sac = sacOf(f)!
    return {
      tpl: 'sacMaterial',
      cites: { sacrifice: sac.square, netGain: playedGain(f), playedPv: f.playedPv },
      squares: [sac.square],
      vars: {
        piece: pieceAfter(f, sac.square),
        square: sac.square,
        pv: pvShort(f, 1, f.playedPv),
        net: describeMaterial(playedGain(f)),
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
      if (!SAC_TACTICS.has(m.type)) continue
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

export const BRILLIANT_RULES: Rule[] = [sacMate, sacMaterial, sacTactic, generic('Brilliant', 'brilliantGeneric', 'brilliantGeneric')]
