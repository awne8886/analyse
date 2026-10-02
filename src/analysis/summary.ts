// B.10 summary sentence (original wording, first template form):
// "{You|White} played with {acc}% accuracy: {n1} {label1}{, n2 label2}{, and n3 label3}." or, when the user's
// Brilliant, Great, Miss and Blunder counts are all zero, "{You|White} played with {acc}% accuracy and no blunders."
import type { Voice } from '../types/explain'
import type { GameReview } from '../types/review'

const COUNTED = [
  ['brilliant', 'brilliant move', 'brilliant moves'],
  ['great', 'great move', 'great moves'],
  ['miss', 'miss', 'misses'],
  ['blunder', 'blunder', 'blunders'],
] as const

export function summarySentence(review: GameReview, userColor: 'w' | 'b', voice: Voice): string {
  const side = userColor === 'w' ? 'white' : 'black'
  const subject = voice === 'personal' ? 'You' : userColor === 'w' ? 'White' : 'Black'
  const acc = review.accuracy[side]
  if (acc === undefined) return `${subject} ${voice === 'personal' ? 'have' : 'has'} no analysed moves yet.`
  const head = `${subject} played with ${acc.toFixed(1)}% accuracy`
  const parts = COUNTED.filter(([c]) => review.tally[side][c] > 0).map(([c, one, many]) => {
    const n = review.tally[side][c]
    return `${n} ${n === 1 ? one : many}`
  })
  if (!parts.length) return `${head} and no blunders.`
  const list =
    parts.length === 1
      ? parts[0]
      : parts.length === 2
        ? `${parts[0]} and ${parts[1]}`
        : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
  return `${head}: ${list}.`
}
