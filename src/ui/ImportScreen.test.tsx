// Import screen (G.1): the inline error panel renders Appendix F strings by key from IMPORT_STRINGS and
// ENGINE_STRINGS (role="alert", never a modal), the notice line, the in-progress confirmation, the engine line.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importGame, parseInput } from '../import'
import { useReviewStore, useSettingsStore } from '../state'
import { ImportScreen } from './ImportScreen'
import { fixtureGame } from './test-fixtures'

vi.mock('../import', () => ({
  parseInput: vi.fn(),
  importGame: vi.fn(),
  confirmInProgress: vi.fn((g: object) => ({ ...g, inProgress: true })),
  IMPORT_STRINGS: {
    'I-2':
      "Couldn't find this live game. If it's still being played, Chess.com only publishes it once it ends. Try again after the game finishes.",
    'I-4': 'This daily game is still in progress ({plyCount} moves so far). Analyse the moves played so far?',
    'I-13': "Bughouse games can't be analysed (Stockfish doesn't play this variant).",
    'I-14': "{variant} games can't be analysed (Stockfish doesn't play this variant).",
    'I-33': 'This PGN contains {n} games. Pick one.',
    'I-34':
      'Paste a Chess.com game link (chess.com/game/live/…, /daily/…, /computer/…), a Lichess game link (lichess.org/XXXXXXXX) or a PGN.',
    'P-5':
      "Importing by link needs a small server proxy, which this static build doesn't have. Enter the Chess.com username of either player (we'll find game {id} through Chess.com's public API), or paste the PGN.",
    'P-9':
      "Couldn't find game {id} in {username}'s recent archives ({months}). Check the username (either player works), or paste the PGN.",
    'P-10': 'Chess.com username (optional: shows which side is yours and is used as a fallback)',
    'P-11': 'Chess.com username of either player (required for Chess.com links)',
  },
}))
vi.mock('../engine', () => ({
  deviceProfile: vi.fn(() => null),
  createEnginePool: vi.fn(),
  calibrate: vi.fn(),
  ENGINE_STRINGS: {
    'E-1':
      "Your browser can't run the analysis engine. It needs WebAssembly SIMD, which is available in Safari 16.4+ (iOS 16.4+), Chrome 91+, Firefox 89+, Edge 91+. Please update your browser or open this page on a newer device.",
    'E-2':
      "The engine couldn't start (WebAssembly error: {message}). This usually means the device is low on memory. Close other tabs and apps, then tap Retry. If it keeps failing, use a desktop browser.",
    'E-4': 'Fast mode (depth 14)',
    'E-6': 'Single-core mode',
  },
}))

afterEach(cleanup)
beforeEach(() => {
  localStorage.clear()
  vi.mocked(importGame).mockReset()
  vi.mocked(parseInput).mockReset()
  useReviewStore.getState().reset()
  useReviewStore.getState().patch({ engine: { phase: 'not-loaded' }, tier: undefined })
  useSettingsStore.getState().update({ username: '', userColor: 'w' })
})

describe('error panel renders by key (G.6, Appendix F)', () => {
  it('I-2 from IMPORT_STRINGS, in a role="alert" panel', () => {
    useReviewStore.getState().patch({ importError: { key: 'I-2', fallback: 'ignored' } })
    render(<ImportScreen />)
    const panel = screen.getByTestId('import-error')
    expect(panel).toHaveAttribute('role', 'alert')
    expect(panel).toHaveAttribute('data-key', 'I-2')
    expect(panel).toHaveTextContent(
      "Couldn't find this live game. If it's still being played, Chess.com only publishes it once it ends.",
    )
    expect(document.querySelector('dialog, [role="dialog"]')).toBeNull()
  })

  it('fills named placeholders from the error detail (P-9, I-14)', () => {
    useReviewStore.getState().patch({
      importError: {
        key: 'P-9',
        vars: { id: '129688175007', username: 'hikaru', months: '2025/01, 2024/12' },
      },
    })
    const { unmount } = render(<ImportScreen />)
    expect(screen.getByTestId('import-error')).toHaveTextContent(
      "Couldn't find game 129688175007 in hikaru's recent archives (2025/01, 2024/12).",
    )
    unmount()
    useReviewStore.getState().patch({ importError: { key: 'I-14', vars: { variant: 'Crazyhouse' } } })
    render(<ImportScreen />)
    expect(screen.getByTestId('import-error')).toHaveTextContent(
      "Crazyhouse games can't be analysed (Stockfish doesn't play this variant).",
    )
  })

  it("uses the module's formatted message only when a placeholder has no value", () => {
    useReviewStore.getState().patch({ importError: { key: 'P-9', fallback: 'formatted by src/import' } })
    render(<ImportScreen />)
    expect(screen.getByTestId('import-error')).toHaveTextContent('formatted by src/import')
  })

  it('an ImportError from importGame is shown by its code key (live_not_found -> I-2)', async () => {
    vi.mocked(parseInput).mockReturnValue({ kind: 'chesscom', cckind: 'live', id: '1859764312' })
    vi.mocked(importGame).mockResolvedValue({
      ok: false,
      error: { code: 'live_not_found', message: 'text from src/import' },
    })
    render(<ImportScreen />)
    fireEvent.change(screen.getByTestId('import-input'), {
      target: { value: 'https://www.chess.com/game/live/1859764312' },
    })
    fireEvent.click(screen.getByTestId('import-submit'))
    await waitFor(() => expect(screen.getByTestId('import-error')).toHaveAttribute('data-key', 'I-2'))
    expect(screen.getByTestId('import-error')).toHaveTextContent("Couldn't find this live game.")
    expect(window.location.search).toBe('?game=cc:live:1859764312')
  })

  it('variant_unsupported without a variant name is the bughouse row I-13', async () => {
    vi.mocked(parseInput).mockReturnValue({ kind: 'chesscom', cckind: 'live', id: '184867110839' })
    vi.mocked(importGame).mockResolvedValue({
      ok: false,
      error: { code: 'variant_unsupported', message: '' },
    })
    render(<ImportScreen />)
    fireEvent.change(screen.getByTestId('import-input'), { target: { value: 'x' } })
    fireEvent.click(screen.getByTestId('import-submit'))
    await waitFor(() => expect(screen.getByTestId('import-error')).toHaveAttribute('data-key', 'I-13'))
  })

  it('an unrecognised input shows I-34 without calling importGame', async () => {
    vi.mocked(parseInput).mockReturnValue({ kind: 'unrecognised' })
    render(<ImportScreen />)
    fireEvent.change(screen.getByTestId('import-input'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByTestId('import-submit'))
    await waitFor(() => expect(screen.getByTestId('import-error')).toHaveAttribute('data-key', 'I-34'))
    expect(importGame).not.toHaveBeenCalled()
  })

  it('pgn_multiple lists the choices under I-33', async () => {
    const a = fixtureGame({ id: 'pgn:aaaaaaaaaaaa', white: { name: 'A' }, black: { name: 'B' } })
    const b = fixtureGame({ id: 'pgn:bbbbbbbbbbbb', white: { name: 'C' }, black: { name: 'D' } })
    vi.mocked(parseInput).mockReturnValue({ kind: 'pgn', pgn: '[Event "x"]' })
    vi.mocked(importGame).mockResolvedValue({
      ok: false,
      error: { code: 'pgn_multiple', message: '', choices: [a, b] },
    })
    render(<ImportScreen />)
    fireEvent.change(screen.getByTestId('import-input'), { target: { value: '[Event "x"]' } })
    fireEvent.click(screen.getByTestId('import-submit'))
    await waitFor(() =>
      expect(screen.getByTestId('import-error')).toHaveTextContent('This PGN contains 2 games.'),
    )
    expect(screen.getByText(/^A vs B/)).toBeInTheDocument()
    expect(screen.getByText(/^C vs D/)).toBeInTheDocument()
  })

  it('pages_needs_username is a notice (P-5) and focuses the username field', async () => {
    vi.mocked(parseInput).mockReturnValue({ kind: 'chesscom', cckind: 'live', id: '129688175007' })
    vi.mocked(importGame).mockResolvedValue({
      ok: false,
      error: {
        code: 'pages_needs_username',
        message: '',
        detail: { id: '129688175007' },
        needsUsername: true,
      },
    })
    render(<ImportScreen />)
    fireEvent.change(screen.getByTestId('import-input'), { target: { value: 'x' } })
    fireEvent.click(screen.getByTestId('import-submit'))
    await waitFor(() =>
      expect(screen.getByTestId('import-notice')).toHaveTextContent("we'll find game 129688175007 through"),
    )
    expect(screen.queryByTestId('import-error')).toBeNull()
    expect(document.activeElement).toBe(screen.getByTestId('import-username'))
  })

  it('an in-progress game asks for confirmation with "Analyse so far" (I-4)', async () => {
    const game = fixtureGame({ id: 'cc:daily:1034198172', result: '*' })
    vi.mocked(parseInput).mockReturnValue({ kind: 'chesscom', cckind: 'daily', id: '1034198172' })
    vi.mocked(importGame).mockResolvedValue({
      ok: true,
      game,
      via: 'proxy',
      pendingConfirmation: 'in_progress_daily',
    })
    render(<ImportScreen />)
    fireEvent.change(screen.getByTestId('import-input'), { target: { value: 'x' } })
    fireEvent.click(screen.getByTestId('import-submit'))
    await waitFor(() => expect(screen.getByTestId('confirm-in-progress')).toHaveTextContent('Analyse so far'))
    expect(screen.getByText(/This daily game is still in progress \(12 moves so far\)/)).toBeInTheDocument()
  })
})

describe('engine status line (G.7) and labels', () => {
  it('reads "Engine: not loaded" until the first analysis, then the badge', () => {
    const { rerender } = render(<ImportScreen />)
    expect(screen.getByTestId('engine-status')).toHaveTextContent('Engine: not loaded')
    useReviewStore.getState().patch({ engine: { phase: 'loading', percent: 0.42 } })
    rerender(<ImportScreen />)
    expect(screen.getByTestId('engine-status')).toHaveTextContent('Engine: loading 42%')
    useReviewStore
      .getState()
      .patch({ engine: { phase: 'ready', build: 'lite-single', threads: 1 }, tier: 'fast-14' })
    rerender(<ImportScreen />)
    expect(screen.getByTestId('engine-status')).toHaveTextContent('Single-core mode')
    expect(screen.getByTestId('engine-status')).toHaveTextContent('Fast mode (depth 14)')
    useReviewStore.getState().patch({ engine: { phase: 'error', key: 'E-2', message: 'OOM' } })
    rerender(<ImportScreen />)
    expect(screen.getByTestId('engine-status')).toHaveTextContent('(WebAssembly error: OOM)')
  })

  it('labels the username field with P-10 on the Vercel build and offers the colour toggle', () => {
    render(<ImportScreen />)
    expect(screen.getByLabelText(/Chess.com username \(optional/)).toBe(screen.getByTestId('import-username'))
    expect(screen.getByTestId('color-white')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('color-black'))
    expect(useSettingsStore.getState().userColor).toBe('b')
    expect(screen.getByTestId('color-black')).toHaveAttribute('aria-pressed', 'true')
  })

  it('greys the profile selector and shows E-4 in Fast mode', () => {
    useReviewStore.getState().patch({ tier: 'fast-14' })
    render(<ImportScreen />)
    expect(screen.getByTestId('profile-select')).toHaveClass('greyed')
    expect(screen.getByTestId('profile-select')).toHaveTextContent('Standard (depth 16, 1.5 s per move)')
  })
})
