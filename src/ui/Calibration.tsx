// Developer calibration page `/?dev=calibration` (R20): pulls one month of a player's games with chess.com's
// reported `accuracies` from the public API, analyses each game here, and prints the mean absolute error of the
// shipped preset and of the lichess preset (the only place the lichess preset is selectable).
import { useState, type FormEvent } from 'react'
import { LICHESS_PRESET, analyzeGame, gameAccuracy, winPctWhite } from '../analysis'
import { importGame, parseInput } from '../import'
import { deployTarget, engineProfileFor, ensureEngine, getDevice, tierFor, useSettingsStore } from '../state'
import type { GameReview } from '../types/review'
import { oneDecimal } from './format'
import { t } from './strings'

interface Row {
  url: string
  reported: { white: number; black: number }
  shipped: { white?: number; black?: number }
  lichess: { white?: number; black?: number }
}

function accuracies(review: GameReview) {
  const moves = review.plies.map((p) => ({
    color: p.color,
    loss: p.loss,
    classification: p.classification,
    notAnalysed: p.status === 'not-analysed',
  }))
  const series = [
    winPctWhite(review.plies[0].evalBefore, review.plies[0].before),
    ...review.plies.map((p) => winPctWhite(p.evalAfter, p.after)),
  ]
  return {
    shipped: gameAccuracy(moves),
    lichess: gameAccuracy(moves, { preset: LICHESS_PRESET.accuracy, whiteWinSeries: series }),
  }
}

function mae(rows: Row[], preset: 'shipped' | 'lichess'): { mae: number; n: number } {
  const errs: number[] = []
  for (const r of rows) {
    for (const side of ['white', 'black'] as const) {
      const v = r[preset][side]
      if (v !== undefined) errs.push(Math.abs(v - r.reported[side]))
    }
  }
  return { mae: errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0, n: errs.length }
}

export function Calibration() {
  const [username, setUsername] = useState('')
  const [month, setMonth] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const profileChoice = useSettingsStore((s) => s.profile)

  const run = async (e: FormEvent) => {
    e.preventDefault()
    setRows([])
    setError('')
    setRunning(true)
    try {
      const res = await fetch(
        `https://api.chess.com/pub/player/${username.trim().toLowerCase()}/games/${month.trim()}`,
      )
      if (!res.ok) {
        setError(t('calibration.fetchFailed', { status: res.status }))
        return
      }
      const body = (await res.json()) as {
        games?: Array<{
          url: string
          pgn?: string
          rules?: string
          accuracies?: { white: number; black: number }
        }>
      }
      const games = (body.games ?? []).filter((g) => g.accuracies && g.pgn && g.rules === 'chess')
      setTotal(games.length)
      const { pool, tier } = await ensureEngine()
      const device = getDevice()
      if (!device) return
      const profile = engineProfileFor(device, tierFor(profileChoice, tier))
      for (const g of games) {
        const imported = await importGame(parseInput(g.pgn as string), { deployTarget })
        if (!imported.ok) continue
        const review = await analyzeGame(imported.game, pool, profile, {})
        const acc = accuracies(review)
        setRows((prev) => [...prev, { url: g.url, reported: g.accuracies!, ...acc }])
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const shipped = mae(rows, 'shipped')
  const lichess = mae(rows, 'lichess')
  return (
    <section className="calibration panel" data-testid="calibration">
      <h1 className="screen-title">{t('calibration.title')}</h1>
      <form onSubmit={(e) => void run(e)} className="calibration-form">
        <label>
          {t('calibration.username')}
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          {t('calibration.month')}
          <input value={month} placeholder="2025/01" onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button type="submit" className="primary" disabled={running || !username || !month}>
          {t('calibration.run')}
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      <p role="status">{t('calibration.status', { done: rows.length * 2, total: total * 2 })}</p>
      <p>
        {t('calibration.mae', {
          preset: t('calibration.presetShipped'),
          mae: oneDecimal(shipped.mae),
          n: shipped.n,
        })}
      </p>
      <p>
        {t('calibration.mae', {
          preset: t('calibration.presetLichess'),
          mae: oneDecimal(lichess.mae),
          n: lichess.n,
        })}
      </p>
      <table className="calibration-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.url}>
              <td>
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.url.split('/').pop()}
                </a>
              </td>
              <td>
                {oneDecimal(r.reported.white)} / {oneDecimal(r.reported.black)}
              </td>
              <td>
                {r.shipped.white !== undefined ? oneDecimal(r.shipped.white) : '-'} /{' '}
                {r.shipped.black !== undefined ? oneDecimal(r.shipped.black) : '-'}
              </td>
              <td>
                {r.lichess.white !== undefined ? oneDecimal(r.lichess.white) : '-'} /{' '}
                {r.lichess.black !== undefined ? oneDecimal(r.lichess.black) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
