// In-memory review and screen state (not persisted; IndexedDB holds games and reviews, persistence.ts).
import { create } from 'zustand'
import type { Tier } from '../types/engine'
import type { ImportedGame } from '../types/game'
import type { Classification, GameReview } from '../types/review'

export type Screen = 'import' | 'overview' | 'moves' | 'calibration'
export type RunPhase = 'idle' | 'importing' | 'analysing' | 'complete'

/** A message rendered by key (Appendix F row key such as 'I-2' / 'P-5' / 'E-2', or a UI_STRINGS key) with its
 *  placeholder values; `fallback` is the already formatted text a module supplied (used only when a placeholder
 *  cannot be filled from `vars`). */
export interface KeyedText {
  key: string
  vars?: Record<string, string | number>
  fallback?: string
}
export interface ImportErrorView extends KeyedText {
  choices?: ImportedGame[]
  retryEngine?: boolean
}
export interface PendingConfirmation extends KeyedText {
  game: ImportedGame
  notice?: 'ambiguous_resolved' | 'custom_start'
}
export type EngineView =
  | { phase: 'not-loaded' }
  | { phase: 'loading'; percent: number | null }
  | { phase: 'ready'; build: 'lite-single' | 'lite'; threads: number }
  | { phase: 'error'; key: 'E-1' | 'E-2'; message: string }
export type RetryGrade = 'correct' | 'good' | 'ok' | 'incorrect'
export interface RetryState {
  active: boolean
  checking: boolean
  /** board shown while the tried move is on the board (null: the position before the move) */
  fen: string | null
  feedback?: { grade: RetryGrade; classification: Classification; praise: string }
}
export interface Progress {
  done: number
  total: number
  etaMs: number | null
  refining: number
}

export interface ReviewState {
  game?: ImportedGame
  review?: GameReview
  /** 0 = start position, k = the position after ply k (PlyReview.ply === k) */
  ply: number
  screen: Screen
  phase: RunPhase
  inputText: string
  importError?: ImportErrorView
  importNotice?: KeyedText
  pending?: PendingConfirmation
  /** increments to move focus to the username field (P-1, P-4, P-5, I-18) */
  focusUsername: number
  colorFromUsername: boolean
  notice?: 'ambiguous_resolved' | 'custom_start'
  engine: EngineView
  tier?: Tier
  progress?: Progress
  /** E-3: the ply the interrupted analysis resumed from */
  resumedFrom?: number
  flipped: boolean
  showBest: boolean
  showReply: boolean
  retry: RetryState
  linkCopied: boolean

  patch: (p: Partial<ReviewState>) => void
  /** clamps to 0..number of plies; clears the per-ply overlays (best/reply arrows, retry) */
  setPly: (ply: number) => void
  setScreen: (screen: Screen) => void
  toggleFlip: () => void
  toggleShowBest: () => void
  toggleShowReply: () => void
  /** a freshly imported or loaded game: everything per-game resets */
  openGame: (game: ImportedGame, review?: GameReview, ply?: number) => void
  /** back to an empty import screen */
  reset: () => void
}

const IDLE_RETRY: RetryState = { active: false, checking: false, fen: null }

const perGameReset = {
  review: undefined,
  ply: 0,
  importError: undefined,
  importNotice: undefined,
  pending: undefined,
  notice: undefined,
  progress: undefined,
  resumedFrom: undefined,
  showBest: false,
  showReply: false,
  retry: IDLE_RETRY,
  linkCopied: false,
}

export const useReviewStore = create<ReviewState>()((set, get) => ({
  ply: 0,
  screen: 'import',
  phase: 'idle',
  inputText: '',
  focusUsername: 0,
  colorFromUsername: false,
  engine: { phase: 'not-loaded' },
  flipped: false,
  showBest: false,
  showReply: false,
  retry: IDLE_RETRY,
  linkCopied: false,

  patch: (p) => set(p),
  setPly: (ply) => {
    const max = get().game?.moves.length ?? 0
    const next = Math.max(0, Math.min(max, Math.trunc(ply)))
    set({ ply: next, showBest: false, showReply: false, retry: IDLE_RETRY })
  },
  setScreen: (screen) => set({ screen }),
  toggleFlip: () => set((s) => ({ flipped: !s.flipped })),
  toggleShowBest: () => set((s) => ({ showBest: !s.showBest })),
  toggleShowReply: () => set((s) => ({ showReply: !s.showReply })),
  openGame: (game, review, ply = 0) =>
    set({
      ...perGameReset,
      game,
      review,
      ply: Math.max(0, Math.min(game.moves.length, ply)),
      notice: game.customStart ? 'custom_start' : undefined,
    }),
  reset: () => set({ ...perGameReset, game: undefined, screen: 'import', phase: 'idle', inputText: '' }),
}))
