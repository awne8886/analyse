// Hand-rolled SVG evaluation graph (G.9): y clamped to +-5 pawns (mates at +-5), White's area filled from the
// bottom, zero line, hover tooltip, click to jump, key-moment ticks, phase lines, cursor, hollow "not analysed"
// points. Text sits in an HTML overlay so the stretched SVG never distorts it.
import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { ImportedGame } from '../types/game'
import type { GameReview } from '../types/review'
import { CLASS_COLORS, PHASE_ENDGAME, PHASE_MIDDLEGAME } from './colors'
import { EVAL_CLAMP_PAWNS, formatEval, graphPoints, moveLabel, positionScore } from './format'
import { ClassificationIcon } from './icons/ClassificationIcon'
import { t } from './strings'

const W = 1000
const H = 200
const yOf = (pawns: number) => H / 2 - (pawns / EVAL_CLAMP_PAWNS) * (H / 2)
const fmtPawns = (p: number) => formatEval({ type: 'cp', value: Math.round(p * 100) })

export function EvalGraph({
  game,
  review,
  ply,
  theme,
  onSelect,
}: {
  game: ImportedGame
  review?: GameReview
  ply: number
  theme: 'dark' | 'light'
  onSelect: (ply: number) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const total = Math.max(1, game.moves.length)
  const xOf = (i: number) => (i / total) * W
  const points = graphPoints(review)
  const plotted = review ? review.plies.filter((p) => p.status !== 'pending').length : 0
  const last = points.length - 1

  const line = points.map((p) => `${xOf(p.x).toFixed(2)},${yOf(p.pawns).toFixed(2)}`).join(' ')
  const area = points.length ? `${xOf(0)},${H} ${line} ${xOf(last).toFixed(2)},${H}` : ''
  const values = points.map((p) => p.pawns)
  const label = points.length
    ? t('graph.label', { min: fmtPawns(Math.min(...values)), max: fmtPawns(Math.max(...values)), n: plotted })
    : t('graph.labelEmpty')

  const indexAt = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width || last < 0) return null
    return Math.max(0, Math.min(last, Math.round(((e.clientX - rect.left) / rect.width) * total)))
  }
  const phaseLines = [
    {
      start: review?.phaseStarts.middlegame,
      colour: PHASE_MIDDLEGAME,
      name: t('phase.middlegame'),
      key: 'middlegame',
    },
    { start: review?.phaseStarts.endgame, colour: PHASE_ENDGAME, name: t('phase.endgame'), key: 'endgame' },
  ].filter((p) => p.start !== undefined && p.start > 0) as Array<{
    start: number
    colour: string
    name: string
    key: string
  }>
  const hovered = hover !== null ? review?.plies[hover - 1] : undefined
  const hoverScore = hover !== null ? positionScore(review, hover) : undefined

  // Keyboard access (a11y M3): the focusable slider overlay moves a cursor over the plotted plies with the arrow
  // keys (tooltip shown), Home/End/PageUp/PageDown jump, and Enter or Space selects like a click. Its key events
  // never reach the global step hotkeys (navigation.ts).
  const clampIdx = (i: number) => Math.max(0, Math.min(Math.max(0, last), i))
  const cursor = clampIdx(hover ?? ply)
  const valueText = (i: number) => {
    const score = positionScore(review, i)
    const where = i > 0 && game.moves[i - 1] ? moveLabel(game.moves[i - 1]) : t('graph.start')
    const p = review?.plies[i - 1]
    const cls = p?.status === 'done' ? t(`class.${p.classification}`) : ''
    return t(cls ? 'graph.valueClassified' : 'graph.value', {
      move: where,
      class: cls,
      eval: score ? formatEval(score) : t('label.notAvailable'),
    })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowLeft: cursor - 1,
      ArrowDown: cursor - 1,
      ArrowRight: cursor + 1,
      ArrowUp: cursor + 1,
      PageDown: cursor - 10,
      PageUp: cursor + 10,
      Home: 0,
      End: last,
    }
    if (e.key in moves) setHover(clampIdx(moves[e.key]))
    else if (e.key === 'Enter' || e.key === ' ') onSelect(cursor)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div className="eval-graph-wrap">
      <svg
        className="eval-graph"
        data-testid="eval-graph"
        data-points={plotted}
        role="img"
        aria-label={label}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={(e) => setHover(indexAt(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const i = indexAt(e)
          if (i !== null) onSelect(i)
        }}
      >
        <rect x="0" y="0" width={W} height={H} className="eval-graph-bg" />
        {area ? <polygon points={area} className="eval-graph-area" /> : null}
        <line
          x1="0"
          x2={W}
          y1={H / 2}
          y2={H / 2}
          className="eval-graph-zero"
          vectorEffect="non-scaling-stroke"
        />
        {phaseLines.map((p) => (
          <line
            key={p.name}
            x1={xOf(p.start)}
            x2={xOf(p.start)}
            y1="0"
            y2={H}
            stroke={p.colour}
            strokeWidth="1.5"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {review?.keyMoments.map((k) => {
          const c = review.plies[k - 1]?.classification
          return (
            <line
              key={k}
              data-testid="key-moment-tick"
              className={`key-tick ${k === ply ? 'selected' : ''}`}
              x1={xOf(k)}
              x2={xOf(k)}
              y1="0"
              y2={H}
              stroke={c ? CLASS_COLORS[theme][c] : undefined}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
        <line
          x1={xOf(ply)}
          x2={xOf(ply)}
          y1="0"
          y2={H}
          className="eval-graph-cursor"
          vectorEffect="non-scaling-stroke"
        />
        {points
          .filter((p) => p.hollow)
          .map((p) => (
            <g key={`h${p.x}`} className="eval-graph-hollow">
              <line
                x1={xOf(p.x)}
                x2={xOf(p.x)}
                y1={yOf(p.pawns)}
                y2={yOf(p.pawns)}
                strokeWidth="8"
                strokeLinecap="round"
                className="hollow-ring"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={xOf(p.x)}
                x2={xOf(p.x)}
                y1={yOf(p.pawns)}
                y2={yOf(p.pawns)}
                strokeWidth="4"
                strokeLinecap="round"
                className="hollow-hole"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
      </svg>
      {phaseLines.map((p) => (
        <span
          key={p.name}
          className="eval-graph-phase"
          style={{ left: `${(p.start / total) * 100}%`, color: `var(--color-phase-${p.key}-text)` }}
        >
          {p.name}
        </span>
      ))}
      <div
        className="eval-graph-focus"
        data-testid="eval-graph-keyboard"
        role="slider"
        tabIndex={0}
        aria-label={t('graph.slider')}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, last)}
        aria-valuenow={cursor}
        aria-valuetext={valueText(cursor)}
        onFocus={() => setHover(cursor)}
        onBlur={() => setHover(null)}
        onKeyDown={onKeyDown}
      />
      {hover !== null && hoverScore ? (
        <div className="eval-graph-tip" style={{ left: `${(hover / total) * 100}%` }} role="presentation">
          {hovered && hovered.status === 'done' ? (
            <ClassificationIcon classification={hovered.classification} size={16} />
          ) : null}
          {hover > 0 ? <span>{moveLabel(game.moves[hover - 1])}</span> : null}
          <strong>{formatEval(hoverScore)}</strong>
        </div>
      ) : null}
    </div>
  )
}
