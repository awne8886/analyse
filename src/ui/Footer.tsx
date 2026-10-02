// Footer with the attribution line (F.5) and the About / Licenses panel (R32, F.4, F.5). The panel is inline,
// never a modal; "Licenses" loads THIRD_PARTY_LICENSES.md on demand.
import { useState } from 'react'
import type { ImportedGame } from '../types/game'
import { t } from './strings'

export const REPO_URL = 'https://github.com/awne8886/analyse'

function Attribution({ game }: { game: ImportedGame }) {
  if (game.site === 'pgn') return <span>{t('attribution.pgn')}</span>
  const text = t(game.site === 'chesscom' ? 'attribution.chesscom' : 'attribution.lichess')
  return game.sourceUrl ? (
    <a href={game.sourceUrl} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  ) : (
    <span>{text}</span>
  )
}

export function AboutPanel({ onClose }: { onClose: () => void }) {
  const [licenses, setLicenses] = useState<string | null>(null)
  const [repoBefore, repoAfter] = t('about.source').split('{repo}')
  return (
    <section className="about-panel panel" data-testid="about-panel" aria-label={t('about.title')}>
      <p>{t('about.engine')}</p>
      <ul className="about-links">
        <li>
          <a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noopener noreferrer">
            {t('about.linkStockfish')}
          </a>
        </li>
        <li>
          <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noopener noreferrer">
            {t('about.linkStockfishJs')}
          </a>
        </li>
        <li>
          <a
            href={`${import.meta.env.BASE_URL}engine/sf19/Copying.txt`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('about.linkCopying')}
          </a>
        </li>
      </ul>
      <p>
        {repoBefore}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          {REPO_URL}
        </a>
        {repoAfter}
      </p>
      <p>{t('about.notAffiliated')}</p>
      <p>{t('about.trademark')}</p>
      <p>{t('about.browsers')}</p>
      <p>{t('honesty')}</p>
      <div className="about-actions">
        <button
          type="button"
          onClick={() =>
            void import('../../THIRD_PARTY_LICENSES.md?raw').then((m: { default: string }) =>
              setLicenses(m.default),
            )
          }
        >
          {t('about.licenses')}
        </button>
        <button type="button" onClick={onClose}>
          {t('about.close')}
        </button>
      </div>
      {licenses !== null ? <pre className="licenses">{licenses}</pre> : null}
    </section>
  )
}

export function Footer({ game }: { game?: ImportedGame }) {
  const [open, setOpen] = useState(false)
  return (
    <footer className="footer">
      <div className="footer-line">
        {game ? <Attribution game={game} /> : <span>{t('app.tagline')}</span>}
        <button
          type="button"
          className="link-button"
          data-testid="about-licenses"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {t('about.title')}
        </button>
      </div>
      {open ? <AboutPanel onClose={() => setOpen(false)} /> : null}
    </footer>
  )
}
