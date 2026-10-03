// Move-by-move screen (G.3): board with badge, tints and arrows, eval bar, coach box, opening name, move list,
// first/last buttons, eval graph, Retry mode (G.4) and the Highlights / Share / Flip controls.
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Arrow as BoardArrow } from 'react-chessboard'
import { getDevice, startRetry, stopRetry, tryRetryMove, useReviewStore, useSettingsStore } from '../state'
import type { Arrow } from '../types/explain'
import type { ImportedGame } from '../types/game'
import { Board } from './Board'
import { CoachBox } from './CoachBox'
import { ARROW_BEST, ARROW_THREAT, CLASS_COLORS, LAST_MOVE, withAlpha } from './colors'
import { EvalBar } from './EvalBar'
import { EvalGraph } from './EvalGraph'
import { evalBarResult, openingAt, positionScore } from './format'
import { MoveList } from './MoveList'
import { copyShareLink, goToPly, step, toFirst, toLast } from './navigation'
import { ReviewBanners } from './ProgressBar'
import { playSound } from './sounds'
import { t } from './strings'
import { useExplanation } from './useExplanation'

const uciArrow = (uci: string, color: string): BoardArrow => ({
  startSquare: uci.slice(0, 2),
  endSquare: uci.slice(2, 4),
  color,
})

export function MoveByMove() {
  const game = useReviewStore((s) => s.game) as ImportedGame
  const review = useReviewStore((s) => s.review)
  const ply = useReviewStore((s) => s.ply)
  const phase = useReviewStore((s) => s.phase)
  const flipped = useReviewStore((s) => s.flipped)
  const showBest = useReviewStore((s) => s.showBest)
  const showReply = useReviewStore((s) => s.showReply)
  const retry = useReviewStore((s) => s.retry)
  const linkCopied = useReviewStore((s) => s.linkCopied)
  const toggleFlip = useReviewStore((s) => s.toggleFlip)
  const setScreen = useReviewStore((s) => s.setScreen)
  const settings = useSettingsStore()
  const explanation = useExplanation(review, ply)

  const move = game.moves[ply - 1]
  const pr = review?.plies[ply - 1]
  const done = pr?.status === 'done'
  const c = done ? pr.classification : undefined
  const colours = CLASS_COLORS[settings.theme]
  const classColour = c ? colours[c] : undefined

  const fen = retry.active
    ? (retry.fen ?? move.before)
    : showBest && move
      ? move.before
      : ply === 0
        ? game.startFen
        : move.after

  const squareStyles: Record<string, CSSProperties> = {}
  const arrows: BoardArrow[] = []
  if (move && !retry.active) {
    const tint = classColour ? withAlpha(classColour, 0.6) : LAST_MOVE
    squareStyles[move.from] = { backgroundColor: tint }
    squareStyles[move.to] = { backgroundColor: tint }
    if (classColour)
      arrows.push({ startSquare: move.from, endSquare: move.to, color: withAlpha(classColour, 0.8) })
  }
  if (showBest && pr?.bestUci) arrows.push(uciArrow(pr.bestUci, ARROW_BEST))
  const replyUci = review?.plies[ply]?.bestUci ?? pr?.playedLine?.pv[1]
  if (showReply && !retry.active && replyUci) arrows.push(uciArrow(replyUci, ARROW_THREAT))
  if (settings.explain && done && !retry.active) {
    const colourOf = (a: Arrow) =>
      a.kind === 'best'
        ? ARROW_BEST
        : a.kind === 'played'
          ? withAlpha(classColour as string, 0.8)
          : ARROW_THREAT
    for (const a of explanation.arrows) {
      if (!arrows.some((x) => x.startSquare === a.from && x.endSquare === a.to)) {
        arrows.push({ startSquare: a.from, endSquare: a.to, color: colourOf(a) })
      }
    }
    for (const sq of explanation.highlights) {
      squareStyles[sq] = { backgroundColor: withAlpha(classColour as string, 0.6) }
    }
  }

  const baseOrientation = settings.userColor === 'w' ? 'white' : 'black'
  const orientation = flipped ? (baseOrientation === 'white' ? 'black' : 'white') : baseOrientation
  const atEnd = ply === game.moves.length && ply > 0 && review?.complete === true
  const device = getDevice()
  const retryDisabled = ply === 0 || !done || (device?.multiPv === 1 && phase === 'analysing') || !pr.bestUci
  const opening = openingAt(game, review, ply)

  return (
    <section className="moves-screen" data-testid="move-by-move" aria-labelledby="moves-title">
      <h1 id="moves-title" className="sr-only" tabIndex={-1}>
        {t('moves.title')}
      </h1>
      <div className="moves-toolbar">
        <button type="button" data-testid="back-to-overview" onClick={() => setScreen('overview')}>
          {t('button.back')}
        </button>
        <button type="button" data-testid="flip" aria-keyshortcuts="f" onClick={toggleFlip}>
          {t('button.flip')}
        </button>
        <button type="button" data-testid="share" onClick={() => void copyShareLink()}>
          {linkCopied ? t('message.linkCopied') : t('button.share')}
        </button>
      </div>
      <ReviewBanners />
      <div className="moves-layout">
        <div className="board-area">
          <EvalBar
            score={positionScore(review, ply)}
            mover={move?.color}
            orientation={orientation}
            resultText={atEnd ? evalBarResult(game.result) : undefined}
          />
          <Board
            fen={fen}
            orientation={orientation}
            pieceSet={settings.pieceSet}
            squareStyles={squareStyles}
            arrows={arrows}
            badge={
              c && move && !retry.active && !showBest ? { square: move.to, classification: c } : undefined
            }
            allowDragging={retry.active && retry.fen === null}
            onStep={(d) => step(d)}
            onDrop={(from, to, piece) => {
              const promotes = piece[1] === 'P' && (to[1] === '8' || to[1] === '1')
              const ok = tryRetryMove(from, to, promotes ? 'q' : undefined)
              if (!ok && settings.sounds) playSound('illegal')
              return ok
            }}
          />
        </div>
        <div className="side-panel">
          <CoachBox
            game={game}
            review={review}
            ply={ply}
            explanation={explanation}
            retryDisabled={retryDisabled}
            onRetry={startRetry}
            onExitRetry={stopRetry}
          />
          {opening ? (
            <p className="opening-name" data-testid="opening-name">
              {opening.eco} {opening.name}
            </p>
          ) : null}
          <MoveList
            game={game}
            review={review}
            ply={ply}
            coloredMoves={settings.coloredMoves}
            onSelect={goToPly}
          />
          <div className="nav-buttons">
            <button type="button" data-testid="first" aria-label={t('button.first')} onClick={toFirst}>
              <ChevronsLeft size={20} aria-hidden />
            </button>
            <button type="button" aria-label={t('button.prev')} onClick={() => step(-1)}>
              <ChevronLeft size={20} aria-hidden />
            </button>
            <button type="button" aria-label={t('button.next')} onClick={() => step(1)}>
              <ChevronRight size={20} aria-hidden />
            </button>
            <button type="button" data-testid="last" aria-label={t('button.last')} onClick={toLast}>
              <ChevronsRight size={20} aria-hidden />
            </button>
          </div>
          <div className="panel">
            <EvalGraph game={game} review={review} ply={ply} theme={settings.theme} onSelect={goToPly} />
          </div>
        </div>
      </div>
    </section>
  )
}
