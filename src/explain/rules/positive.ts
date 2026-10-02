// Best, Excellent and Good rules (PROMPT.md Appendix E.4, "Best", "Excellent and Good"). Excellent runs the Best
// list and wraps the description of the move in its own sentence.
import type { MoveFacts } from '../../types/explain'
import { defendedSquares, detectKick, detectTempo } from '../detectors'
import { describeMaterial, PIECE_NAME, type TemplateId } from '../templates'
import { missedTactic } from './mistake'
import {
  bestTacticGated,
  boards,
  gainMaterial,
  generic,
  hasBest,
  pieceAfter,
  pieceBefore,
  playedGain,
  playedGainLine,
  playedTactic,
  pvShort,
  rule,
  type Proof,
  type Rule,
} from './shared'

type Positive = Proof & { pd: string }
interface PositiveDef {
  code: string
  needsDepth?: boolean
  arrows?: Array<'best' | 'reply' | 'threat'>
  when: (f: MoveFacts) => boolean
  prove: (f: MoveFacts) => Positive | null
}
const has = (f: MoveFacts, type: string) => f.motifsPlayed.some((m) => m.type === type)

const DEFS: PositiveDef[] = [
  {
    code: 'Checkmate',
    needsDepth: false,
    when: (f) => f.isMate,
    prove: () => ({
      tpl: 'checkmate',
      cites: { isMate: true },
      squares: [],
      vars: {},
      pd: 'delivers checkmate',
    }),
  },
  {
    code: 'StillMate',
    when: (f) => (f.mateBefore ?? 0) > 0 && (f.mateAfter ?? 0) > 0 && f.mateAfter! < f.mateBefore!,
    prove: (f) => ({
      tpl: 'stillMate',
      cites: { mateBefore: f.mateBefore!, mateAfter: f.mateAfter! },
      squares: [],
      vars: { n: String(f.mateAfter) },
      pd: `keeps a forced mate in ${f.mateAfter}`,
    }),
  },
  {
    code: 'MateThreat',
    arrows: ['threat'],
    when: (f) => has(f, 'mateThreat'),
    prove: (f) => {
      const m = f.motifsPlayed.find((x) => x.type === 'mateThreat')
      if (!m || m.type !== 'mateThreat') return null
      return {
        tpl: 'mateThreat',
        cites: { matesInOneIfPass: m.san },
        squares: [],
        vars: { threat: m.san },
        pd: `threatens ${m.san}`,
      }
    },
  },
  {
    code: 'Fork|Pin|Skewer|Discovered',
    when: (f) => f.motifsPlayed.length > 0,
    prove: (f) => {
      const t = playedTactic(f, ['fork', 'skewer', 'pin', 'discoveredAttack', 'discoveredCheck', 'trapped'])
      if (!t) return null
      return {
        tpl: 'tactic',
        cites: { motif: t.motif.type, netGain: playedGain(f) },
        squares: t.squares,
        vars: { tacIng: t.ing },
        pd: t.s,
      }
    },
  },
  {
    code: 'FreePiece',
    when: (f) => has(f, 'freePiece') && playedGain(f) >= 1,
    prove: (f) => {
      const m = f.motifsPlayed.find((x) => x.type === 'freePiece')
      if (!m || m.type !== 'freePiece') return null
      const piece = pieceBefore(f, m.square)
      return {
        tpl: 'freePiece',
        cites: { freePiece: m.square, netGain: playedGain(f) },
        squares: [m.square],
        vars: { piece, square: m.square },
        pd: `picks up a free ${piece}`,
      }
    },
  },
  {
    code: 'WinsMaterial',
    when: (f) => playedGain(f) >= 1,
    prove: (f) => {
      const line = playedGainLine(f)
      const material = gainMaterial(f, line, playedGain(f))
      const pv = pvShort(f, 0, line)
      return {
        tpl: 'winsMaterial',
        cites: { netGain: playedGain(f), line },
        squares: [],
        vars: { material, pv, net: describeMaterial(playedGain(f)) },
        pd: `wins ${material} after ${pv}`,
      }
    },
  },
  {
    code: 'CaptureThreat|WinsTempo',
    when: (f) => has(f, 'winsTempo') || has(f, 'kicks'),
    prove: (f) => {
      const b = boards(f)
      const sq = b && (detectTempo(b.after, b.move) ?? detectKick(b.after, b.move))
      if (!sq) return null
      const target = pieceAfter(f, sq)
      return {
        tpl: 'winsTempo',
        cites: { attacked: sq, loss: f.loss },
        squares: [sq],
        vars: { target },
        pd: `attacks the ${target} and gains time`,
      }
    },
  },
  {
    code: 'DefendsPiece',
    when: (f) => has(f, 'defends'),
    prove: (f) => {
      const b = boards(f)
      const sq = b && defendedSquares(b.before, b.after, b.move)[0]
      if (!sq) return null
      const piece = pieceAfter(f, sq)
      return {
        tpl: 'defends',
        cites: { defended: sq },
        squares: [sq],
        vars: { piece, square: sq },
        pd: `covers the ${piece} on ${sq}`,
      }
    },
  },
  {
    code: 'Recapture',
    needsDepth: false,
    when: (f) => has(f, 'recapture') && Boolean(f.captured),
    prove: (f) => {
      const piece = PIECE_NAME[f.captured!]
      return {
        tpl: 'recapture',
        cites: { recapture: f.to },
        squares: [f.to],
        vars: { piece },
        pd: `takes back the ${piece}`,
      }
    },
  },
  {
    code: 'EqualTrade',
    when: (f) => has(f, 'equalTrade'),
    prove: (f) => ({
      tpl: 'equalTrade',
      cites: { playedMaterialLoss: f.playedMaterialLoss },
      squares: [],
      vars: {},
      pd: 'keeps material level with an even trade',
    }),
  },
  {
    code: 'Develops',
    needsDepth: false,
    when: (f) => has(f, 'develops'),
    prove: (f) => {
      const piece = PIECE_NAME[f.piece]
      return {
        tpl: 'develops',
        cites: { develops: f.from },
        squares: [],
        vars: { piece },
        pd: `develops the ${piece}`,
      }
    },
  },
  {
    code: 'Castles',
    needsDepth: false,
    when: (f) => has(f, 'castleKing') || has(f, 'castleQueen'),
    prove: (f) => {
      const side = has(f, 'castleKing') ? 'kingside' : 'queenside'
      return { tpl: 'castles', cites: { castles: side }, squares: [], vars: { side }, pd: `castles ${side}` }
    },
  },
  {
    code: 'Promotion',
    needsDepth: false,
    when: (f) => has(f, 'promotion') && Boolean(f.promotion),
    prove: (f) => {
      const piece = PIECE_NAME[f.promotion!]
      return {
        tpl: 'promotion',
        cites: { promotion: f.promotion! },
        squares: [f.to],
        vars: { piece },
        pd: `promotes the pawn to a ${piece}`,
      }
    },
  },
  {
    code: 'PassedPawn',
    needsDepth: false,
    when: (f) => has(f, 'passedPawn'),
    prove: (f) => ({
      tpl: 'passedPawn',
      cites: { passedPawn: f.to },
      squares: [f.to],
      vars: { file: f.to[0] },
      pd: 'pushes the passed pawn further',
    }),
  },
]

/** The Excellent sentence names the best move only when its tactic is proven (E.4, PLAN Assumption 16c). */
const excellentTpl = (f: MoveFacts): TemplateId =>
  hasBest(f) && bestTacticGated(f) ? 'excellentWithBest' : 'excellentPlain'

function positiveRules(cls: 'best' | 'excellent'): Rule[] {
  return DEFS.map((d) =>
    rule({
      ...d,
      prove: (f) => {
        const r = d.prove(f)
        if (!r) return null
        const { pd, ...proof } = r
        return cls === 'best' ? proof : { ...proof, tpl: excellentTpl(f), vars: { ...proof.vars, pd } }
      },
    }),
  )
}

const excellentGeneric = rule({
  code: 'Generic',
  needsDepth: false,
  arrows: ['best'],
  when: () => true,
  prove: (f): Proof => {
    const t = hasBest(f) ? bestTacticGated(f) : null
    if (t)
      return {
        tpl: 'excellentGenericBest',
        cites: { motif: t.motif.type, bestMaterialGain: f.bestMaterialGain },
        squares: t.squares,
        vars: { tacS: t.s },
      }
    return { tpl: 'excellentGeneric', cites: { loss: f.loss }, squares: [], vars: {} }
  },
})

export const BEST_RULES: Rule[] = [...positiveRules('best'), generic('Generic', 'bestGeneric', 'bestGeneric')]
export const EXCELLENT_RULES: Rule[] = [...positiveRules('excellent'), excellentGeneric]
export const GOOD_RULES: Rule[] = [
  missedTactic('goodTactic'),
  generic('Generic', 'goodGeneric', 'goodGenericNoBest'),
]
