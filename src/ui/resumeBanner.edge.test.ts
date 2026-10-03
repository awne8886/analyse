// The E-3 banner (R16, Appendix F) is shown for a resumed run with the resume move filled in, and only then.
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useReviewStore } from '../state'
import { ReviewBanners } from './ProgressBar'
import { fixtureGame, fixtureReview } from './test-fixtures'

const E3 = (n: number) =>
  `Analysis was interrupted (your device ran out of memory). Resuming from move ${n} in fast mode.`

beforeEach(() => {
  useReviewStore.getState().reset()
})
afterEach(cleanup)

describe('E-3 resume banner', () => {
  it('shows the verbatim string with the move number, and nothing without a resume', () => {
    const game = fixtureGame()
    useReviewStore.getState().openGame(game, fixtureReview(game, 6))
    const { rerender } = render(createElement(ReviewBanners))
    expect(screen.queryByText(/Resuming from move/)).toBeNull()
    useReviewStore.getState().patch({ resumedFrom: 6 })
    rerender(createElement(ReviewBanners))
    expect(screen.getByText(E3(6))).toBeInTheDocument()
  })

  it('goes away when the next game is opened', () => {
    const game = fixtureGame()
    useReviewStore.getState().openGame(game, fixtureReview(game, 6))
    useReviewStore.getState().patch({ resumedFrom: 41 })
    const { rerender } = render(createElement(ReviewBanners))
    expect(screen.getByText(E3(41))).toBeInTheDocument()
    useReviewStore.getState().openGame(fixtureGame({ id: 'cc:live:999' }))
    rerender(createElement(ReviewBanners))
    expect(screen.queryByText(/Resuming from move/)).toBeNull()
  })
})
