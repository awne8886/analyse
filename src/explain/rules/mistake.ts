// Mistake rules (PROMPT.md Appendix E.4, "Mistake"): the Blunder list with softer verbs.
import { castlingRightsLost } from '../detectors'
import { evalSwing, gettingMated, hangsMate, losesMaterial, missedMate } from './blunder'
import { allowedTactic, bestTactic, boards, generic, hasBest, rule, type Rule } from './shared'

export const allowsTactic = rule({
  code: 'AllowsTactic',
  arrows: ['reply'],
  when: (f) => Boolean(f.replySan) && f.playedPv.length >= 2,
  prove: (f) => {
    const t = allowedTactic(f)
    if (!t) return null
    return {
      tpl: 'allowsTactic',
      cites: {
        motif: t.motif.type,
        playedMaterialLoss: f.playedMaterialLoss,
        opponentMateIn: f.opponentMateIn ?? 'none',
      },
      squares: t.squares,
      vars: { tacS: t.s },
    }
  },
})

/** MissedTactic: the best move had a tactic the engine line confirms; `tpl` picks the class wording. */
export const missedTactic = (tpl: 'missedTacticMistake' | 'missedTacticInaccuracy' | 'goodTactic') =>
  rule({
    code: 'MissedTactic',
    arrows: ['best'],
    when: hasBest,
    prove: (f) => {
      const t = bestTactic(f)
      if (!t) return null
      return {
        tpl,
        cites: { motif: t.motif.type, bestMaterialGain: f.bestMaterialGain, bestPv: f.bestPv },
        squares: t.squares,
        vars: { tacIng: t.ing },
      }
    },
  })

export const losesCastling = rule({
  code: 'LosesCastling',
  when: (f) => f.loss > 0 && f.piece !== 'p',
  prove: (f) => {
    const b = boards(f)
    if (!b || !castlingRightsLost(b.before, b.after, b.move)) return null
    return {
      tpl: 'losesCastling',
      cites: { castlingRightsLost: true, loss: f.loss },
      squares: [f.from],
      vars: {},
    }
  },
})

export const slowerMate = rule({
  code: 'SlowerMate',
  arrows: ['best'],
  when: (f) => hasBest(f) && (f.mateBefore ?? 0) > 0 && (f.mateAfter ?? 0) > (f.mateBefore ?? 0),
  prove: (f) => ({
    tpl: 'slowerMate',
    cites: { mateBefore: f.mateBefore!, mateAfter: f.mateAfter! },
    squares: [],
    vars: { n: String(f.mateBefore) },
  }),
})

export const MISTAKE_RULES: Rule[] = [
  hangsMate,
  gettingMated,
  losesMaterial('losesMaterialSoft'),
  allowsTactic,
  missedMate,
  missedTactic('missedTacticMistake'),
  losesCastling,
  slowerMate,
  evalSwing,
  generic('Generic', 'mistakeGeneric', 'mistakeGenericNoBest'),
]
