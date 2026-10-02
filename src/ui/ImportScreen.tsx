// Import screen (G.1): one box for a link or a PGN (paste or drop a .pgn file), the username field (P-10 / P-11),
// the "You played" toggle, the analysis profile, the inline error panel (role="alert", strings rendered by key,
// never a modal), the in-progress confirmation, the engine status line and the recent games.
import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from 'react'
import {
  cancelPending,
  chooseGame,
  confirmPending,
  deployTarget,
  listRecent,
  openRecent,
  submitInput,
  useReviewStore,
  useSettingsStore,
  type RecentGame,
} from '../state'
import { oneDecimal, playersRowResult } from './format'
import { renderKeyed } from './messages'
import { EngineStatus } from './EngineStatus'
import { ProfileSelect } from './ProfileSelect'
import { fmt, t } from './strings'

export function ImportScreen() {
  const inputId = useId()
  const userId = useId()
  const inputText = useReviewStore((s) => s.inputText)
  const phase = useReviewStore((s) => s.phase)
  const importError = useReviewStore((s) => s.importError)
  const importNotice = useReviewStore((s) => s.importNotice)
  const pending = useReviewStore((s) => s.pending)
  const focusUsername = useReviewStore((s) => s.focusUsername)
  const colorFromUsername = useReviewStore((s) => s.colorFromUsername)
  const patch = useReviewStore((s) => s.patch)
  const username = useSettingsStore((s) => s.username)
  const userColor = useSettingsStore((s) => s.userColor)
  const update = useSettingsStore((s) => s.update)
  const userRef = useRef<HTMLInputElement>(null)
  const [recent, setRecent] = useState<RecentGame[]>([])

  useEffect(() => {
    if (focusUsername > 0) userRef.current?.focus()
  }, [focusUsername])

  useEffect(() => {
    let alive = true
    listRecent()
      .then((r) => alive && setRecent(r))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const busy = phase === 'importing'
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!busy && inputText.trim()) void submitInput(inputText)
  }
  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    e.preventDefault()
    void file.text().then((text) => patch({ inputText: text }))
  }

  return (
    <section className="import-screen" aria-labelledby="import-title">
      <h1 id="import-title" className="screen-title">
        {t('import.title')}
      </h1>
      <form className="import-form panel" onSubmit={onSubmit}>
        <label htmlFor={inputId}>{t('import.inputLabel')}</label>
        <textarea
          id={inputId}
          data-testid="import-input"
          rows={4}
          value={inputText}
          placeholder={t('import.placeholder')}
          onChange={(e) => patch({ inputText: e.target.value })}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        />
        <label htmlFor={userId}>{renderKeyed({ key: deployTarget === 'pages' ? 'P-11' : 'P-10' })}</label>
        <input
          id={userId}
          ref={userRef}
          data-testid="import-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => update({ username: e.target.value })}
        />
        <div className="field" role="group" aria-label={t('import.youPlayed')}>
          <span>{t('import.youPlayed')}</span>
          <span className="segmented">
            <button
              type="button"
              data-testid="color-white"
              aria-pressed={userColor === 'w'}
              onClick={() => {
                update({ userColor: 'w' })
                patch({ colorFromUsername: false })
              }}
            >
              {t('import.white')}
            </button>
            <button
              type="button"
              data-testid="color-black"
              aria-pressed={userColor === 'b'}
              onClick={() => {
                update({ userColor: 'b' })
                patch({ colorFromUsername: false })
              }}
            >
              {t('import.black')}
            </button>
          </span>
          {colorFromUsername ? <small className="note">{t('import.fromUsername')}</small> : null}
        </div>
        <ProfileSelect testId="profile-select" />
        <button type="submit" className="primary" data-testid="import-submit" disabled={busy}>
          {t('import.submit')}
        </button>
        {importNotice ? (
          <p className="notice" data-testid="import-notice" role="status">
            {renderKeyed(importNotice)}
          </p>
        ) : null}
        {importError ? (
          <div className="error-panel" data-testid="import-error" role="alert" data-key={importError.key}>
            <p>{renderKeyed(importError)}</p>
            {importError.choices?.length ? (
              <ul className="choices">
                {importError.choices.map((g) => (
                  <li key={g.id}>
                    <button type="button" onClick={() => void chooseGame(g)}>
                      {fmt(t('import.choiceLine'), {
                        White: g.white.name,
                        Black: g.black.name,
                        date: g.date ?? '',
                        result: playersRowResult(g.result),
                      })}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {pending ? (
          <div className="confirm-panel" data-key={pending.key}>
            <p>{renderKeyed(pending)}</p>
            <button
              type="button"
              className="primary"
              data-testid="confirm-in-progress"
              onClick={() => void confirmPending()}
            >
              {t('import.analyseSoFar')}
            </button>
            <button type="button" onClick={cancelPending}>
              {t('button.cancel')}
            </button>
          </div>
        ) : null}
        <EngineStatus />
      </form>
      <section className="recent panel" aria-labelledby="recent-title">
        <h2 id="recent-title">{t('import.recent')}</h2>
        <ul data-testid="recent-games">
          {recent.map((r) => (
            <li key={r.gameId} data-testid="recent-game">
              <button type="button" onClick={() => void openRecent(r.gameId)}>
                <span>
                  {r.white} - {r.black}
                </span>
                <span>{playersRowResult(r.result)}</span>
                {r.date ? <span>{r.date}</span> : null}
                <span>
                  {r.accuracy.white !== undefined ? oneDecimal(r.accuracy.white) : '-'} /{' '}
                  {r.accuracy.black !== undefined ? oneDecimal(r.accuracy.black) : '-'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {recent.length ? null : <p className="hint">{t('import.recentEmpty')}</p>}
      </section>
    </section>
  )
}
