// Inaccuracy rules (PROMPT.md Appendix E.4, "Inaccuracy").
import { evalSwing, gettingMated, hangsMate, missedMate } from './blunder'
import { missedTactic, slowerMate } from './mistake'
import { generic, rule, type Rule } from './shared'

export const allowsCounterplay = rule({
  code: 'AllowsCounterplay',
  arrows: ['reply'],
  when: (f) => Boolean(f.replySan) && f.playedPv.length >= 2 && f.playedMaterialLoss < 1,
  prove: (f) => {
    const m = f.motifsAllowed.find((x) => x.type !== 'backRankWeak')
    if (!m) return null
    return {
      tpl: 'allowsCounterplay',
      cites: { motif: m.type, playedMaterialLoss: f.playedMaterialLoss, loss: f.loss },
      squares: [],
      vars: {},
    }
  },
})

export const INACCURACY_RULES: Rule[] = [
  hangsMate,
  gettingMated,
  missedMate,
  missedTactic('missedTacticInaccuracy'),
  allowsCounterplay,
  slowerMate,
  evalSwing,
  generic('Generic', 'inaccuracyGeneric', 'inaccuracyGenericNoBest'),
]
