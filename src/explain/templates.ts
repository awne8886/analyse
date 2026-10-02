// Explanation wording (PROMPT.md Appendix E.4, E.6, E.7, R25). Original wording only: never chess.com's sentences.
// Each entry holds at least two variants per voice; the variant is chosen by `ply % n` (E.3). The first variant of
// a rule is the E.4 catalogue sentence where the catalogue gives one.
import type { Classification } from '../types/review'
import type { Voice } from '../types/explain'

export type Variants = Record<Voice, string[]>

/** R25 headline suffixes: `${san} ${HEADLINE[c]}`. */
export const HEADLINE: Record<Classification, string> = {
  brilliant: 'is brilliant',
  great: 'is a great move',
  best: 'is best',
  excellent: 'is excellent',
  good: 'is good',
  book: 'is a book move',
  inaccuracy: 'is an inaccuracy',
  mistake: 'is a mistake',
  miss: 'is a miss',
  blunder: 'is a blunder',
  forced: 'is forced',
}

export const PIECE_NAME: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}
const ARTICLE: Record<string, string> = { p: 'a pawn', n: 'a knight', b: 'a bishop', r: 'a rook', q: 'the queen' }

/**
 * `{material}` (E.6). `n` is the net value in pawn units; `lost` / `gained` are the piece letters the losing side
 * gave up and took back during the sequence (when known); `captures` the number of captures in the sequence.
 */
export function describeMaterial(n: number, lost: string[] = [], gained: string[] = [], captures = 0): string {
  const v = Math.round(n)
  if (captures > 3) return `material (about ${v} pawns)`
  if (v >= 10) return 'decisive material'
  const L = [...lost]
  const G: string[] = []
  for (const g of gained) {
    const i = L.indexOf(g)
    if (i >= 0) L.splice(i, 1)
    else G.push(g)
  }
  if (L.length === 1 && G.length === 0) return ARTICLE[L[0]] ?? `material (about ${v} pawns)`
  if (L.length === 1 && G.length === 1) {
    if (L[0] === 'r' && (G[0] === 'n' || G[0] === 'b')) return 'the exchange'
    return `${ARTICLE[L[0]]} for ${G[0] === 'q' ? 'a queen' : ARTICLE[G[0]]}`
  }
  if (L.length === 2 && G.length === 0 && L[0] === 'p' && L[1] === 'p') return 'two pawns'
  const byValue: Record<number, string> = { 1: 'a pawn', 2: 'two pawns', 3: 'a minor piece', 5: 'a rook', 9: 'the queen' }
  return byValue[v] ?? `material (about ${v} pawns)`
}

/**
 * Fills `{key}` placeholders. A placeholder that opens the sentence uses the move-numbered form from `numbered`
 * when one exists (E.6: `12.Nf3`, `12...Nf6`). A missing key is a programming error.
 */
export function fill(tpl: string, vars: Record<string, string>, numbered: Record<string, string> = {}): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, key: string, offset: number) => {
    if (offset === 0 && numbered[key] !== undefined) return numbered[key]
    const v = vars[key]
    if (v === undefined) throw new Error(`explain: missing placeholder {${key}} in "${tpl}"`)
    return v
  })
}

// --------------------------------------------------------------------------------------------------------------
// E.7 eval-swing sentences. Buckets (mover POV win%): 4 winning >= 80, 3 better >= 60, 2 equal > 40, 1 worse > 20,
// 0 losing. Impersonal sentences carry {Color}; the personal ones are written out with correct grammar.

export type SwingKey =
  | 'winningToCloser'
  | 'winningToPressure'
  | 'edgeGone'
  | 'betterToWorse'
  | 'levelToWorse'
  | 'levelToLost'
  | 'worseToLost'
  | 'climbedBack'
  | 'upperHand'
  | 'grown'
export const SWING: Record<SwingKey, { impersonal: string; personal: string }> = {
  winningToCloser: {
    impersonal: '{Color} was winning; the game is now much closer.',
    personal: 'You were winning; the game is now much closer.',
  },
  winningToPressure: {
    impersonal: '{Color} was winning and is now the side under pressure.',
    personal: 'You were winning and are now the side under pressure.',
  },
  edgeGone: {
    impersonal: 'The edge {Color} held is gone; the position is roughly level.',
    personal: 'The edge you held is gone; the position is roughly level.',
  },
  betterToWorse: {
    impersonal: '{Color} has gone from better to worse in one move.',
    personal: 'You have gone from better to worse in one move.',
  },
  levelToWorse: {
    impersonal: 'From a level game, {Color} is now the side with problems.',
    personal: 'From a level game, you are now the side with problems.',
  },
  levelToLost: {
    impersonal: 'From a level game, {Color} has slipped into a lost position.',
    personal: 'From a level game, you have slipped into a lost position.',
  },
  worseToLost: {
    impersonal: '{Color} was already worse; now the position is lost.',
    personal: 'You were already worse; now the position is lost.',
  },
  climbedBack: {
    impersonal: '{Color} has climbed back to a level game.',
    personal: 'You have climbed back to a level game.',
  },
  upperHand: {
    impersonal: '{Color} now holds the upper hand.',
    personal: 'You now hold the upper hand.',
  },
  grown: {
    impersonal: 'The advantage {Color} held has grown into a winning one.',
    personal: 'The advantage you held has grown into a winning one.',
  },
}

export const BOOK_ENTERS = 'This enters the {name}.'

// --------------------------------------------------------------------------------------------------------------
// Rule sentences, keyed by template id. Placeholders per E.6; extra ones: {n} mate distance, {line} the reply and
// the following captures, {pv} a move-numbered PV excerpt, {tacIng}/{tacS} the tactic as "-ing" / third-person verb
// phrase, {pd} a third-person positive description, {clause} an optional "; anything else ..." tail.

export const T = {
  // Blunder
  hangsMate: {
    impersonal: ['This hangs mate: {reply} is checkmate.', 'After this, {reply} ends the game.'],
    personal: ['Oh no, {reply} would be checkmate.', 'This walks into {reply}, checkmate.'],
  },
  gettingMated: {
    impersonal: [
      'This allows a forced mate in {n}, beginning with {reply}.',
      'From here {reply} starts a forced mate in {n}.',
    ],
    personal: [
      'Your opponent now has a forced checkmate in {n}, starting with {reply}.',
      'This lets your opponent force mate in {n}, beginning with {reply}.',
    ],
  },
  hangsPiece: {
    impersonal: [
      'This leaves the {piece} on {square} hanging; {reply} simply takes it.',
      'The {piece} on {square} is left loose, and {reply} picks it off.',
    ],
    personal: [
      'This hangs your {piece} on {square} to {reply}.',
      'Your {piece} on {square} is left loose, and {reply} picks it off.',
    ],
  },
  hangsPieceLine: {
    impersonal: [
      'This leaves the {piece} on {square} hanging; after {line} it is lost.',
      'The {piece} on {square} cannot be held once {line} is played.',
    ],
    personal: [
      'This hangs your {piece} on {square}; after {line} it is gone.',
      'Your {piece} on {square} cannot be held once {line} is played.',
    ],
  },
  permitsFork: {
    impersonal: ['This allows {reply}, forking the {t1} and {t2}.', 'This runs into {reply}, a fork of the {t1} and {t2}.'],
    personal: [
      'This lets your opponent fork your {t1} and {t2} with {reply}.',
      'Now {reply} forks your {t1} and {t2}.',
    ],
  },
  permitsPin: {
    impersonal: [
      'This allows {reply}, {ing} the {front} {link} the {behind}.',
      'After this, {reply} comes, {ing} the {front} {link} the {behind}.',
    ],
    personal: [
      'Now {reply} {s} your {front} {link} your {behind}.',
      'This allows {reply}, which {s} your {front} {link} your {behind}.',
    ],
  },
  allowsDiscovered: {
    impersonal: ['This allows {reply}, {disc}.', 'After this, {reply} comes with {disc}.'],
    personal: ['{reply} now comes with {discYour}.', 'This lets your opponent play {reply}, {discYour}.'],
  },
  losesMaterial: {
    impersonal: ['This loses {material}: {line}.', 'This drops {material} after {line}.'],
    personal: ['This costs you {material} after {line}.', 'You lose {material} after {line}.'],
  },
  missedMate: {
    impersonal: [
      'This throws away a forced mate; {best} was mate in {n}.',
      'A forced mate slips away here: {best} was mate in {n}.',
    ],
    personal: ['You had mate in {n} with {best}.', 'You let a forced mate go; {best} was mate in {n}.'],
  },
  missedWinMaterial: {
    impersonal: ['This misses {best}, which would have won {material}.', '{best} would have won {material} here.'],
    personal: ['{best} was winning here.', 'You could have won {material} with {best}.'],
  },
  missedWinEval: {
    impersonal: ['This misses {best}, which kept a winning position.', '{best} would have kept the win in hand.'],
    personal: ['{best} was winning here.', 'You had a winning continuation in {best}.'],
  },
  evalSwing: {
    impersonal: ['{swing}', 'The balance shifts here. {swing}'],
    personal: ['{swing}', 'The balance shifts here. {swing}'],
  },
  blunderGeneric: {
    impersonal: ['A costly move; {best} kept everything under control.', 'This gives away a lot; {best} was needed.'],
    personal: ['That one hurts: {best} was the move to play.', 'A painful slip; {best} would have held things together.'],
  },
  blunderGenericNoBest: {
    impersonal: ['A costly move that changes the evaluation sharply.', 'This gives away a lot.'],
    personal: ['That one hurts.', 'A painful slip that changes the game.'],
  },

  // Mistake
  losesMaterialSoft: {
    impersonal: ['This loses {material} after {line}.', 'After {line}, {material} is gone.'],
    personal: ['This gives up {material} after {line}.', 'You give up {material} after {line}.'],
  },
  allowsTactic: {
    impersonal: ['This allows {reply}, which {tacS}.', 'After this, {reply} {tacS}.'],
    personal: ['{reply} now {tacS}.', 'This lets your opponent play {reply}, which {tacS}.'],
  },
  missedTacticMistake: {
    impersonal: ['{best} was stronger, {tacIng}.', 'The stronger {best} was available, {tacIng}.'],
    personal: ['You could have played {best}, {tacIng}.', '{best} was there for you, {tacIng}.'],
  },
  losesCastling: {
    impersonal: ['This gives up the right to castle.', 'Castling is no longer possible after this.'],
    personal: ['You can no longer castle after this.', 'This costs you the right to castle.'],
  },
  slowerMate: {
    impersonal: [
      'This still wins, but {best} was mate in {n}.',
      'Still winning, though {best} was a quicker mate in {n}.',
    ],
    personal: [
      'Still winning, but {best} was a faster mate in {n}.',
      'You are still winning, but {best} forced mate in {n}.',
    ],
  },
  mistakeGeneric: {
    impersonal: ['A clear step down from {best}.', 'This makes the position clearly worse; {best} was better.'],
    personal: [
      'Not what the position asked for; {best} was clearly stronger.',
      'You had better here: {best} was clearly stronger.',
    ],
  },
  mistakeGenericNoBest: {
    impersonal: ['A clear step down.', 'This makes the position clearly worse.'],
    personal: ['Not what the position asked for.', 'This makes your position clearly worse.'],
  },

  // Inaccuracy
  missedTacticInaccuracy: {
    impersonal: ['Better was {best}, {tacIng}.', '{best} was more precise, {tacIng}.'],
    personal: ['A better option was {best}, {tacIng}.', 'You could have played {best}, {tacIng}.'],
  },
  allowsCounterplay: {
    impersonal: [
      'This allows {reply}, which is unpleasant to meet.',
      'This hands the opponent {reply}, an awkward reply to face.',
    ],
    personal: ['This lets your opponent play {reply}, an annoying reply.', 'After this you have to deal with {reply}.'],
  },
  inaccuracyGeneric: {
    impersonal: [
      'Slightly imprecise; {best} keeps more of the position.',
      'A small slip; {best} was a little more accurate.',
    ],
    personal: ['Playable, though {best} was the more accurate move.', 'Not quite precise; {best} was a touch better.'],
  },
  inaccuracyGenericNoBest: {
    impersonal: ['Slightly imprecise.', 'A small slip.'],
    personal: ['Playable, though not the most accurate.', 'Not quite precise.'],
  },

  // Miss
  missedMateInOne: {
    impersonal: ['This misses mate in one: {best}.', 'Mate in one was on the board: {best}.'],
    personal: ['You missed mate in one: {best}.', 'You had mate in one with {best}.'],
  },
  missedForcedMate: {
    impersonal: [
      'This misses a forced mate: {best} leads to mate in {n}.',
      'A forced mate was available: {best} leads to mate in {n}.',
    ],
    personal: [
      'You missed a forced mate: {best} leads to mate in {n}.',
      'You had a forced mate: {best} leads to mate in {n}.',
    ],
  },
  missedFreePiece: {
    impersonal: [
      'This overlooks a free {piece}: {best} takes it for nothing.',
      'The {piece} on {square} was there for free, and {best} would have taken it.',
    ],
    personal: [
      'A free {piece} was there for the taking: {best} wins it outright.',
      'You could have taken the {piece} on {square} for free with {best}.',
    ],
  },
  missedTacticMiss: {
    impersonal: ['This misses {best}, {tacIng}.', '{best} was available, {tacIng}.'],
    personal: ['You missed {best}, {tacIng}.', 'You had {best}, {tacIng}.'],
  },
  missedWinsMaterial: {
    impersonal: ['This misses {best}, which wins {material}.', '{best} would have won {material}.'],
    personal: ['You missed {best}, which wins {material}.', 'You could have won {material} with {best}.'],
  },
  missGeneric: {
    impersonal: ['There was a winning move here: {best}.', 'A chance went begging: {best} was the move.'],
    personal: ['You had a winning move here: {best}.', 'You let a chance slip: {best} was the move.'],
  },
  missGenericNoBest: {
    impersonal: ['A winning chance goes begging here.', 'This lets a chance slip away.'],
    personal: ['You let a winning chance slip here.', 'You missed your chance here.'],
  },

  // Brilliant
  sacMate: {
    impersonal: [
      'Brilliant: sacrificing the {piece} on {square} forces mate in {n}.',
      'A brilliant sacrifice: the {piece} on {square} is given up, and mate in {n} follows.',
    ],
    personal: [
      'Brilliant! Giving up your {piece} on {square} forces mate in {n}.',
      'Brilliant! Your {piece} sacrifice on {square} leads to mate in {n}.',
    ],
  },
  sacMaterial: {
    impersonal: [
      'Brilliant: the {piece} on {square} can be taken, but after {pv} the material comes back with interest.',
      'Brilliant: the {piece} on {square} is offered, and after {pv} {Color} comes out ahead by {net}.',
    ],
    personal: [
      'Brilliant! Your {piece} on {square} can be taken, but after {pv} you come out ahead by {net}.',
      'Brilliant! You offer the {piece} on {square}, and after {pv} you are ahead by {net}.',
    ],
  },
  sacTactic: {
    impersonal: [
      'Brilliant: the {piece} on {square} is given up, {tacIng}.',
      'A brilliant sacrifice of the {piece}, {tacIng}.',
    ],
    personal: ['Brilliant! You give up the {piece} on {square}, {tacIng}.', 'Brilliant! Your {piece} sacrifice works, {tacIng}.'],
  },
  brilliantGeneric: {
    impersonal: [
      'A hard-to-find sacrifice and the strongest move in the position.',
      'A bold sacrifice that holds up to the deepest scrutiny.',
    ],
    personal: [
      'A hard-to-find sacrifice, and the strongest move you had.',
      'A bold sacrifice, and it holds up to the deepest scrutiny.',
    ],
  },

  // Great
  critical: {
    impersonal: [
      'Great move: this was the only move that holds the position{clause}.',
      'The only good move here{clause}.',
    ],
    personal: ['Great find: this was your only good move{clause}.', 'You found the only move that holds{clause}.'],
  },
  greatFind: {
    impersonal: ['Great: this punishes {oppLastMove} with {san}, {tacIng}.', '{san} punishes {oppLastMove} at once, {tacIng}.'],
    personal: ['Great! You punished {oppLastMove} with {san}, {tacIng}.', 'You made {oppLastMove} pay with {san}, {tacIng}.'],
  },
  foundWin: {
    impersonal: [
      'A turning point: {Color} was worse and is now {state}.',
      'The game turns here: {Color} goes from worse to {state}.',
    ],
    personal: [
      'The tide turns here: you were worse, and now you are {state}.',
      'You turn the game around: from worse to {state}.',
    ],
  },
  foundNotLosing: {
    impersonal: ['{Color} was in trouble and is now back to level.', 'A rescue: {Color} escapes to an equal game.'],
    personal: ['You were in trouble and are now back to level.', 'A rescue: you escape to an equal game.'],
  },
  greatGeneric: {
    impersonal: ['A great find that changes the course of the game.', 'A precise move that few players would find.'],
    personal: [
      'A great find; this move changes the course of the game.',
      'A precise move that few players would find; well done.',
    ],
  },

  // Best (the positive list; Excellent wraps these through `excellent*`)
  checkmate: {
    impersonal: ['Checkmate. Game over.', 'Checkmate ends the game.'],
    personal: ['Checkmate. Well played.', 'Checkmate. You finish the game in style.'],
  },
  stillMate: {
    impersonal: ['Keeps the mating attack on track: mate in {n}.', 'The mating net holds: mate in {n} remains.'],
    personal: ['Still on track: mate in {n}.', 'You keep the mating attack going: mate in {n}.'],
  },
  mateThreat: {
    impersonal: ['This threatens {threat}.', 'The threat is now {threat}.'],
    personal: ['You now threaten {threat}.', 'Now you threaten {threat}.'],
  },
  tactic: {
    impersonal: ['The best move, {tacIng}.', 'Right on target, {tacIng}.'],
    personal: ['The best move, {tacIng}.', 'You found it, {tacIng}.'],
  },
  freePiece: {
    impersonal: ['Picks up a free {piece}.', 'Takes the undefended {piece} on {square}.'],
    personal: ['You pick up a free {piece}.', 'You take the undefended {piece} on {square}.'],
  },
  winsMaterial: {
    impersonal: ['The best move: it wins {material} after {pv}.', 'This nets {material}; the point is {pv}.'],
    personal: ['The best move: you win {material} after {pv}.', 'You come out ahead by {net} after {pv}.'],
  },
  winsTempo: {
    impersonal: ['Attacks the {target} and gains time.', 'Hits the {target}, gaining a tempo.'],
    personal: ['You attack the {target} and gain time.', 'You hit the {target} and gain a tempo.'],
  },
  defends: {
    impersonal: [
      'Covers the {piece} on {square}, which was under attack.',
      'The {piece} on {square} was under attack and is now safe.',
    ],
    personal: [
      'You cover your {piece} on {square}, which was under attack.',
      'Your {piece} on {square} was under attack; now it is safe.',
    ],
  },
  recapture: {
    impersonal: ['Takes back the {piece}.', 'Recaptures the {piece} and restores the balance.'],
    personal: ['You take back the {piece}.', 'You recapture the {piece} and restore the balance.'],
  },
  equalTrade: {
    impersonal: ['An even trade.', 'A fair exchange that keeps material level.'],
    personal: ['An even trade.', 'You trade evenly and keep material level.'],
  },
  develops: {
    impersonal: ['Develops the {piece} toward the centre.', 'Brings the {piece} into play.'],
    personal: ['You develop the {piece} toward the centre.', 'You bring your {piece} into play.'],
  },
  castles: {
    impersonal: [
      'Castles, bringing the king to safety and connecting the rooks.',
      'Castles {side} and tucks the king away.',
    ],
    personal: [
      'You castle, bringing your king to safety and connecting the rooks.',
      'You castle {side} and tuck your king away.',
    ],
  },
  passedPawn: {
    impersonal: ['Pushes the passed pawn further.', 'Advances the passed pawn on the {file}-file.'],
    personal: ['You push your passed pawn further.', 'You advance your passed pawn on the {file}-file.'],
  },
  promotion: {
    impersonal: ['Promotes the pawn to a {piece}.', 'The pawn reaches the last rank and becomes a {piece}.'],
    personal: ['You promote your pawn to a {piece}.', 'Your pawn reaches the last rank and becomes a {piece}.'],
  },
  bestGeneric: {
    impersonal: ['The strongest move in the position.', 'Exactly what the position called for.'],
    personal: ['The strongest move you had; well spotted.', 'Exactly what the position called for; nicely done.'],
  },

  // Excellent
  excellentWithBest: {
    impersonal: ['Almost as strong as {best}; it {pd}.', 'Close to {best} in strength; it {pd}.'],
    personal: ['Almost as strong as {best}; it {pd}.', 'Nearly as good as {best}; your move {pd}.'],
  },
  excellentPlain: {
    impersonal: ['A strong move: it {pd}.', 'A sound choice that {pd}.'],
    personal: ['A strong move: it {pd}.', 'A sound choice; your move {pd}.'],
  },
  excellentGenericBest: {
    impersonal: ['Nearly as strong as {best}, which {tacS}.', 'Very close to the top choice, though {best} {tacS}.'],
    personal: ['Nearly as strong as {best}, which {tacS}.', 'Very close to the top choice, though {best} {tacS}.'],
  },
  excellentGeneric: {
    impersonal: ["Nearly as strong as the engine's first choice.", "A strong move, close to the engine's top line."],
    personal: ["Very close to the engine's first choice; well played.", "A strong move; you stayed close to the engine's top line."],
  },

  // Good
  goodTactic: {
    impersonal: ['A reasonable move, though {best} was stronger, {tacIng}.', 'Decent, but {best} was stronger, {tacIng}.'],
    personal: ['A fair move, though {best} was stronger, {tacIng}.', 'Not bad, but {best} was stronger, {tacIng}.'],
  },
  goodGeneric: {
    impersonal: ['A reasonable move, though {best} was stronger.', 'Decent, but {best} was a bit stronger.'],
    personal: ['A fair move, though {best} was stronger.', 'Not bad, but {best} was a bit stronger.'],
  },
  goodGenericNoBest: {
    impersonal: ['A reasonable move.', 'A decent, playable move.'],
    personal: ['A fair move.', 'A decent move; nothing wrong with it.'],
  },

  // Book and Forced
  book: {
    impersonal: ['{name} ({eco}). A known opening move.', 'A known opening move. The game follows the {name} ({eco}).'],
    personal: ['{name} ({eco}). A known opening move.', 'A known opening move. You are following the {name} ({eco}).'],
  },
  bookNoName: {
    impersonal: ['A known opening move.', 'A known opening move from established theory.'],
    personal: ['A known opening move.', 'A known opening move; you are still in theory.'],
  },
  forced: {
    impersonal: ['The only legal move.', 'The only legal move; there was no choice.'],
    personal: ['The only legal move.', 'The only legal move; you had no choice.'],
  },
} satisfies Record<string, Variants>

export type TemplateId = keyof typeof T
