// src/main.tsx on GitHub Pages (D.8, risk 12, performance L2): once a document of this tab was isolated, the
// "never wait twice" guard is cleared, so a later hard reload shows the splash instead of a live import screen
// that the service worker reloads 2 s later.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp, renderSplash } from './renderApp'

vi.mock('./renderApp', () => ({ renderApp: vi.fn(), renderSplash: vi.fn() }))
vi.mock('../engine', () => ({
  ENGINE_STRINGS: { 'E-7': 'Enabling multi-core analysis…' },
  deviceProfile: vi.fn(),
}))

function setIsolated(value: boolean) {
  Object.defineProperty(window, 'crossOriginIsolated', { value, configurable: true })
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.mocked(renderApp).mockClear()
  vi.mocked(renderSplash).mockClear()
  sessionStorage.clear()
  vi.stubEnv('VITE_DEPLOY_TARGET', 'pages')
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('main.tsx isolation guard', () => {
  it('an isolated document clears the guard and renders the app at once', async () => {
    sessionStorage.setItem('coiReloading', '1')
    setIsolated(true)
    await import('../main')
    expect(sessionStorage.getItem('coiReloading')).toBeNull()
    expect(renderApp).toHaveBeenCalledTimes(1)
    expect(renderSplash).not.toHaveBeenCalled()
  })

  it('so the next non-isolated load of the tab (a hard reload) waits behind the splash', async () => {
    setIsolated(false)
    await import('../main')
    expect(renderSplash).toHaveBeenCalledWith('Enabling multi-core analysis…')
    expect(renderApp).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3000)
    expect(renderApp).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('coiReloading')).toBe('1')
  })

  it('the guard still stops a second wait in a tab that never became isolated', async () => {
    sessionStorage.setItem('coiReloading', '1')
    setIsolated(false)
    await import('../main')
    expect(renderSplash).not.toHaveBeenCalled()
    expect(renderApp).toHaveBeenCalledTimes(1)
  })
})
