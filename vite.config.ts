/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const coiHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

function coiOnPages(target: string, base: string): Plugin {
  return {
    name: 'inject-coi-serviceworker-on-pages',
    transformIndexHtml(html) {
      if (target !== 'pages') return html
      return {
        html,
        tags: [
          {
            tag: 'script',
            injectTo: 'head',
            children: `window.coi={coepCredentialless:()=>false,doReload:()=>{try{sessionStorage.setItem('coiReloading','1')}catch(e){}window.location.reload()}};`,
          },
          { tag: 'script', injectTo: 'head', attrs: { src: `${base}coi-serviceworker.min.js` } },
        ],
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE_PATH || '/'
  const target = env.VITE_DEPLOY_TARGET || 'vercel'
  return {
    base,
    define: {
      'import.meta.env.VITE_DEPLOY_TARGET': JSON.stringify(target),
      'import.meta.env.VITE_PROXY_URL': JSON.stringify(
        env.VITE_PROXY_URL ?? (target === 'vercel' ? '/api/chesscom' : ''),
      ),
    },
    plugins: [react(), tailwindcss(), coiOnPages(target, base)],
    server: { headers: coiHeaders },
    preview: { headers: target === 'pages' ? {} : coiHeaders }, // the Pages preview must NOT send COOP/COEP, or the service worker never registers and e2e/pages-coi.spec.ts tests nothing
    build: {
      target: 'baseline-widely-available',
      sourcemap: false,
      assetsInlineLimit: 4096,
      chunkSizeWarningLimit: 1500,
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'api/**/*.test.ts'],
      setupFiles: ['./src/test/setup.ts'],
      coverage: { provider: 'v8' },
    },
  }
})
