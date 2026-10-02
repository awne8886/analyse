// Settings panel (F.4): theme, pieces, coach voice, sounds, coloured moves, analysis profile, Re-test speed.
// Every choice is persisted by the settings store (localStorage 'analyse:settings').
import { retestSpeed, useReviewStore, useSettingsStore, type SettingsState } from '../state'
import { ProfileSelect } from './ProfileSelect'
import { t } from './strings'

function Segmented<K extends 'theme' | 'pieceSet' | 'voice'>({
  label,
  field,
  options,
}: {
  label: string
  field: K
  options: Array<[SettingsState[K], string]>
}) {
  const value = useSettingsStore((s) => s[field])
  const update = useSettingsStore((s) => s.update)
  return (
    <div className="setting" role="group" aria-label={label}>
      <span className="setting-label">{label}</span>
      <span className="segmented">
        {options.map(([v, text]) => (
          <button
            type="button"
            key={String(v)}
            aria-pressed={value === v}
            onClick={() => update({ [field]: v } as Partial<SettingsState>)}
          >
            {text}
          </button>
        ))}
      </span>
    </div>
  )
}

function Check({ field, label }: { field: 'sounds' | 'coloredMoves'; label: string }) {
  const value = useSettingsStore((s) => s[field])
  const update = useSettingsStore((s) => s.update)
  return (
    <label className="setting check">
      <input type="checkbox" checked={value} onChange={(e) => update({ [field]: e.target.checked })} />
      <span>{label}</span>
    </label>
  )
}

export function SettingsPanel() {
  const analysing = useReviewStore((s) => s.phase === 'analysing')
  return (
    <section className="settings-panel panel" data-testid="settings-panel" aria-label={t('settings.title')}>
      <Segmented
        label={t('settings.theme')}
        field="theme"
        options={[
          ['dark', t('settings.themeDark')],
          ['light', t('settings.themeLight')],
        ]}
      />
      <Segmented
        label={t('settings.pieces')}
        field="pieceSet"
        options={[
          ['kaneo', t('settings.piecesKaneo')],
          ['cburnett', t('settings.piecesCburnett')],
        ]}
      />
      <Segmented
        label={t('settings.coachAddresses')}
        field="voice"
        options={[
          ['me', t('settings.coachMe')],
          ['neutral', t('settings.coachNeutral')],
        ]}
      />
      <Check field="sounds" label={t('settings.sounds')} />
      <Check field="coloredMoves" label={t('settings.coloredMoves')} />
      <ProfileSelect testId="settings-profile" />
      <button type="button" disabled={analysing} onClick={() => void retestSpeed()}>
        {t('settings.retestSpeed')}
      </button>
    </section>
  )
}
