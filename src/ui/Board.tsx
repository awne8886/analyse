// The board (G.16 to G.18, G.23, G.26): react-chessboard 5 with Kaneo/cburnett pieces from public/pieces/, the
// classification badge drawn by `squareRenderer` (which must render `children` and merge `squareStyles` itself),
// from/to tints, arrows, click-to-step on the board halves, and drag-and-drop only in Retry mode.
import { useCallback, useEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { Chessboard, defaultArrowOptions, type Arrow, type PieceRenderObject } from 'react-chessboard'
import type { Classification } from '../types/review'
import { BOARD_DARK, BOARD_LIGHT } from './colors'
import { ClassificationIcon } from './icons/ClassificationIcon'
import { t } from './strings'

const PIECE_CODES = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK']

function piecesFor(set: 'kaneo' | 'cburnett'): PieceRenderObject {
  return Object.fromEntries(
    PIECE_CODES.map((code) => [
      code,
      () => (
        <img
          src={`${import.meta.env.BASE_URL}pieces/${set}/${code}.svg`}
          draggable={false}
          style={{ width: '100%', height: '100%' }}
          alt=""
        />
      ),
    ]),
  )
}
const PIECES = { kaneo: piecesFor('kaneo'), cburnett: piecesFor('cburnett') }

/** react-chessboard wraps every piece in a dnd-kit draggable (`tabindex=0`, `role=button`, no name) even when
 *  dragging is off, and it has no keyboard sensor, so those wrappers are unnamed dead tab stops (a11y M4). They
 *  are taken out of the tab order and the accessibility tree; Retry takes keyboard moves through the coach box. */
function hidePieceWrappers(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>('[aria-roledescription="draggable"]')) {
    if (el.getAttribute('tabindex') !== '-1') el.setAttribute('tabindex', '-1')
    if (el.getAttribute('aria-hidden') !== 'true') el.setAttribute('aria-hidden', 'true')
  }
}
const ARROW_OPTIONS = { ...defaultArrowOptions, opacity: 1, activeOpacity: 1 }

export interface BoardBadge {
  square: string
  classification: Classification
}

export function Board({
  fen,
  orientation,
  pieceSet,
  squareStyles,
  arrows,
  badge,
  allowDragging,
  onDrop,
  onStep,
}: {
  fen: string
  orientation: 'white' | 'black'
  pieceSet: 'kaneo' | 'cburnett'
  squareStyles: Record<string, CSSProperties>
  arrows: Arrow[]
  badge?: BoardBadge
  allowDragging: boolean
  onDrop?: (from: string, to: string, piece: string) => boolean
  onStep?: (delta: 1 | -1) => void
}) {
  const squareRenderer = useCallback(
    ({ square, children }: { square: string; children?: ReactNode }) => (
      <div style={{ width: '100%', height: '100%', position: 'relative', ...squareStyles[square] }}>
        {children}
        {badge && badge.square === square ? (
          <span
            className="board-badge"
            data-testid="board-badge"
            data-square={square}
            role="img"
            aria-label={t(`class.${badge.classification}`)}
            style={{ position: 'absolute', top: 0, right: 0, width: '36%', height: '36%', zIndex: 5 }}
          >
            <ClassificationIcon classification={badge.classification} size="100%" decorative />
          </span>
        ) : null}
      </div>
    ),
    [squareStyles, badge],
  )

  const boardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = boardRef.current
    if (!root) return
    hidePieceWrappers(root)
    const observer = new MutationObserver(() => hidePieceWrappers(root))
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['tabindex', 'aria-hidden'],
    })
    return () => observer.disconnect()
  }, [])

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (allowDragging || !onStep) return
    const rect = e.currentTarget.getBoundingClientRect()
    onStep(e.clientX - rect.left >= rect.width / 2 ? 1 : -1)
  }

  return (
    <div
      ref={boardRef}
      className="board"
      data-testid="board"
      aria-label={t('board.label', { orientation: t(`color.${orientation}`) })}
      role="group"
      onClick={handleClick}
    >
      <Chessboard
        options={{
          id: 'analyse-board',
          position: fen,
          boardOrientation: orientation,
          allowDragging,
          allowDrawingArrows: false,
          arrows,
          arrowOptions: ARROW_OPTIONS,
          squareStyles,
          squareRenderer,
          pieces: PIECES[pieceSet],
          lightSquareStyle: { backgroundColor: BOARD_LIGHT },
          darkSquareStyle: { backgroundColor: BOARD_DARK },
          showAnimations: !reducedMotion,
          animationDurationInMs: 180,
          canDragPiece: ({ piece }) => allowDragging && piece.pieceType[0] === fen.split(' ')[1],
          onPieceDrop: ({ piece, sourceSquare, targetSquare }) =>
            targetSquare !== null &&
            onDrop !== undefined &&
            onDrop(sourceSquare, targetSquare, piece.pieceType),
        }}
      />
    </div>
  )
}
