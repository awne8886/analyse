import '@fontsource/montserrat/latin-700.css'
import '@fontsource/montserrat/latin-800.css'
import './index.css'
import { ENGINE_STRINGS, deviceProfile } from './engine'
import { renderApp, renderSplash } from './ui/renderApp'

// performance L2 (D.8, risk 12): the guard below only stops a second wait within one isolation attempt. Once a
// document of this tab was isolated, a later hard reload (which bypasses the service worker and reloads again)
// must show the splash too, instead of an import screen that is live for 2 s and then reloaded.
if (window.crossOriginIsolated) sessionStorage.removeItem('coiReloading')

const onPages = import.meta.env.VITE_DEPLOY_TARGET === 'pages'
const swPossible = 'serviceWorker' in navigator && window.isSecureContext
const awaitingIsolation =
  onPages && !window.crossOriginIsolated && swPossible && sessionStorage.getItem('coiReloading') !== '1' // guard: never wait twice
if (awaitingIsolation) {
  renderSplash(ENGINE_STRINGS['E-7']) // the E-7 string lives in src/engine/errors.ts (F.3); no input field yet, so nothing can be pasted before the reload
  setTimeout(() => {
    sessionStorage.setItem('coiReloading', '1')
    renderApp(deviceProfile())
  }, 3000) // SW blocked/private mode: continue single-threaded
} else {
  renderApp(deviceProfile())
}
