// Keyboard and screen-reader fixes from docs/review/a11y.md and parity.md: eval-graph keyboard access (M3), board
// pieces out of the tab order (M4), keyboard Retry and hotkeys that leave the board alone (M5), phase-grade names
// (M6), the persistent progress region with E-10 while refining (L1, performance L1), focus on screen changes
// (L2), classification text tokens (H2/M1) and the per-ply opening name (parity GAP-4).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { getDevice, startRetry, useReviewStore, useSettingsStore } from '../state'
import { Board } from './Board'
import { EvalGraph } from './EvalGraph'
import { openingAt } from './format'
import { MoveByMove } from './MoveByMove'
import { handleKey } from './navigation'
import { Overview } from './Overview'
import { ProgressBar } from './ProgressBar'
import { fixtureGame, fixtureReview } from './test-fixtures'

vi.mock('../explain', () => ({
  buildMoveFacts: vi.fn((_r: unknown, ply: number) => ({ ply })),
  explain: vi.fn((f: { ply: number }) => ({
    headline: `ply ${f.ply}`,
    sentences: [],
    arrows: [],
    highlights: [],
    reasonCode: 'mock',
  })),
}))
vi.mock('./sounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sounds')>()),
  playSound: vi.fn(),
}))
vi.mock('../state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../state')>()),
  getDevice: vi.fn(() => null),
}))

window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query })) as never
afterEach(cleanup)
beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().update({ userColor: 'w', voice: 'me', theme: 'dark', coloredMoves: true })
  const game = fixtureGame()
  useReviewStore.getState().reset()
  useReviewStore.getState().openGame(game, fixtureReview(game), 4)
  useReviewStore.getState().patch({ screen: 'moves', phase: 'complete' })
  vi.mocked(getDevice).mockReturnValue(null)
})

describe('eval graph keyboard access (a11y M3)', () => {
  it('a focusable slider moves a cursor with the arrow keys and selects with Enter, without stepping the game', () => {
    const onSelect = vi.fn()
    const game = useReviewStore.getState().game!
    render(
      <EvalGraph
        game={game}
        review={useReviewStore.getState().review}
        ply={4}
        theme="dark"
        onSelect={onSelect}
      />,
    )
    const globalKeys = vi.fn((e: KeyboardEvent) => handleKey(e))
    window.addEventListener('keydown', globalKeys)
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('tabindex', '0')
    expect(slider).toHaveAttribute('aria-valuenow', '4')
    expect(slider.getAttribute('aria-valuetext')).toBe('2...Nc6, Best: +0.3')
    act(() => slider.focus())
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider).toHaveAttribute('aria-valuenow', '6')
    expect(document.querySelector('.eval-graph-tip')).toHaveTextContent('3...Nf6')
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(slider).toHaveAttribute('aria-valuenow', '0')
    expect(slider.getAttribute('aria-valuetext')).toBe('Start position: +0.2')
    fireEvent.keyDown(slider, { key: 'End' })
    fireEvent.keyDown(slider, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(12)
    // the global Left/Right/Home/End hotkeys never saw these keys
    expect(globalKeys.mock.results.every((r) => r.value === false)).toBe(true)
    expect(useReviewStore.getState().ply).toBe(4)
    window.removeEventListener('keydown', globalKeys)
  })

  it('on the overview, Enter on the graph opens move-by-move at that ply', () => {
    useReviewStore.getState().patch({ screen: 'overview' })
    render(<Overview />)
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    fireEvent.keyDown(slider, { key: ' ' })
    expect(useReviewStore.getState().ply).toBe(3)
    expect(useReviewStore.getState().screen).toBe('moves')
  })
})

describe('board pieces (a11y M4)', () => {
  it('no piece wrapper is a tab stop or an unnamed button for assistive technology', async () => {
    const game = useReviewStore.getState().game!
    const { rerender } = render(
      <Board
        fen={game.moves[3].after}
        orientation="white"
        pieceSet="kaneo"
        squareStyles={{}}
        arrows={[]}
        allowDragging={false}
      />,
    )
    const board = screen.getByTestId('board')
    const wrappers = board.querySelectorAll('[aria-roledescription="draggable"]')
    expect(wrappers.length).toBe(32)
    for (const w of wrappers) {
      expect(w).toHaveAttribute('tabindex', '-1')
      expect(w).toHaveAttribute('aria-hidden', 'true')
    }
    // a new position (pieces re-mounted) and Retry dragging keep them out of the tab order
    rerender(
      <Board
        fen={game.moves[5].after}
        orientation="white"
        pieceSet="kaneo"
        squareStyles={{}}
        arrows={[]}
        allowDragging
      />,
    )
    await vi.waitFor(() =>
      expect(board.querySelectorAll('[aria-roledescription="draggable"]:not([tabindex="-1"])')).toHaveLength(
        0,
      ),
    )
    expect(within(board).queryAllByRole('button')).toHaveLength(0)
  })
})

describe('keyboard Retry (a11y M5)', () => {
  it('hotkeys ignore keys a focused widget handled and keys on the board', () => {
    render(<MoveByMove />)
    const piece = screen
      .getByTestId('board')
      .querySelector('[aria-roledescription="draggable"]') as HTMLElement
    expect(
      handleKey({ key: 'ArrowLeft', altKey: false, ctrlKey: false, metaKey: false, target: piece }),
    ).toBe(false)
    expect(
      handleKey({
        key: 'ArrowLeft',
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        target: document.body,
        defaultPrevented: true,
      }),
    ).toBe(false)
    expect(useReviewStore.getState().ply).toBe(4)
    expect(
      handleKey({ key: 'ArrowLeft', altKey: false, ctrlKey: false, metaKey: false, target: document.body }),
    ).toBe(true)
    expect(useReviewStore.getState().ply).toBe(3)
  })

  it('a typed move is played in Retry; an illegal one is refused with a message', async () => {
    act(() => useReviewStore.getState().setPly(8)) // 4...d5, the stored best line is d6
    render(<MoveByMove />)
    act(() => startRetry())
    const input = screen.getByTestId('retry-move-input')
    fireEvent.change(input, { target: { value: 'Qd1' } })
    fireEvent.click(screen.getByTestId('retry-move-submit'))
    expect(screen.getByRole('alert')).toHaveTextContent('That move is not legal here.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(input, { target: { value: 'd6' } })
    fireEvent.submit(input.closest('form')!)
    await vi.waitFor(() => expect(useReviewStore.getState().retry.feedback?.classification).toBeDefined())
    expect(useReviewStore.getState().retry.fen).toContain('2np1n2')
    expect(screen.getByTestId('retry-move-input')).toHaveAttribute('readonly')
  })

  it('UCI text works too', async () => {
    act(() => useReviewStore.getState().setPly(8))
    render(<MoveByMove />)
    act(() => startRetry())
    fireEvent.change(screen.getByTestId('retry-move-input'), { target: { value: 'd7d6' } })
    fireEvent.click(screen.getByTestId('retry-move-submit'))
    await vi.waitFor(() => expect(useReviewStore.getState().retry.fen).toContain('2np1n2'))
  })
})

describe('phase grades (a11y M6)', () => {
  it('each cell is an image named by its grade and the G-T3 / G-T4 text', () => {
    useReviewStore.getState().patch({ screen: 'overview' })
    render(<Overview />)
    const wo = screen.getByTestId('phase-grade-white-opening')
    expect(wo).toHaveAttribute('role', 'img')
    expect(wo).toHaveAttribute(
      'aria-label',
      'Best. White in the opening: accuracy 91.2, shown as a move-quality icon.',
    )
    expect(
      screen.getByRole('img', { name: /^None\. No grade: Black made fewer than 4 endgame moves\.$/ }),
    ).toBe(screen.getByTestId('phase-grade-black-endgame'))
  })
})

describe('progress region (a11y L1, performance L1)', () => {
  it('stays mounted while idle, shows E-8 and E-10 together while refining, and announces completion', () => {
    useReviewStore.getState().patch({ phase: 'idle' })
    render(<ProgressBar />)
    const status = screen.getByTestId('analysis-progress')
    expect(status).toHaveAttribute('role', 'status')
    expect(status).toHaveTextContent('')
    act(() =>
      useReviewStore.getState().patch({
        phase: 'analysing',
        progress: { done: 10, total: 60, etaMs: 20_000, refining: 1 },
      }),
    )
    expect(screen.getByTestId('analysis-progress')).toBe(status)
    expect(status).toHaveTextContent('Analysing move 11 of 60, about 20 s left Refining 1 candidate moves…')
    act(() => useReviewStore.getState().patch({ progress: { done: 60, total: 60, etaMs: 0, refining: 2 } }))
    expect(status).toHaveTextContent(/^Refining 2 candidate moves…$/)
    act(() => useReviewStore.getState().patch({ phase: 'complete', progress: undefined }))
    expect(screen.getByTestId('analysis-progress')).toBe(status)
    expect(status).toHaveTextContent('Analysis complete.')
  })

  it('does not announce completion for a stored review opened without an analysis', () => {
    render(<ProgressBar />)
    expect(screen.getByTestId('analysis-progress')).toHaveTextContent(/^$/)
  })
})

describe('focus on screen changes (a11y L2)', () => {
  it('Start Review, Highlights and New game land on the new screen heading', () => {
    useReviewStore.getState().patch({ screen: 'overview' })
    render(<App />)
    const start = screen.getByTestId('start-review')
    start.focus()
    fireEvent.click(start)
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Move by move' }))
    fireEvent.click(screen.getByTestId('back-to-overview'))
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Highlights' }))
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Game Review' }))
  })
})

describe('classification-coloured text (a11y H2, M1)', () => {
  it('move SAN, tally labels and the coach headline use the accessible text tokens', () => {
    render(<MoveByMove />)
    const san = screen.getByTestId('move-4').querySelector('.move-san') as HTMLElement
    expect(san.style.color).toBe('var(--color-classification-text-best)')
    expect(screen.getByTestId('coach-headline').style.color).toBe('var(--color-classification-text-best)')
    cleanup()
    render(<Overview />)
    const label = screen.getByTestId('tally-inaccuracy').querySelector('.tally-label') as HTMLElement
    expect(label.style.color).toBe('var(--color-classification-text-inaccuracy)')
    expect((document.querySelector('.eval-graph-phase') as HTMLElement).style.color).toBe(
      'var(--color-phase-middlegame-text)',
    )
  })
})

describe('opening name per ply (parity GAP-4)', () => {
  it('names the opening each book ply has reached, and the final book name at the last book ply', () => {
    const game = useReviewStore.getState().game!
    const review = { ...fixtureReview(game), opening: { eco: 'C55', name: 'Two Knights', lastBookPly: 6 } }
    expect(openingAt(game, review, 1)).toEqual({ eco: 'B00', name: "King's Pawn Game" })
    expect(openingAt(game, review, 5)?.name).toBe('Italian Game')
    expect(openingAt(game, review, 6)).toBe(review.opening)
    expect(openingAt(game, review, 7)).toBeUndefined()
    expect(openingAt(game, review, 0)).toBeUndefined()
  })
})
