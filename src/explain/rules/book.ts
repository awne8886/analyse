// Book rule (PROMPT.md Appendix E.4, "Book"): the opening name only, never engine commentary.
import { rule, type Proof, type Rule } from './shared'

export const book = rule({
  code: 'Book',
  needsDepth: false,
  when: () => true,
  prove: (f): Proof =>
    f.opening
      ? {
          tpl: 'book',
          cites: { eco: f.opening.eco, opening: f.opening.name },
          squares: [],
          vars: { name: f.opening.name, eco: f.opening.eco },
        }
      : { tpl: 'bookNoName', cites: { opening: 'unknown' }, squares: [], vars: {} },
})

export const BOOK_RULES: Rule[] = [book]
