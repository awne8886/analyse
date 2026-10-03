// Phase grades (G.14, R22): Opening / Middlegame / Endgame, a classification icon per side by accuracy band with
// tooltip G-T3, or "None" with tooltip G-T4 when the side made fewer than 4 moves in the phase.
import type { GameReview, Phase } from '../types/review'
import { oneDecimal, phaseGradeClass } from './format'
import { ClassificationIcon } from './icons/ClassificationIcon'
import { t } from './strings'

const PHASES: Phase[] = ['opening', 'middlegame', 'endgame']
const SIDES = ['white', 'black'] as const

export function PhaseGrades({ review }: { review?: GameReview }) {
  return (
    <div className="phase-grades">
      <span />
      {PHASES.map((p) => (
        <span key={p} className="phase-head">
          {t(`phase.${p}`)}
        </span>
      ))}
      {SIDES.map((side) => (
        <div className="phase-row" key={side}>
          <span className="phase-side">{t(`color.${side}`)}</span>
          {PHASES.map((phase) => {
            const acc = review?.phaseAccuracy[side][phase]
            const vars = { color: t(`color.${side}`), phase: t(`phase.lower.${phase}`) }
            const grade = acc === undefined ? undefined : phaseGradeClass(acc)
            const tip =
              acc === undefined
                ? t('tooltip.G-T4', vars)
                : t('tooltip.G-T3', { ...vars, acc: oneDecimal(acc) })
            // a11y M6: a generic span drops aria-label, so the cell is an image named by its grade and tooltip
            const label = t('phase.gradeLabel', { grade: grade ? t(`class.${grade}`) : t('label.none'), tip })
            return (
              <span
                key={phase}
                className="phase-cell"
                data-testid={`phase-grade-${side}-${phase}`}
                title={tip}
                role="img"
                aria-label={label}
              >
                {grade === undefined ? (
                  t('label.none')
                ) : (
                  <ClassificationIcon classification={grade} size={24} decorative />
                )}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}
