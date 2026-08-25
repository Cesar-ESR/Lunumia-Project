import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { PWA_SCOPE, PWA_START_URL } from './src/shared/constants/web-origins'

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'supabase-client',
              test: /node_modules[\\/]@supabase[\\/]/,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@domain': path.resolve(
        fileURLToPath(new URL('.', import.meta.url)),
        'src/domain',
      ),
      '@application': path.resolve(
        fileURLToPath(new URL('.', import.meta.url)),
        'src/application',
      ),
      '@infrastructure': path.resolve(
        fileURLToPath(new URL('.', import.meta.url)),
        'src/infrastructure',
      ),
      '@presentation': path.resolve(
        fileURLToPath(new URL('.', import.meta.url)),
        'src/presentation',
      ),
      '@shared': path.resolve(
        fileURLToPath(new URL('.', import.meta.url)),
        'src/shared',
      ),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Lunumia',
        short_name: 'Lunumia',
        description: 'Presupuestos personales local-first',
        lang: 'es',
        start_url: PWA_START_URL,
        scope: PWA_SCOPE,
        display: 'standalone',
        background_color: '#f6f8fc',
        theme_color: '#1267d6',
        icons: [
          {
            src: '/icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/*backup*'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
    alias: {
      'virtual:pwa-register/react': path.resolve(
        fileURLToPath(new URL('.', import.meta.url)),
        'src/presentation/test/pwa-register-mock.ts',
      ),
    },
  },
})
