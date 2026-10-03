// Engine status line (G.7): "Engine: not loaded", the wasm loading percent, then the engine badge (E-4/E-5/E-6).
// Shown on the import screen and above the review, so the badge stays visible while the analysis runs.
import { useReviewStore, type EngineView } from '../state'
import type { Tier } from '../types/engine'
import { renderKeyed } from './messages'
import { t } from './strings'

function engineLine(engine: EngineView, tier: Tier | undefined): string {
  switch (engine.phase) {
    case 'not-loaded':
      return t('engine.notLoaded')
    case 'loading':
      return engine.percent === null
        ? t('engine.loadingNoPercent')
        : t('engine.loading', { percent: Math.round(engine.percent * 100) })
    case 'ready': {
      const badge =
        engine.build === 'lite'
          ? renderKeyed({ key: 'E-5', vars: { n: engine.threads } })
          : renderKeyed({ key: 'E-6' })
      const fast = tier === 'fast-14' ? ` · ${renderKeyed({ key: 'E-4' })}` : ''
      return t('engine.ready', { badge: badge + fast })
    }
    case 'error':
      return renderKeyed({ key: engine.key, vars: { message: engine.message } })
  }
}

/** `hideWhenIdle`: on the review screen a never-loaded engine (cached or finished review) shows nothing. */
export function EngineStatus({ hideWhenIdle = false }: { hideWhenIdle?: boolean }) {
  const engine = useReviewStore((s) => s.engine)
  const tier = useReviewStore((s) => s.tier)
  if (hideWhenIdle && engine.phase === 'not-loaded') return null
  return (
    <p className="engine-status" data-testid="engine-status">
      {engineLine(engine, tier)}
    </p>
  )
}
