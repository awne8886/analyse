import '@fontsource/montserrat/latin-700.css'
import '@fontsource/montserrat/latin-800.css'
import './index.css'
import { ENGINE_STRINGS, deviceProfile } from './engine'
import { renderApp, renderSplash } from './ui/renderApp'

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
