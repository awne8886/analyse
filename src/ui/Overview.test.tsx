// Overview "Highlights" (G.2) rendered from the hand-written fixture: tally order (G.12), accuracy with one
// decimal (G.11), ratings (G.13), phase grades (G.14), eval graph (G.9), players row (G.10).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useReviewStore, useSettingsStore } from '../state'
import { CLASSIFICATIONS } from '../types/review'
import { Overview } from './Overview'
import { fixtureGame, fixtureReview } from './test-fixtures'

afterEach(cleanup)
beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().update({ userColor: 'w', voice: 'me', theme: 'dark' })
  const game = fixtureGame({ reportedAccuracies: { white: 89.86, black: 79.01 } })
  useReviewStore.getState().reset()
  useReviewStore.getState().openGame(game, fixtureReview(game))
  useReviewStore.getState().patch({ screen: 'overview', phase: 'complete' })
})

describe('TallyTable (G.12)', () => {
  it('lists the 11 classifications in the fixed order with both counts', () => {
    render(<Overview />)
    const rows = within(screen.getByTestId('tally')).getAllByTestId(/^tally-[a-z]+$/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(CLASSIFICATIONS.map((c) => `tally-${c}`))
    expect(CLASSIFICATIONS).toEqual([
      'brilliant',
      'great',
      'best',
      'excellent',
      'good',
      'book',
      'inaccuracy',
      'mistake',
      'miss',
      'blunder',
      'forced',
    ])
    expect(screen.getByTestId('tally-white-brilliant')).toHaveTextContent('1')
    expect(screen.getByTestId('tally-black-brilliant')).toHaveTextContent('0')
    expect(screen.getByTestId('tally-white-book')).toHaveTextContent('1')
    expect(screen.getByTestId('tally-black-book')).toHaveTextContent('1')
    expect(screen.getByTestId('tally-black-forced')).toHaveTextContent('1')
    expect(within(screen.getByTestId('tally-miss')).getByText('Miss')).toBeInTheDocument()
  })
})

describe('Overview (G.2)', () => {
  it('shows both accuracies with one decimal and the Chess.com reported line', () => {
    render(<Overview />)
    expect(screen.getByTestId('accuracy-white')).toHaveTextContent('87.0')
    expect(screen.getByTestId('accuracy-black')).toHaveTextContent('72.0')
    expect(screen.getByTestId('chesscom-reported')).toHaveTextContent('Chess.com reported: 89.9 / 79.0')
  })

  it('shows the players, the result and the summary', () => {
    render(<Overview />)
    expect(screen.getByTestId('player-white-name')).toHaveTextContent('Arystanner')
    expect(screen.getByTestId('player-black-name')).toHaveTextContent('Hikaru')
    expect(screen.getByTestId('result')).toHaveTextContent('1-0')
    expect(screen.getByTestId('summary')).toHaveTextContent('White played with 87% accuracy')
    const avatar = screen.getByTestId('player-white').querySelector('img') as HTMLImageElement
    expect(avatar.getAttribute('crossorigin')).toBe('anonymous')
    expect(avatar.getAttribute('referrerpolicy')).toBe('no-referrer')
    fireEvent.error(avatar)
    expect(avatar.getAttribute('src')).toBe(`${import.meta.env.BASE_URL}avatar-placeholder.svg`)
  })

  it('marks a bot side and an unknown result (I-21)', () => {
    const game = fixtureGame({ black: { name: 'Stockfish', isComputer: true }, result: '*' })
    useReviewStore.getState().openGame(game, fixtureReview(game))
    render(<Overview />)
    expect(screen.getByTestId('player-black')).toHaveTextContent('Bot')
    expect(screen.getByTestId('result').textContent).not.toBe('*')
  })

  it('shows "n/a" for a side with fewer than 10 moves', () => {
    render(<Overview />)
    expect(screen.getByTestId('rating-white')).toHaveTextContent('n/a')
    expect(screen.getByTestId('rating-black')).toHaveTextContent('n/a')
  })

  it('phase grades: an icon by accuracy band, or "None"', () => {
    render(<Overview />)
    const wo = screen.getByTestId('phase-grade-white-opening')
    expect(wo.querySelector('svg')?.getAttribute('data-classification')).toBe('best')
    expect(wo.getAttribute('title')).toBe(
      'White in the opening: accuracy 91.2, shown as a move-quality icon.',
    )
    expect(screen.getByTestId('phase-grade-white-middlegame').querySelector('svg')).toHaveAttribute(
      'data-classification',
      'inaccuracy',
    )
    expect(screen.getByTestId('phase-grade-black-opening').querySelector('svg')).toHaveAttribute(
      'data-classification',
      'blunder',
    )
    const none = screen.getByTestId('phase-grade-black-endgame')
    expect(none).toHaveTextContent('None')
    expect(none.getAttribute('title')).toBe('No grade: Black made fewer than 4 endgame moves.')
  })

  it('draws the eval graph with one point per analysed ply and the key-moment ticks', () => {
    render(<Overview />)
    const graph = screen.getByTestId('eval-graph')
    expect(graph).toHaveAttribute('data-points', '12')
    expect(graph).toHaveAttribute('role', 'img')
    expect(graph.getAttribute('aria-label')).toBe('Evaluation graph: from -5.0 to +5.0 over 12 moves')
    expect(screen.getAllByTestId('key-moment-tick')).toHaveLength(2)
    expect(document.querySelector('.eval-graph-phase')).toHaveTextContent('Middlegame')
  })

  it('Start Review opens the move-by-move screen', () => {
    render(<Overview />)
    fireEvent.click(screen.getByTestId('start-review'))
    expect(useReviewStore.getState().screen).toBe('moves')
  })
})
