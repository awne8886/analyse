// The variant gate of PROMPT.md section 3.3 (risk 9). Callers describe what the source says about the variant
// (`VariantFacts`); the gate maps it onto one canonical variant and looks the variant up in `SUPPORT`. Supporting
// Chess960 later means changing its row in `SUPPORT` (and teaching the replay X-FEN castling); no caller changes.
import { ImportFailure } from './errors'

export type Variant =
  | 'standard'
  | 'chess960'
  | 'bughouse'
  | 'crazyhouse'
  | 'threecheck'
  | 'kingofthehill'
  | 'antichess'
  | 'atomic'
  | 'horde'
  | 'racingkings'

export interface VariantFacts {
  /** chess.com callback `game.type` or public API `rules` */
  chesscomType?: string
  /** chess.com callback `game.partnerGameId` (set only for bughouse) */
  partnerGameId?: unknown
  /** a public API archive entry without a `pgn` key (bughouse) */
  archiveEntryWithoutPgn?: boolean
  /** lichess `variant` */
  lichessVariant?: string
  /** PGN `[Variant]` header */
  pgnVariant?: string
  /** the start FEN as the data gives it (X-FEN castling letters such as `HAha` mean Chess960) */
  startFen?: string
  /** SAN moves (PGN, lichess): any `@` is a drop */
  sanMoves?: readonly string[]
}

const DISPLAY_NAME: Record<Variant, string> = {
  standard: 'Standard',
  chess960: 'Chess960',
  bughouse: 'Bughouse',
  crazyhouse: 'Crazyhouse',
  threecheck: 'Three-check',
  kingofthehill: 'King of the Hill',
  antichess: 'Antichess',
  atomic: 'Atomic',
  horde: 'Horde',
  racingkings: 'Racing Kings',
}

const unsupported = (v: Variant) => new ImportFailure('variant_unsupported', { variant: DISPLAY_NAME[v] })

/** 'analyse' or the failure to report (I-12, I-13, I-14). */
const SUPPORT: Record<Variant, 'analyse' | (() => ImportFailure)> = {
  standard: 'analyse',
  chess960: () => new ImportFailure('variant_chess960'),
  bughouse: () => new ImportFailure('variant_unsupported', {}, { key: 'I-13' }),
  crazyhouse: () => unsupported('crazyhouse'),
  threecheck: () => unsupported('threecheck'),
  kingofthehill: () => unsupported('kingofthehill'),
  antichess: () => unsupported('antichess'),
  atomic: () => unsupported('atomic'),
  horde: () => unsupported('horde'),
  racingkings: () => unsupported('racingkings'),
}

// chess.com `type`/`rules` values (oddschess is standard rules from a custom start, I-15)
const CHESSCOM_TYPES: Record<string, Variant> = {
  chess: 'standard',
  oddschess: 'standard',
  chess960: 'chess960',
  bughouse: 'bughouse',
  crazyhouse: 'crazyhouse',
  threecheck: 'threecheck',
  kingofthehill: 'kingofthehill',
}
// lichess `variant` values
const LICHESS_VARIANTS: Record<string, Variant> = {
  standard: 'standard',
  fromPosition: 'standard',
  chess960: 'chess960',
  crazyhouse: 'crazyhouse',
  antichess: 'antichess',
  atomic: 'atomic',
  horde: 'horde',
  kingOfTheHill: 'kingofthehill',
  racingKings: 'racingkings',
  threeCheck: 'threecheck',
}
// PGN `[Variant]` values, compared lowercased without spaces, hyphens or underscores
const PGN_VARIANTS: Record<string, Variant> = {
  standard: 'standard',
  fromposition: 'standard',
  oddschess: 'standard',
  chess960: 'chess960',
  fischerandom: 'chess960',
  fischerrandom: 'chess960',
  bughouse: 'bughouse',
  crazyhouse: 'crazyhouse',
  threecheck: 'threecheck',
  '3check': 'threecheck',
  kingofthehill: 'kingofthehill',
  koth: 'kingofthehill',
  antichess: 'antichess',
  atomic: 'atomic',
  horde: 'horde',
  racingkings: 'racingkings',
}

/** X-FEN / Shredder-FEN castling field (letters other than KQkq) marks a Chess960 start. */
const hasXFenCastling = (fen: string): boolean => /[^KQkq-]/.test(fen.trim().split(/\s+/)[2] ?? '-')

/**
 * Returns the canonical variant when it can be analysed; otherwise throws the failure of its Appendix F row:
 * I-12 (Chess960), I-13 (bughouse), I-14 (other variants), I-17 (unknown chess.com type).
 */
export function gateVariant(facts: VariantFacts): Variant {
  let variant: Variant = 'standard'
  if (facts.chesscomType !== undefined && facts.chesscomType !== '') {
    if (!Object.hasOwn(CHESSCOM_TYPES, facts.chesscomType)) {
      throw new ImportFailure('type_unknown', { type: facts.chesscomType })
    }
    variant = CHESSCOM_TYPES[facts.chesscomType]
  }
  if (variant === 'standard' && facts.lichessVariant !== undefined) {
    variant = Object.hasOwn(LICHESS_VARIANTS, facts.lichessVariant)
      ? LICHESS_VARIANTS[facts.lichessVariant]
      : pgnVariant(facts.lichessVariant)
  }
  if (variant === 'standard' && facts.pgnVariant !== undefined && facts.pgnVariant.trim() !== '') {
    variant = pgnVariant(facts.pgnVariant)
  }
  if (variant === 'standard' && (facts.partnerGameId ?? null) !== null) variant = 'bughouse'
  if (variant === 'standard' && facts.archiveEntryWithoutPgn) variant = 'bughouse'
  if (variant === 'standard' && facts.startFen && hasXFenCastling(facts.startFen)) variant = 'chess960'
  if (variant === 'standard' && facts.sanMoves?.some((san) => san.includes('@'))) variant = 'crazyhouse'

  const support = SUPPORT[variant]
  if (support !== 'analyse') throw support()
  return variant
}

/** A PGN-style variant name; an unknown name is reported as written (I-14). */
function pgnVariant(name: string): Variant {
  const key = name.toLowerCase().replace(/[\s_-]/g, '')
  if (Object.hasOwn(PGN_VARIANTS, key)) return PGN_VARIANTS[key]
  throw new ImportFailure('variant_unsupported', { variant: name.trim() })
}
