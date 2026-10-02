// Rule selection (PROMPT.md Appendix E.3, R24, R25, section 3.8). `explain()` only consults the rule list of the
// final classification, so the explanation cannot contradict the badge.
import type { Explanation, MoveFacts, Voice } from '../types/explain'
import type { Classification } from '../types/review'
import { BLUNDER_RULES } from './rules/blunder'
import { BOOK_RULES } from './rules/book'
import { BRILLIANT_RULES } from './rules/brilliant'
import { FORCED_RULES } from './rules/forced'
import { GREAT_RULES } from './rules/great'
import { INACCURACY_RULES } from './rules/inaccuracy'
import { MISS_RULES } from './rules/miss'
import { MISTAKE_RULES } from './rules/mistake'
import { BEST_RULES, EXCELLENT_RULES, GOOD_RULES } from './rules/positive'
import { bestTacticGated, gateOpen, swingSentence, type Rule } from './rules/shared'
import { BOOK_ENTERS, fill, HEADLINE } from './templates'

const RULES: Record<Classification, Rule[]> = {
  brilliant: BRILLIANT_RULES,
  great: GREAT_RULES,
  best: BEST_RULES,
  excellent: EXCELLENT_RULES,
  good: GOOD_RULES,
  book: BOOK_RULES,
  inaccuracy: INACCURACY_RULES,
  mistake: MISTAKE_RULES,
  miss: MISS_RULES,
  blunder: BLUNDER_RULES,
  forced: FORCED_RULES,
}

/** Classes whose explanation carries "Best was <SAN>"; Excellent only when the best move's tactic is proven. */
export const NEEDS_BEST = new Set<Classification>(['inaccuracy', 'mistake', 'blunder', 'miss', 'good'])
/** Seeded variant choice (E.3): stable across renders. */
export const seededIndex = (ply: number, n: number) => ((ply % n) + n) % n

function bestLine(f: MoveFacts): string | undefined {
  if (f.bestSan === null || f.bestSan === f.san) return undefined
  const named =
    NEEDS_BEST.has(f.classification) || (f.classification === 'excellent' && bestTacticGated(f) !== null)
  return named ? `Best was ${f.bestSan}` : undefined
}

/** E.4 "Second sentence": the book transition, or the E.7 swing sentence when a bucket boundary was crossed. */
function secondSentence(f: MoveFacts, voice: Voice, rule: Rule, gate: boolean): string[] {
  if (f.classification === 'book')
    return f.opening?.isNewName ? [fill(BOOK_ENTERS, { name: f.opening.name })] : []
  if (!gate || rule.swing) return []
  const swing = swingSentence(f, voice)
  return swing ? [swing] : []
}

export function explain(f: MoveFacts, voice: Voice): Explanation {
  const headline = `${f.san} ${HEADLINE[f.classification]}`
  const gate = gateOpen(f)
  for (const rule of RULES[f.classification]) {
    if (rule.needsDepth && !gate) continue
    if (!rule.when(f)) continue
    const proof = rule.prove(f) // must cite engine data
    if (!proof) continue
    const variants = rule.text(f, proof, voice)
    const sentence = variants[seededIndex(f.ply, variants.length)]
    return {
      headline,
      sentences: [sentence, ...secondSentence(f, voice, rule, gate)],
      bestLine: bestLine(f),
      arrows: [{ from: f.from, to: f.to, kind: 'played' }, ...rule.arrows(f, proof)],
      highlights: proof.squares,
      reasonCode: rule.code,
    }
  }
  throw new Error('unreachable: generic rule always matches')
}
