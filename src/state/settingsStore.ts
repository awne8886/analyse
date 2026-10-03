// Persisted user settings (zustand `persist`, localStorage key 'analyse:settings'; R7, R26, G.24, G.28).
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ProfileName } from '../types/engine'

export interface SettingsState {
  theme: 'dark' | 'light'
  pieceSet: 'kaneo' | 'cburnett'
  profile: ProfileName
  voice: 'me' | 'neutral' // "Coach addresses: me / neutral"
  coloredMoves: boolean
  sounds: boolean
  explain: boolean // the Explain toggle (default on, hotkey e)
  userColor: 'w' | 'b' // "You played", default White
  username: string
  update: (patch: Partial<Omit<SettingsState, 'update' | 'toggleExplain'>>) => void
  toggleExplain: () => void
}

/** zustand `persist` writes the settings slice to localStorage under this key. */
export const SETTINGS_STORAGE_KEY = 'analyse:settings'

/** The default piece set (Appendix H.1: change it to 'cburnett' to switch the default). */
export const defaultPieceSet: SettingsState['pieceSet'] = 'kaneo'

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      pieceSet: defaultPieceSet,
      profile: 'standard',
      voice: 'me',
      coloredMoves: true,
      sounds: true,
      explain: true,
      userColor: 'w',
      username: '',
      update: (patch) => set(patch),
      toggleExplain: () => set((s) => ({ explain: !s.explain })),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        theme: s.theme,
        pieceSet: s.pieceSet,
        profile: s.profile,
        voice: s.voice,
        coloredMoves: s.coloredMoves,
        sounds: s.sounds,
        explain: s.explain,
        userColor: s.userColor,
        username: s.username,
      }),
    },
  ),
)

/** True when settings were saved by an earlier visit (the device-default profile of C.4 applies otherwise). */
export function hasStoredSettings(): boolean {
  try {
    return localStorage.getItem(SETTINGS_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/** Case-insensitive match of `username` against the White and Black names (R7); null when neither matches. */
export function resolveUserColor(white: string, black: string, username?: string): 'w' | 'b' | null {
  const u = username?.trim().toLowerCase()
  if (!u) return null
  if (white.toLowerCase() === u) return 'w'
  if (black.toLowerCase() === u) return 'b'
  return null
}
