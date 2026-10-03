// Forced rule (PROMPT.md Appendix E.4, "Forced"): `legalMoveCount === 1`, read from chess.js.
import { rule, type Rule } from './shared'

export const forced = rule({
  code: 'Forced',
  needsDepth: false,
  when: () => true,
  prove: (f) => ({ tpl: 'forced', cites: { legalMoveCount: f.legalMoveCount }, squares: [], vars: {} }),
})

export const FORCED_RULES: Rule[] = [forced]
