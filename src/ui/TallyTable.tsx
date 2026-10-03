// Tally table (G.12): one row per classification in the fixed order Brilliant ... Forced; columns
// White count | icon + label | Black count.
import { CLASSIFICATIONS, type GameReview } from '../types/review'
import { ClassificationIcon } from './icons/ClassificationIcon'
import { t } from './strings'

export function TallyTable({ review }: { review?: GameReview }) {
  return (
    <table className="tally" data-testid="tally">
      <thead>
        <tr>
          <th scope="col">{t('color.white')}</th>
          <th scope="col">
            <span className="sr-only">{t('movelist.label')}</span>
          </th>
          <th scope="col">{t('color.black')}</th>
        </tr>
      </thead>
      <tbody>
        {CLASSIFICATIONS.map((c) => (
          <tr key={c} data-testid={`tally-${c}`} title={t(`tooltip.class.${c}`)}>
            <td className="tally-count" data-testid={`tally-white-${c}`}>
              {review?.tally.white[c] ?? 0}
            </td>
            <td className="tally-label" style={{ color: `var(--color-classification-text-${c})` }}>
              <ClassificationIcon classification={c} size={20} decorative />
              <span>{t(`class.${c}`)}</span>
            </td>
            <td className="tally-count" data-testid={`tally-black-${c}`}>
              {review?.tally.black[c] ?? 0}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
