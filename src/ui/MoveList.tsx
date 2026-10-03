// Move list (G.21): move number | White SAN + icon | Black SAN + icon, 30 px alternating rows, SAN in the
// classification colour when "Coloured moves" is on, the active ply aria-current and scrolled into view; on
// phones the same buttons form a horizontal strip (CSS, G.29).
import { useEffect, useRef } from 'react'
import type { GameMove, ImportedGame } from '../types/game'
import type { GameReview } from '../types/review'
import { moveNumber } from './format'
import { ClassificationIcon } from './icons/ClassificationIcon'
import { renderKeyed } from './messages'
import { t } from './strings'

interface Row {
  num: number
  white?: GameMove
  black?: GameMove
}

function rowsOf(moves: GameMove[]): Row[] {
  const rows: Row[] = []
  for (const m of moves) {
    const num = moveNumber(m)
    let row = rows[rows.length - 1]
    if (!row || row.num !== num || (m.color === 'w' && row.white) || (m.color === 'b' && row.black)) {
      row = { num }
      rows.push(row)
    }
    if (m.color === 'w') row.white = m
    else row.black = m
  }
  return rows
}

export function MoveList({
  game,
  review,
  ply,
  coloredMoves,
  onSelect,
}: {
  game: ImportedGame
  review?: GameReview
  ply: number
  coloredMoves: boolean
  onSelect: (ply: number) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [ply])

  const cell = (m: GameMove | undefined) => {
    if (!m) return <span className="move-cell move-empty" />
    const pr = review?.plies[m.ply - 1]
    const done = pr?.status === 'done'
    const c = done ? pr.classification : undefined
    return (
      <button
        type="button"
        className={`move-cell ${m.ply === ply ? 'active' : ''}`}
        data-testid={`move-${m.ply}`}
        data-classification={c ?? pr?.status ?? 'pending'}
        aria-current={m.ply === ply ? 'true' : undefined}
        onClick={() => onSelect(m.ply)}
      >
        <span
          className="move-san"
          style={coloredMoves && c ? { color: `var(--color-classification-text-${c})` } : undefined}
        >
          {m.color === 'w' ? <span className="strip-num">{`${moveNumber(m)}.`}</span> : null}
          {m.san}
        </span>
        {c ? <ClassificationIcon classification={c} size={16} /> : null}
        {pr?.status === 'not-analysed' ? (
          <span
            className="move-na"
            role="img"
            title={renderKeyed({ key: 'E-9' })}
            aria-label={renderKeyed({ key: 'E-9' })}
          />
        ) : null}
      </button>
    )
  }

  return (
    <div
      className="move-list"
      data-testid="move-list"
      ref={listRef}
      role="list"
      aria-label={t('movelist.label')}
    >
      {rowsOf(game.moves).map((row, i) => (
        <div className={`move-row ${i % 2 ? 'odd' : 'even'}`} key={`${row.num}-${i}`} role="listitem">
          <span className="move-num">{row.num}.</span>
          {cell(row.white)}
          {cell(row.black)}
        </div>
      ))}
    </div>
  )
}
