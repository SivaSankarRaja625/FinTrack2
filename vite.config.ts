import react from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command, mode }) => {
  const isCapacitor = mode === 'capacitor'
  const connectSource =
    command === 'serve' ? "'self' ws://localhost:* ws://127.0.0.1:*" : "'none'"
  const plugins: PluginOption[] = [
    react(),
    {
      name: 'finapp-content-security-policy',
      transformIndexHtml(html) {
        return html.replace('__FINAPP_CONNECT_SOURCE__', connectSource)
      },
    },
  ]

  if (!isCapacitor) {
    plugins.push(
      VitePWA({
        registerType: 'prompt',
        injectRegister: 'script-defer',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'FinTrack',
          short_name: 'FinTrack',
          description: 'Private, offline-first personal finance manager',
          theme_color: '#0f766e',
          background_color: '#f7f8f6',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallback: '/index.html',
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          runtimeCaching: [],
        },
      }),
    )
  }

  return {
    plugins,
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 750,
      rollupOptions: {
        output: {
          manualChunks: {
            storage: ['dexie', 'hash-wasm'],
          },
        },
      },
    },
    server: {
      host: '127.0.0.1',
    },
  }
})
