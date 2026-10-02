// renderApp / renderSplash for src/main.tsx (D.8). renderApp is idempotent: the first GitHub Pages visit can call
// it twice (3 s timer and reload), and it still creates one root, one store, one engine pool and one import.
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../App'
import { bootApp } from '../state'
import type { DeviceProfile } from '../types/engine'

let root: Root | null = null
let appRendered = false
const getRoot = (): Root => (root ??= createRoot(document.getElementById('root')!))

export function renderSplash(text: string): void {
  getRoot().render(
    <div role="status" className="splash">
      {text}
    </div>,
  )
}

export function renderApp(profile: DeviceProfile | null): void {
  if (appRendered) return
  appRendered = true
  bootApp(profile)
  getRoot().render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
