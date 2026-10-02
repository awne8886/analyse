// Analysis progress with ETA (R16, G.25: E-8, E-10 while refining, E-8b on phones; never a spinner alone), the
// review banners (I-15, I-36, E-3) and the engine failure line (E-2 with Retry).
import { getDevice, retryEngine, useReviewStore } from '../state'
import { renderKeyed } from './messages'
import { t } from './strings'

export function ProgressBar() {
  const phase = useReviewStore((s) => s.phase)
  const progress = useReviewStore((s) => s.progress)
  const engine = useReviewStore((s) => s.engine)
  if (phase !== 'analysing') return null
  const total = progress?.total ?? 0
  const done = progress?.done ?? 0
  const pct = total ? Math.round((100 * done) / total) : 0
  let text: string
  if (!progress) {
    text =
      engine.phase === 'loading' && engine.percent !== null
        ? t('engine.loading', { percent: Math.round(engine.percent * 100) })
        : t('engine.loadingNoPercent')
  } else if (done >= total && progress.refining > 0) {
    text = renderKeyed({ key: 'E-10', vars: { k: progress.refining } })
  } else {
    const seconds = progress.etaMs === null ? '…' : Math.max(0, Math.ceil(progress.etaMs / 1000))
    text = renderKeyed({ key: 'E-8', vars: { n: Math.min(done + 1, total), total, s: seconds } })
  }
  return (
    <div className="progress panel">
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p data-testid="analysis-progress" role="status" aria-live="polite">
        {text}
      </p>
      {getDevice()?.isMobile ? <p className="hint">{renderKeyed({ key: 'E-8b' })}</p> : null}
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
