// Badge placement (G.17) and pieces (H.1) on the real react-chessboard.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Board } from './Board'
import { fixtureGame } from './test-fixtures'

afterEach(cleanup)

const game = fixtureGame()
const nxf7 = game.moves[10] // 6.Nxf7, the fixture's brilliant ply

function renderBoard(overrides: Partial<Parameters<typeof Board>[0]> = {}) {
  return render(
    <Board
      fen={nxf7.after}
      orientation="white"
      pieceSet="kaneo"
      squareStyles={{ [nxf7.from]: { backgroundColor: 'rgba(38,194,163,0.6)' } }}
      arrows={[]}
      badge={{ square: nxf7.to, classification: 'brilliant' }}
      allowDragging={false}
      {...overrides}
    />,
  )
}

describe('Board', () => {
  it('draws exactly one badge, on the destination square, labelled with the class name', () => {
    renderBoard()
    const badges = screen.getAllByTestId('board-badge')
    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveAttribute('data-square', 'f7')
    expect(badges[0]).toHaveAttribute('aria-label', 'Brilliant')
    // top-right corner, 36% of the square
    expect(badges[0].style.top).toBe('0px')
    expect(badges[0].style.right).toBe('0px')
    expect(badges[0].style.width).toBe('36%')
    // inside the f7 square of react-chessboard
    expect(badges[0].closest('[data-square="f7"]:not([data-testid])')).not.toBeNull()
  })

  it('renders no badge without a classification', () => {
    renderBoard({ badge: undefined })
    expect(screen.queryByTestId('board-badge')).toBeNull()
  })

  it('merges the square styles itself (squareRenderer)', () => {
    const { container } = renderBoard()
    const g5 = container.querySelector('[data-square="g5"]:not([data-testid]) > div') as HTMLElement
    expect(g5.style.backgroundColor).toBe('rgba(38, 194, 163, 0.6)')
  })

  it('uses the selected piece set from BASE_URL/pieces/<set>/<code>.svg', () => {
    const { container, unmount } = renderBoard()
    const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs).toContain(`${import.meta.env.BASE_URL}pieces/kaneo/wN.svg`)
    unmount()
    const again = renderBoard({ pieceSet: 'cburnett' })
    const srcs2 = [...again.container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs2).toContain(`${import.meta.env.BASE_URL}pieces/cburnett/bK.svg`)
  })

  it('steps forward on the right half and back on the left half', () => {
    const onStep = vi.fn()
    renderBoard({ onStep })
    const board = screen.getByTestId('board')
    board.getBoundingClientRect = () => ({ left: 0, width: 400, top: 0, height: 400 }) as DOMRect
    board.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300 }))
    board.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100 }))
    expect(onStep.mock.calls).toEqual([[1], [-1]])
  })
})
