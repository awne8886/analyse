// Eval bar (G.19): White's share grows from White's side (bottom when White is at the bottom, flips with the
// board); a horizontal strip under the board on phones (G.29). Text per F.4 at the winning end.
import type { CSSProperties } from 'react'
import type { Score } from '../types/engine'
import { formatEval, whiteBarPercent } from './format'
import { t } from './strings'

export function EvalBar({
  score,
  mover,
  orientation,
  resultText,
}: {
  score?: Score
  /** the side that made the last move (a `mate 0` board is full for it) */
  mover?: 'w' | 'b'
  orientation: 'white' | 'black'
  /** after the last move: `1-0`, `0-1`, `1/2-1/2` or `*` */
  resultText?: string
}) {
  const pct = score ? whiteBarPercent(score, mover) : 50
  const text = resultText ?? (score ? formatEval(score) : '')
  const whiteAhead = resultText ? resultText !== '0-1' : pct >= 50
  return (
    <div
      className={`eval-bar ${orientation === 'black' ? 'eval-bar-flipped' : ''}`}
      data-testid="eval-bar"
      role="img"
      aria-label={t('evalbar.label', { value: text || '…' })}
      style={{ '--white-pct': `${pct}%` } as CSSProperties}
    >
      <div className="eval-bar-white" />
      <span className={`eval-bar-text ${whiteAhead ? 'at-white' : 'at-black'}`}>{text}</span>
    </div>
  )
}
