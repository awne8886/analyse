// Analysis profile selector (G.4, R14): Auto / Standard / Deep with depth and time in the label; while Fast mode
// is active (calibrated below 300,000 nps) the chosen profile is shown greyed with the E-4 badge beside it.
import { useId } from 'react'
import { REVIEW_CONFIG } from '../analysis'
import { useReviewStore, useSettingsStore } from '../state'
import type { ProfileName } from '../types/engine'
import { renderKeyed } from './messages'
import { t } from './strings'

const sec = (ms: number) => String(ms / 1000)

export function ProfileSelect({ testId }: { testId: string }) {
  const id = useId()
  const profile = useSettingsStore((s) => s.profile)
  const update = useSettingsStore((s) => s.update)
  const tier = useReviewStore((s) => s.tier)
  const { tiers, profiles } = REVIEW_CONFIG
  const fast = tier === 'fast-14'
  const labels: Record<ProfileName, string> = {
    auto: t('profile.auto', {
      d1: tiers['fast-14'].depth,
      d2: tiers['auto-18'].depth,
      t1: sec(tiers['fast-14'].movetimeMs),
      t2: sec(tiers['auto-18'].movetimeMs),
    }),
    standard: t('profile.standard', {
      depth: profiles.standard.depth,
      time: sec(profiles.standard.movetimeMs),
    }),
    deep: t('profile.deep', { depth: profiles.deep.depth, time: sec(profiles.deep.movetimeMs) }),
  }
  return (
    <div className="field">
      <label htmlFor={id}>{t('import.profile')}</label>
      <div className="profile-line">
        <select
          id={id}
          data-testid={testId}
          className={fast ? 'greyed' : ''}
          value={profile}
          onChange={(e) => update({ profile: e.target.value as ProfileName })}
        >
          {(['auto', 'standard', 'deep'] as const).map((p) => (
            <option key={p} value={p}>
              {labels[p]}
            </option>
          ))}
        </select>
        {fast ? <span className="badge">{renderKeyed({ key: 'E-4' })}</span> : null}
      </div>
    </div>
  )
}
