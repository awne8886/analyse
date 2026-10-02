// Miss rules (PROMPT.md Appendix E.4, "Miss").
import { bestTactic, gainMaterial, generic, hasBest, pieceBefore, rule, type Rule } from './shared'

export const missedForcedMate = rule({
  code: 'MissedWin(ForcedMate)',
  arrows: ['best'],
  when: (f) => hasBest(f) && (f.bestLeadsToMateIn ?? 0) > 0,
  prove: (f) => ({
    tpl: f.bestLeadsToMateIn === 1 ? 'missedMateInOne' : 'missedForcedMate',
    cites: { bestLeadsToMateIn: f.bestLeadsToMateIn!, bestPv: f.bestPv },
    squares: [],
    vars: { n: String(f.bestLeadsToMateIn) },
  }),
})

export const missedFreePiece = rule({
  code: 'MissedWin(FreePiece)',
  arrows: ['best'],
  when: (f) => hasBest(f) && f.bestMaterialGain >= 1,
  prove: (f) => {
    const m = f.motifsBest.find((x) => x.type === 'freePiece')
    if (!m || m.type !== 'freePiece') return null
    return {
      tpl: 'missedFreePiece',
      cites: { freePiece: m.square, bestMaterialGain: f.bestMaterialGain },
      squares: [m.square],
      vars: { piece: pieceBefore(f, m.square), square: m.square },
    }
  },
})

export const missedTacticMiss = rule({
  code: 'MissedWin(Tactic)',
  arrows: ['best'],
  when: (f) => hasBest(f) && f.bestMaterialGain >= 2,
  prove: (f) => {
    const t = bestTactic(f, 2)
    if (!t || t.motif.type === 'freePiece') return null
    return {
      tpl: 'missedTacticMiss',
      cites: { motif: t.motif.type, bestMaterialGain: f.bestMaterialGain },
      squares: t.squares,
      vars: { tacIng: t.ing },
    }
  },
})

export const missedWinsMaterial = rule({
  code: 'MissedWin(Win)',
  arrows: ['best'],
  when: (f) => hasBest(f) && f.bestMaterialGain >= 1,
  prove: (f) => ({
    tpl: 'missedWinsMaterial',
    cites: { bestMaterialGain: f.bestMaterialGain, bestPv: f.bestPv },
    squares: [],
    vars: { material: gainMaterial(f, f.bestPv, f.bestMaterialGain) },
  }),
})

export const MISS_RULES: Rule[] = [
  missedForcedMate,
  missedFreePiece,
  missedTacticMiss,
  missedWinsMaterial,
  generic('MissedWin', 'missGeneric', 'missGenericNoBest'),
]
