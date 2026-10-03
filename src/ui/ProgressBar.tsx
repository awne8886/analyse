// Analysis progress with ETA (R16, G.25: E-8, E-10 while refining, E-8b on phones; never a spinner alone), the
// review banners (I-15, I-36, E-3) and the engine failure line (E-2 with Retry).
import { useState } from 'react'
import { getDevice, retryEngine, useReviewStore } from '../state'
import { renderKeyed } from './messages'
import { t } from './strings'

/** The analysis progress (role="status"). It is mounted once by the app shell and stays mounted (empty while
 *  idle), so its first message and the completion are announced (a11y L1); the bar and text are visible only
 *  while analysing. E-10 shows whenever candidate plies are being refined (performance L1). */
export function ProgressBar() {
  const phase = useReviewStore((s) => s.phase)
  const progress = useReviewStore((s) => s.progress)
  const engine = useReviewStore((s) => s.engine)
  const [sawAnalysis, setSawAnalysis] = useState(false)
  const analysing = phase === 'analysing'
  // "Analysis complete." is announced only for a run this page watched, not for a stored review opened later
  if (analysing !== sawAnalysis && phase !== 'complete') setSawAnalysis(analysing)
  const total = progress?.total ?? 0
  const done = progress?.done ?? 0
  const pct = total ? Math.round((100 * done) / total) : 0
  let text = ''
  let refiningText = ''
  if (!analysing) {
    if (phase === 'complete' && sawAnalysis) text = t('progress.complete')
  } else if (!progress) {
    text =
      engine.phase === 'loading' && engine.percent !== null
        ? t('engine.loading', { percent: Math.round(engine.percent * 100) })
        : t('engine.loadingNoPercent')
  } else {
    const refining = progress.refining > 0 ? renderKeyed({ key: 'E-10', vars: { k: progress.refining } }) : ''
    if (done >= total && refining) text = refining
    else {
      const seconds = progress.etaMs === null ? '…' : Math.max(0, Math.ceil(progress.etaMs / 1000))
      text = renderKeyed({ key: 'E-8', vars: { n: Math.min(done + 1, total), total, s: seconds } })
      refiningText = refining
    }
  }
  return (
    <div className={analysing ? 'progress panel' : 'progress-idle'}>
      {analysing ? (
        <div className="progress-track" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <p
        data-testid="analysis-progress"
        role="status"
        aria-live="polite"
        className={analysing ? undefined : 'sr-only'}
      >
        {text}
        {refiningText ? (
          <>
            {' '}
            <span className="progress-refining">{refiningText}</span>
          </>
        ) : null}
      </p>
      {analysing && getDevice()?.isMobile ? <p className="hint">{renderKeyed({ key: 'E-8b' })}</p> : null}
    </div>
  )
}

export function ReviewBanners() {
  const game = useReviewStore((s) => s.game)
  const resumedFrom = useReviewStore((s) => s.resumedFrom)
  const engine = useReviewStore((s) => s.engine)
  const notice = useReviewStore((s) => s.importNotice)
  if (!game) return null
  return (
    <div className="banners">
      {game.customStart ? (
        <p className="banner" data-testid="banner-custom-start">
          {renderKeyed({ key: 'I-15' })}
        </p>
      ) : null}
      {game.inProgress ? (
        <p className="banner" data-testid="banner-in-progress">
          {renderKeyed({ key: 'I-36', vars: { n: game.moves.length } })}
        </p>
      ) : null}
      {notice ? (
        <p className="banner" data-testid="import-notice">
          {renderKeyed(notice)}
        </p>
      ) : null}
      {resumedFrom !== undefined ? (
        <p className="banner">{renderKeyed({ key: 'E-3', vars: { n: resumedFrom } })}</p>
      ) : null}
      {engine.phase === 'error' ? (
        <div className="banner banner-error" role="alert">
          <span>{renderKeyed({ key: engine.key, vars: { message: engine.message } })}</span>
          {engine.key === 'E-2' ? (
            <button type="button" onClick={() => void retryEngine()}>
              {t('button.retryEngine')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
