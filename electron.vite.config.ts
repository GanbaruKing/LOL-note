import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    publicDir: resolve('public'),
    plugins: [
      react(),
      {
        name: 'development-csp',
        apply: 'serve',
        transformIndexHtml(html) {
          return html
            .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
            .replace("connect-src 'none'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*")
        },
      },
    ],
  },
})
