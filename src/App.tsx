// The app shell: header (name, New game, Settings), the current screen (no router; the screen follows the
// store and the query string, R29), the footer with About / Licenses, and the global review hotkeys (G.23).
import { Settings as SettingsIcon } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { newGame, useReviewStore, useSettingsStore } from './state'
import { Footer } from './ui/Footer'
import { ImportScreen } from './ui/ImportScreen'
import { MoveByMove } from './ui/MoveByMove'
import { handleKey } from './ui/navigation'
import { Overview } from './ui/Overview'
import { SettingsPanel } from './ui/Settings'
import { t } from './ui/strings'
import './ui/theme.css'

const Calibration = lazy(() => import('./ui/Calibration').then((m) => ({ default: m.Calibration })))

export default function App() {
  const screen = useReviewStore((s) => s.screen)
  const game = useReviewStore((s) => s.game)
  const review = useReviewStore((s) => s.review)
  const theme = useSettingsStore((s) => s.theme)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (handleKey(e)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const reviewing = game !== undefined && (screen === 'overview' || screen === 'moves')
  return (
    <div className={`app theme-${theme}`}>
      <header className="app-header">
        <span className="app-name">{t('app.name')}</span>
        <nav className="app-nav">
          {reviewing ? (
            <button type="button" onClick={newGame}>
              {t('button.newGame')}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="settings"
            aria-expanded={settingsOpen}
            aria-label={t('button.settings')}
            onClick={() => setSettingsOpen((o) => !o)}
          >
            <SettingsIcon size={18} aria-hidden />
            <span className="label">{t('button.settings')}</span>
          </button>
        </nav>
      </header>
      {settingsOpen ? <SettingsPanel /> : null}
      <main className="app-main">
        {screen === 'calibration' ? (
          <Suspense fallback={null}>
            <Calibration />
          </Suspense>
        ) : reviewing ? (
          <div
            className="review"
            data-testid="review"
            data-complete={review?.complete === true ? 'true' : 'false'}
            data-game-id={game.id}
          >
            {screen === 'overview' ? <Overview /> : <MoveByMove />}
          </div>
        ) : (
          <ImportScreen />
        )}
      </main>
      <Footer game={reviewing ? game : undefined} />
    </div>
  )
}
