// Overview "Highlights" (G.2): coach summary, eval graph, players, accuracy (animated while analysing),
// "Chess.com reported", tally, game rating, phase grades, Start Review and Share.
import { useEffect, useRef, useState } from 'react'
import { REVIEW_CONFIG, summarySentence } from '../analysis'
import { useReviewStore, useSettingsStore } from '../state'
import type { ImportedGame } from '../types/game'
import type { GameReview } from '../types/review'
import { EvalGraph } from './EvalGraph'
import { oneDecimal } from './format'
import { copyShareLink, goToPly } from './navigation'
import { PhaseGrades } from './PhaseGrades'
import { PlayersRow } from './PlayersRow'
import { ProgressBar, ReviewBanners } from './ProgressBar'
import { t } from './strings'
import { TallyTable } from './TallyTable'

/** Counts up to `value` while the analysis runs; shows `value` itself otherwise. */
function AnimatedNumber({ value, animate }: { value?: number; animate: boolean }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (!animate || value === undefined) {
      from.current = value
      return
    }
    const start = from.current ?? 0
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 600)
      const v = start + (value - start) * k
      from.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, animate])
  const v = animate ? shown : value
  return <>{v === undefined ? '-' : oneDecimal(v)}</>
}

function sideMoves(review: GameReview | undefined, color: 'w' | 'b'): number {
  return review?.plies.filter((p) => p.color === color && p.status === 'done').length ?? 0
}

function RatingCell({
  game,
  review,
  side,
}: {
  game: ImportedGame
  review?: GameReview
  side: 'white' | 'black'
}) {
  const value = review?.rating[side]
  const enough = sideMoves(review, side === 'white' ? 'w' : 'b') >= REVIEW_CONFIG.ratingMinMoves
  const acpl = game[side].rating === undefined
  const tip = t('tooltip.G-T2') + (acpl ? t('tooltip.G-T2.acplSuffix') : '')
  return (
    <span className="rating-cell" data-testid={`rating-${side}`} title={tip}>
      {value === undefined || !enough ? (
        t('label.notAvailable')
      ) : (
        <>
          <strong>{acpl ? Math.round(value / 50) * 50 : Math.round(value)}</strong>
          {acpl ? <small className="rough">{t('overview.roughEstimate')}</small> : null}
        </>
      )}
    </span>
  )
}

export function Overview() {
  const game = useReviewStore((s) => s.game) as ImportedGame
  const review = useReviewStore((s) => s.review)
  const ply = useReviewStore((s) => s.ply)
  const phase = useReviewStore((s) => s.phase)
  const linkCopied = useReviewStore((s) => s.linkCopied)
  const setScreen = useReviewStore((s) => s.setScreen)
  const userColor = useSettingsStore((s) => s.userColor)
  const voice = useSettingsStore((s) => s.voice)
  const theme = useSettingsStore((s) => s.theme)
  const analysing = phase === 'analysing'

  let summary = ''
  if (review?.complete) {
    try {
      summary = summarySentence(review, userColor, voice === 'me' ? 'personal' : 'impersonal')
    } catch {
      summary = review.summary
    }
  }

  return (
    <section className="overview" data-testid="overview" aria-labelledby="overview-title">
      <h1 id="overview-title" className="screen-title">
        {t('overview.title')}
      </h1>
      <ReviewBanners />
      <ProgressBar />
      {summary ? (
        <p className="summary panel" data-testid="summary">
          {summary}
        </p>
      ) : null}
      <div className="panel">
        <EvalGraph
          game={game}
          review={review}
          ply={ply}
          theme={theme}
          onSelect={(p) => {
            goToPly(p)
            setScreen('moves')
          }}
        />
      </div>
      <div className="panel">
        <PlayersRow game={game} />
        <div className="stat-row" title={t('tooltip.G-T1')}>
          <span className="stat-value" data-testid="accuracy-white">
            <AnimatedNumber value={review?.accuracy.white} animate={analysing} />
          </span>
          <span className="stat-label">{t('overview.accuracy')}</span>
          <span className="stat-value" data-testid="accuracy-black">
            <AnimatedNumber value={review?.accuracy.black} animate={analysing} />
          </span>
        </div>
        {game.reportedAccuracies ? (
          <p className="reported" data-testid="chesscom-reported" title={t('tooltip.G-T5')}>
            {t('label.chesscomReported', {
              white: oneDecimal(game.reportedAccuracies.white),
              black: oneDecimal(game.reportedAccuracies.black),
            })}
          </p>
        ) : null}
      </div>
      <div className="panel">
        <TallyTable review={review} />
      </div>
      <div className="panel">
        <div className="stat-row">
          <RatingCell game={game} review={review} side="white" />
          <span className="stat-label">{t('overview.gameRating')}</span>
          <RatingCell game={game} review={review} side="black" />
        </div>
      </div>
      <div className="panel">
        <PhaseGrades review={review} />
      </div>
      <div className="overview-actions">
        <button
          type="button"
          className="primary"
          data-testid="start-review"
          onClick={() => {
            goToPly(ply)
            setScreen('moves')
          }}
        >
          {t('button.startReview')}
        </button>
        <button type="button" data-testid="share" onClick={() => void copyShareLink()}>
          {linkCopied ? t('message.linkCopied') : t('button.share')}
        </button>
      </div>
    </section>
  )
}
