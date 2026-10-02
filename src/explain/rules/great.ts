// Great rules (PROMPT.md Appendix E.4, "Great").
import { REVIEW_CONFIG } from '../../analysis'
import { bucket, generic, playedGain, playedTactic, rule, type Proof, type Rule } from './shared'

export const critical = rule({
  code: 'Critical(Find)',
  when: (f) =>
    f.gapToSecondBest !== undefined &&
    (f.gapToSecondBest.winPct >= REVIEW_CONFIG.great.minWinGap ||
      (f.gapToSecondBest.cp ?? 0) >= REVIEW_CONFIG.great.minCpGap),
  prove: (f) => {
    const gap = f.gapToSecondBest!
    const bestWin = f.winBefore // the mover's win% of the engine's first line
    const secondWin = bestWin - gap.winPct
    // secondBestConsequence, derived from the second line's score only.
    const consequence = secondWin < 0.5 ? 'allows mate' : bestWin >= 60 && secondWin < 60 ? 'loses the advantage' : ''
    return {
      tpl: 'critical',
      cites: { gapWinPct: gap.winPct, gapCp: gap.cp ?? 'none' },
      squares: [],
      vars: { clause: consequence ? `; anything else ${consequence}` : '' },
    }
  },
})

const GREAT_TACTICS = ['fork', 'pin', 'freePiece'] as const
export const greatFind = rule({
  code: 'GreatFind',
  when: (f) => f.previous !== undefined && ['mistake', 'blunder'].includes(f.previous.classification),
  prove: (f) => {
    const mate = f.isMate ? 'delivering checkmate' : (f.mateAfter ?? 0) > 0 ? `forcing mate in ${f.mateAfter}` : ''
    const t = mate ? null : playedTactic(f, GREAT_TACTICS)
    if (!mate && !t) return null
    return {
      tpl: 'greatFind',
      cites: {
        previous: f.previous!.classification,
        motif: t ? t.motif.type : 'mate',
        netGain: playedGain(f),
        mateAfter: f.mateAfter ?? 'none',
      },
      squares: t ? t.squares : [],
      vars: { tacIng: t ? t.ing : mate },
    }
  },
})

export const foundWin = rule({
  code: 'FoundWin',
  swing: true,
  when: (f) => bucket(f.winBefore) <= 1 && bucket(f.winAfter) >= 2,
  prove: (f): Proof => {
    const after = bucket(f.winAfter)
    const cites = { winBefore: f.winBefore, winAfter: f.winAfter }
    if (after === 2) return { tpl: 'foundNotLosing', cites, squares: [], vars: {} }
    return { tpl: 'foundWin', cites, squares: [], vars: { state: after === 4 ? 'winning' : 'better' } }
  },
})

export const GREAT_RULES: Rule[] = [critical, greatFind, foundWin, generic('Great', 'greatGeneric', 'greatGeneric')]
