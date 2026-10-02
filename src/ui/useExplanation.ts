// The explanation shown for a ply, rebuilt for the current colour and coach voice (contracts section 4).
import { useMemo } from 'react'
import { explanationFor, useSettingsStore } from '../state'
import type { Explanation } from '../types/explain'
import type { GameReview } from '../types/review'

const EMPTY: Explanation = { headline: '', sentences: [], arrows: [], highlights: [], reasonCode: '' }

/** The ply's explanation in the current colour and voice; the stored one when it cannot be rebuilt. */
export function useExplanation(review: GameReview | undefined, ply: number): Explanation {
  const userColor = useSettingsStore((s) => s.userColor)
  const voice = useSettingsStore((s) => s.voice)
  return useMemo(() => {
    const pr = review?.plies[ply - 1]
    if (!review || !pr || pr.status !== 'done') return pr?.explanation ?? EMPTY
    try {
      return explanationFor(review, ply, userColor, voice)
    } catch {
      return pr.explanation
    }
  }, [review, ply, userColor, voice])
}

