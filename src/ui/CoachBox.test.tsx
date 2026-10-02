// Coach box and the Explain toggle (R26, E.8, G.20): the toggle hides the coach text, the "Best was" chip and the
// explanation arrows and highlights, and never the badge, the move-list icons, the eval bar or the graph.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReviewStore, useSettingsStore } from '../state'
import { ARROW_BEST, ARROW_THREAT } from './colors'
import { MoveByMove } from './MoveByMove'
import { fixtureGame, fixtureReview } from './test-fixtures'

vi.mock('../explain', () => ({
  buildMoveFacts: vi.fn((_review: unknown, ply: number, userColor: string) => ({ ply, userColor })),
  explain: vi.fn((facts: { ply: number }, voice: string) => ({
    headline: facts.ply === 8 ? 'd5 is a mistake' : `ply ${facts.ply}`,
    sentences: [`Rebuilt ${voice} sentence for ply ${facts.ply}.`],
    bestLine: facts.ply === 8 ? 'Best was d6' : undefined,
    arrows: facts.ply === 8 ? [{ from: 'c8', to: 'g4', kind: 'threat' }] : [],
    highlights: facts.ply === 8 ? ['h7'] : [],
    reasonCode: 'mock',
  })),
}))
vi.mock('./sounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sounds')>()),
  playSound: vi.fn(),
}))

const arrowPaths = (colour: string) =>
  [...document.querySelectorAll('[data-testid="board"] svg path')].filter(
    (p) => p.getAttribute('stroke') === colour,
  )

afterEach(cleanup)
// jsdom has no layout, so react-chessboard's move animation cannot measure squares: ask for reduced motion
window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query })) as never
beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().update({ explain: true, userColor: 'w', voice: 'me', coloredMoves: true })
  const game = fixtureGame()
  useReviewStore.getState().reset()
  useReviewStore.getState().openGame(game, fixtureReview(game), 8) // 4...d5, a Mistake with a best line
  useReviewStore.getState().patch({ screen: 'moves', phase: 'complete' })
})

describe('CoachBox (R26)', () => {
  it('shows headline, text, chip and the R26 buttons', () => {
    render(<MoveByMove />)
    expect(screen.getByTestId('coach-headline')).toHaveTextContent('d5 is a mistake')
    expect(screen.getByTestId('coach-text')).toHaveTextContent('Rebuilt impersonal sentence for ply 8.')
    expect(screen.getByTestId('best-chip')).toHaveTextContent('Best was d6')
    for (const id of ['show-best', 'show-reply', 'retry', 'prev', 'next', 'key-moves']) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
    expect(screen.getByTestId('explain-toggle')).toHaveTextContent('Explain')
    expect(screen.getByTestId('explain-toggle')).toHaveAttribute('aria-pressed', 'true')
  })

  it('the Explain toggle hides text, chip, explanation arrows and highlights, but not badge, icons, bar, graph', () => {
    render(<MoveByMove />)
    expect(arrowPaths(ARROW_THREAT)).toHaveLength(1)
    const h7 = () => document.querySelector('[data-square="h7"]:not([data-testid]) > div') as HTMLElement
    expect(h7().style.backgroundColor).not.toBe('')

    fireEvent.click(screen.getByTestId('explain-toggle'))
    expect(useSettingsStore.getState().explain).toBe(false)
    expect(screen.getByTestId('explain-toggle')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('coach-text')).toBeNull()
    expect(screen.queryByTestId('best-chip')).toBeNull()
    expect(arrowPaths(ARROW_THREAT)).toHaveLength(0)
    expect(h7().style.backgroundColor).toBe('')
    // never hidden
    expect(screen.getByTestId('coach-headline')).toHaveTextContent('d5 is a mistake')
    expect(screen.getByTestId('board-badge')).toHaveAttribute('data-square', 'd5')
    expect(screen.getByTestId('board-badge')).toHaveAttribute('aria-label', 'Mistake')
    expect(within(screen.getByTestId('move-list')).getAllByRole('img').length).toBeGreaterThanOrEqual(12)
    expect(screen.getByTestId('eval-bar')).toBeInTheDocument()
    expect(screen.getByTestId('eval-graph')).toHaveAttribute('data-points', '12')
    // toggling back restores them
    fireEvent.click(screen.getByTestId('explain-toggle'))
    expect(screen.getByTestId('coach-text')).toBeInTheDocument()
    expect(arrowPaths(ARROW_THREAT)).toHaveLength(1)
  })

  it('uses the personal voice for the user own moves', () => {
    useReviewStore.getState().setPly(7) // White's Ng5
    render(<MoveByMove />)
    expect(screen.getByTestId('coach-text')).toHaveTextContent('Rebuilt personal sentence for ply 7.')
  })

  it('Show best draws the best-move arrow on the position before the move; Show reply the threat', () => {
    render(<MoveByMove />)
    expect(arrowPaths(ARROW_BEST)).toHaveLength(0)
    fireEvent.click(screen.getByTestId('show-best'))
    expect(screen.getByTestId('show-best')).toHaveAttribute('aria-pressed', 'true')
    expect(arrowPaths(ARROW_BEST)).toHaveLength(1)
    expect(screen.queryByTestId('board-badge')).toBeNull()
    fireEvent.click(screen.getByTestId('show-best'))
    fireEvent.click(screen.getByTestId('show-reply'))
    expect(arrowPaths(ARROW_THREAT).length).toBeGreaterThanOrEqual(1)
  })

  it('Prev / Next / Key Moves step through the game and mark the active ply', () => {
    render(<MoveByMove />)
    expect(screen.getByTestId('move-8')).toHaveAttribute('aria-current', 'true')
    fireEvent.click(screen.getByTestId('next'))
    expect(useReviewStore.getState().ply).toBe(9)
    fireEvent.click(screen.getByTestId('prev'))
    fireEvent.click(screen.getByTestId('prev'))
    expect(useReviewStore.getState().ply).toBe(7)
    fireEvent.click(screen.getByTestId('key-moves'))
    expect(useReviewStore.getState().ply).toBe(11)
    expect(screen.getByTestId('move-11')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByTestId('move-11')).toHaveAttribute('data-classification', 'brilliant')
    fireEvent.click(screen.getByTestId('first'))
    expect(useReviewStore.getState().ply).toBe(0)
    fireEvent.click(screen.getByTestId('last'))
    expect(useReviewStore.getState().ply).toBe(12)
  })

  it('shows the opening name only inside the book prefix', () => {
    useReviewStore.getState().setPly(2)
    const { unmount } = render(<MoveByMove />)
    expect(screen.getByTestId('opening-name')).toHaveTextContent('Italian Game')
    unmount()
    useReviewStore.getState().setPly(3)
    render(<MoveByMove />)
    expect(screen.queryByTestId('opening-name')).toBeNull()
  })

  it('Retry mode enables the board and shows the prompt; the feedback mapping is in reviewStore.test.ts', () => {
    render(<MoveByMove />)
    fireEvent.click(screen.getByTestId('retry'))
    expect(useReviewStore.getState().retry.active).toBe(true)
    expect(screen.getByTestId('retry-feedback')).toHaveTextContent(
      'Play the move you would choose on the board.',
    )
    expect(screen.queryByTestId('board-badge')).toBeNull()
  })
})
