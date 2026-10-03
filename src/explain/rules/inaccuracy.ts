// Inaccuracy rules (PROMPT.md Appendix E.4, "Inaccuracy"), exactly the catalogue's list. A crossed win% bucket
// still adds the E.7 swing as the second sentence (E.4 "Second sentence").
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
  missedTactic('missedTacticInaccuracy'),
  allowsCounterplay,
  slowerMate,
  generic('Generic', 'inaccuracyGeneric', 'inaccuracyGenericNoBest'),
]
