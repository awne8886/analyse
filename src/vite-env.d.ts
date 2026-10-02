/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_DEPLOY_TARGET: 'vercel' | 'pages'
  readonly VITE_PROXY_URL: string
  readonly VITE_BASE_PATH?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
