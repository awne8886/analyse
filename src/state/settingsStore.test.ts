// R7 (which colour am I) and R26 (Explain toggle persisted). The store is re-imported fresh for every
// test (vi.resetModules) so the in-memory state never leaks between tests, while localStorage is the
// only thing that carries state across a simulated reload.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_STORAGE_KEY, resolveUserColor } from './index'

type StateModule = typeof import('./index')

async function freshStore(): Promise<StateModule['useSettingsStore']> {
  vi.resetModules()
  const mod: StateModule = await import('./index')
  return mod.useSettingsStore
}

function persisted(): { state: Record<string, unknown> } {
  expect(SETTINGS_STORAGE_KEY).toBe('analyse:settings')
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
  expect(raw).not.toBeNull()
  return JSON.parse(raw as string) as { state: Record<string, unknown> }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('resolveUserColor (R7)', () => {
  it('matches the White name, ignoring case', () => {
    expect(resolveUserColor('Hikaru', 'Arystanner', 'hikaru')).toBe('w')
    expect(resolveUserColor('hikaru', 'Arystanner', 'HIKARU')).toBe('w')
  })

  it('matches the Black name, ignoring case', () => {
    expect(resolveUserColor('Arystanner', 'Hikaru', 'hIkArU')).toBe('b')
    expect(resolveUserColor('Arystanner', 'Hikaru', 'Hikaru')).toBe('b')
  })

  it('returns null when the username is neither player', () => {
    expect(resolveUserColor('Arystanner', 'Hikaru', 'magnus')).toBeNull()
  })

  it('returns null when no username is given', () => {
    expect(resolveUserColor('Arystanner', 'Hikaru')).toBeNull()
    expect(resolveUserColor('Arystanner', 'Hikaru', undefined)).toBeNull()
    expect(resolveUserColor('Arystanner', 'Hikaru', '')).toBeNull()
  })
})

describe('useSettingsStore defaults (R7, R26)', () => {
  it('starts with the documented defaults and an empty localStorage', async () => {
    const store = await freshStore()
    const s = store.getState()
    expect(s.theme).toBe('dark')
    expect(s.pieceSet).toBe('kaneo')
    expect(s.explain).toBe(true)
    expect(s.coloredMoves).toBe(true)
    expect(s.sounds).toBe(true)
    expect(s.userColor).toBe('w')
    expect(s.voice).toBe('me')
    expect(typeof s.update).toBe('function')
    expect(typeof s.toggleExplain).toBe('function')
  })
})

describe('useSettingsStore.update (R7)', () => {
  it('changes only the patched fields', async () => {
    const store = await freshStore()
    store.getState().update({ userColor: 'b' })
    expect(store.getState().userColor).toBe('b')
    expect(store.getState().theme).toBe('dark')
    expect(store.getState().explain).toBe(true)
  })

  it('persists the colour choice to localStorage under SETTINGS_STORAGE_KEY', async () => {
    const store = await freshStore()
    store.getState().update({ userColor: 'b' })
    expect(persisted().state.userColor).toBe('b')
  })

  it('persists other patched fields too', async () => {
    const store = await freshStore()
    store.getState().update({ theme: 'light', sounds: false, voice: 'neutral', pieceSet: 'cburnett' })
    const saved = persisted().state
    expect(saved.theme).toBe('light')
    expect(saved.sounds).toBe(false)
    expect(saved.voice).toBe('neutral')
    expect(saved.pieceSet).toBe('cburnett')
  })

  it('the colour choice survives a reload (a fresh module reads localStorage)', async () => {
    const first = await freshStore()
    first.getState().update({ userColor: 'b', username: 'Hikaru' })
    const second = await freshStore()
    expect(second.getState().userColor).toBe('b')
    expect(second.getState().username).toBe('Hikaru')
  })
})

describe('useSettingsStore.toggleExplain (R26)', () => {
  it('flips explain and persists each flip', async () => {
    const store = await freshStore()
    expect(store.getState().explain).toBe(true)
    store.getState().toggleExplain()
    expect(store.getState().explain).toBe(false)
    expect(persisted().state.explain).toBe(false)
    store.getState().toggleExplain()
    expect(store.getState().explain).toBe(true)
    expect(persisted().state.explain).toBe(true)
  })

  it('a hidden Explain toggle survives a reload', async () => {
    const first = await freshStore()
    first.getState().toggleExplain()
    const second = await freshStore()
    expect(second.getState().explain).toBe(false)
  })
})
