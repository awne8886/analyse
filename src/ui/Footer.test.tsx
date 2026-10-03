// About / Licenses panel (R32, F.5) and the attribution line.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Footer } from './Footer'
import { fixtureGame } from './test-fixtures'

afterEach(cleanup)

describe('About panel (R32)', () => {
  it('opens from the footer with the Stockfish line, the links and the non-affiliation line', () => {
    render(<Footer />)
    expect(screen.queryByTestId('about-panel')).toBeNull()
    fireEvent.click(screen.getByTestId('about-licenses'))
    const panel = screen.getByTestId('about-panel')
    expect(panel).toHaveTextContent(
      'Engine: Stockfish 19 via stockfish.js v19.0.0 (stockfish.js (c) Chess.com, LLC / Nathan Rugg; Stockfish (c) the Stockfish developers), GPLv3.',
    )
    expect(panel).toHaveTextContent('Not affiliated with Chess.com.')
    expect(panel).toHaveTextContent('Chess.com is a trademark of Chess.com, LLC.')
    expect(panel).toHaveTextContent('Minimum browsers: Safari/iOS 16.4+, Chrome 91+, Firefox 89+, Edge 91+.')
    expect(panel).toHaveTextContent(
      "This site's source is GPL-3.0-or-later: https://github.com/awne8886/analyse.",
    )
    expect(panel).toHaveTextContent('Results are an approximation')
    const hrefs = within(panel)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href') ?? '')
    expect(hrefs).toContain('https://github.com/official-stockfish/Stockfish')
    expect(hrefs).toContain('https://github.com/nmrugg/stockfish.js')
    const copying = hrefs.find((h) => h.endsWith('engine/sf19/Copying.txt')) as string
    expect(copying.startsWith(import.meta.env.BASE_URL)).toBe(true)
    expect(copying).toBe(`${import.meta.env.BASE_URL}engine/sf19/Copying.txt`)
  })

  it('"Licenses" shows THIRD_PARTY_LICENSES.md', async () => {
    render(<Footer />)
    fireEvent.click(screen.getByTestId('about-licenses'))
    fireEvent.click(screen.getByRole('button', { name: 'Licenses' }))
    await waitFor(() => expect(screen.getByText(/Third-party assets and licenses/)).toBeInTheDocument())
  })
})

describe('attribution (F.5)', () => {
  it('links back to the game for Chess.com and Lichess, no link for a pasted PGN', () => {
    const { unmount } = render(<Footer game={fixtureGame()} />)
    expect(screen.getByRole('link', { name: 'Game data from Chess.com' })).toHaveAttribute(
      'href',
      'https://www.chess.com/game/live/129688175007',
    )
    unmount()
    const li = render(
      <Footer
        game={fixtureGame({ site: 'lichess', id: 'li:4S1PZUvW', sourceUrl: 'https://lichess.org/4S1PZUvW' })}
      />,
    )
    expect(screen.getByRole('link', { name: 'Game data from Lichess' })).toHaveAttribute(
      'href',
      'https://lichess.org/4S1PZUvW',
    )
    li.unmount()
    render(<Footer game={fixtureGame({ site: 'pgn', id: 'pgn:a1b2c3d4e5f6', sourceUrl: undefined })} />)
    expect(screen.getByText('Game data from a pasted PGN').tagName).not.toBe('A')
  })
})
