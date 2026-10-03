// Public entry point of src/import (PROMPT.md section 4.5). Nothing else of this module crosses its boundary.
//
// IMPORT_STRINGS is keyed by the Appendix F row key: 'I-2', 'I-4', ..., 'I-27', 'I-27b' (second I-27 sentence),
// 'I-36', 'I-37', 'P-1' ... 'P-11'. Alternation placeholders are named: I-10a {kind}, I-14 {variant}, I-28 {what};
// the rest keep the appendix names ({plyCount}, {n}, {type}, {White}, {Black}, {date}, {id}, {username}, {YYYY},
// {MM}, {months}). `formatImportString(key, params)` fills them.
export { parseInput } from './parseInput'
export { importGame, confirmInProgress, type ImportOptions } from './importGame'
export { decodeTcn, applyTcnMove, tcnToMoves, TCN_ALPHABET, type TcnMove } from './tcn'
export { IMPORT_STRINGS, formatImportString } from './errors'
export { gateVariant, type Variant, type VariantFacts } from './variantGate'
export { predictLiveMonths } from './chesscomPublicApi'
export { PROXY_DOWN_KEY } from './chesscomProxy'
