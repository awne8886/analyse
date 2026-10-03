// Coach box (E.8, R26, G.20, G.26): headline with the classification icon, 1 to 2 sentences, the "Best was" chip,
// the Show best / Show reply / Retry / Prev / Next / Key Moves buttons, the Explain toggle (hotkey e), Retry
// feedback and the key-moments strip. The Explain toggle hides only the coach text, the chip and the explanation
// arrows and highlights; badges, move-list icons, the eval bar and the graph never depend on it.
import { useId, useState, type FormEvent } from 'react'
import { tryRetryText, useReviewStore, useSettingsStore } from '../state'
import type { Explanation } from '../types/explain'
import type { ImportedGame } from '../types/game'
import type { GameReview } from '../types/review'
import { moveLabel, openingAt } from './format'
import { ClassificationIcon } from './icons/ClassificationIcon'
import { renderKeyed } from './messages'
import { goToPly, nextKeyMoment, step } from './navigation'
import { t } from './strings'

/** Keyboard entry for Retry (a11y M5): the board only takes pointer drags, so a typed SAN or UCI move is graded
 *  the same way. The field stays mounted (read-only while a move is graded) so focus is never lost. */
function RetryEntry({ busy }: { busy: boolean }) {
  const id = useId()
  const [text, setText] = useState('')
  const [illegal, setIllegal] = useState(false)
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (busy || !text.trim()) return
    const ok = tryRetryText(text)
    setIllegal(!ok)
    if (ok) setText('')
  }
  return (
    <form className="retry-entry" onSubmit={onSubmit}>
      <label htmlFor={id}>{t('retry.moveLabel')}</label>
      <span className="retry-entry-line">
        <input
          id={id}
          data-testid="retry-move-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          readOnly={busy}
          value={text}
          aria-invalid={illegal}
          onChange={(e) => {
            setText(e.target.value)
            setIllegal(false)
          }}
        />
        <button type="submit" data-testid="retry-move-submit" disabled={busy}>
          {t('retry.play')}
        </button>
      </span>
      {illegal ? (
        <span className="retry-illegal" role="alert">
          {t('retry.illegal')}
        </span>
      ) : null}
    </form>
  )
}

export function CoachBox({
  game,
  review,
  ply,
  explanation,
  retryDisabled,
  onRetry,
  onExitRetry,
}: {
  game: ImportedGame
  review?: GameReview
  ply: number
  explanation: Explanation
  retryDisabled: boolean
  onRetry: () => void
  onExitRetry: () => void
}) {
  const explainOn = useSettingsStore((s) => s.explain)
  const toggleExplain = useSettingsStore((s) => s.toggleExplain)
  const userColor = useSettingsStore((s) => s.userColor)
  const showBest = useReviewStore((s) => s.showBest)
  const showReply = useReviewStore((s) => s.showReply)
  const retry = useReviewStore((s) => s.retry)
  const toggleShowBest = useReviewStore((s) => s.toggleShowBest)
  const toggleShowReply = useReviewStore((s) => s.toggleShowReply)

  const pr = review?.plies[ply - 1]
  const move = game.moves[ply - 1]
  const done = pr?.status === 'done'
  const c = done ? pr.classification : undefined
  const headline =
    done && move ? explanation.headline || `${move.san} ${t(`headline.${pr.classification}`)}` : undefined
  const keyTarget = nextKeyMoment(review, ply, userColor)
  const replyKnown = ply > 0 && (review?.plies[ply]?.bestUci || pr?.playedLine?.pv[1])
  const opening = c === 'book' ? openingAt(game, review, ply) : undefined

  let body: string[] = []
  if (ply === 0) body = [t('coach.start')]
  else if (pr?.status === 'not-analysed') body = [renderKeyed({ key: 'E-9' })]
  else if (!done) body = [t('coach.pending')]
  else if (explanation.sentences.length) body = explanation.sentences.slice(0, 2)
  else if (opening) body = [t('coach.inBook', opening)]

  return (
    <section className="coach-box panel" data-testid="coach-box">
      <div className="coach-head">
        {c ? <ClassificationIcon classification={c} size={24} /> : null}
        <h2
          className="coach-headline"
          data-testid="coach-headline"
          style={c ? { color: `var(--color-classification-text-${c})` } : undefined}
        >
          {headline ?? (move ? moveLabel(move) : t('import.title'))}
        </h2>
        <button
          type="button"
          className={`toggle ${explainOn ? 'on' : ''}`}
          data-testid="explain-toggle"
          aria-pressed={explainOn}
          aria-keyshortcuts="e"
          onClick={toggleExplain}
        >
          {t('toggle.explain')}
        </button>
      </div>
      {explainOn ? (
        <div className="coach-text" data-testid="coach-text">
          {body.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </div>
      ) : null}
      {explainOn && done && explanation.bestLine && pr.bestSan !== pr.san ? (
        <button
          type="button"
          className="best-chip"
          data-testid="best-chip"
          aria-pressed={showBest}
          onClick={toggleShowBest}
        >
          {explanation.bestLine}
        </button>
      ) : null}
      {retry.active ? (
        <div className="retry-feedback" data-testid="retry-feedback" role="status">
          {retry.checking ? (
            t('retry.checking')
          ) : retry.feedback ? (
            <>
              <ClassificationIcon classification={retry.feedback.classification} size={18} />
              <strong className={`grade-${retry.feedback.grade}`}>
                {t(`retry.${retry.feedback.grade}`)}
              </strong>
              <span>{t(retry.feedback.praise)}</span>
            </>
          ) : (
            t('retry.prompt')
          )}
        </div>
      ) : null}
      {retry.active ? <RetryEntry key={ply} busy={retry.checking || retry.fen !== null} /> : null}
      <div className="coach-buttons">
        <button
          type="button"
          data-testid="show-best"
          aria-pressed={showBest}
          disabled={!done || !pr.bestUci}
          onClick={toggleShowBest}
        >
          {t('button.showBest')}
        </button>
        <button
          type="button"
          data-testid="show-reply"
          aria-pressed={showReply}
          disabled={!replyKnown || retry.active}
          onClick={toggleShowReply}
        >
          {t('button.showReply')}
        </button>
        <button
          type="button"
          data-testid="retry"
          aria-pressed={retry.active}
          disabled={!retry.active && retryDisabled}
          onClick={retry.active ? onExitRetry : onRetry}
        >
          {retry.active ? t('retry.exit') : t('button.retry')}
        </button>
        <button type="button" data-testid="prev" disabled={ply === 0} onClick={() => step(-1)}>
          {t('button.prev')}
        </button>
        <button type="button" data-testid="next" disabled={ply >= game.moves.length} onClick={() => step(1)}>
          {t('button.next')}
        </button>
        <button
          type="button"
          data-testid="key-moves"
          disabled={keyTarget === null}
          onClick={() => keyTarget !== null && goToPly(keyTarget)}
        >
          {t('button.keyMoves')}
        </button>
      </div>
      {review?.keyMoments.length ? (
        <div className="key-strip" role="group" aria-label={t('label.keyMoments')}>
          {review.keyMoments.map((k) => {
            const kp = review.plies[k - 1]
            return (
              <button type="button" key={k} className={k === ply ? 'active' : ''} onClick={() => goToPly(k)}>
                {kp?.status === 'done' ? (
                  <ClassificationIcon classification={kp.classification} size={14} />
                ) : null}
                {game.moves[k - 1] ? moveLabel(game.moves[k - 1]) : k}
              </button>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
