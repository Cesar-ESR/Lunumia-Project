import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { renderLandingHtml } from './site-contract'

const landingRoot = fileURLToPath(new URL('.', import.meta.url))
const landingOutput = fileURLToPath(new URL('../dist-landing', import.meta.url))

export default defineConfig({
  root: landingRoot,
  plugins: [
    {
      name: 'lunumia-landing-contract',
      transformIndexHtml: {
        order: 'pre',
        handler: renderLandingHtml,
      },
    },
  ],
  build: {
    sourcemap: false,
    outDir: landingOutput,
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(landingRoot, 'index.html'),
        terms: resolve(landingRoot, 'terms.html'),
        'third-party-licenses': resolve(
          landingRoot,
          'third-party-licenses.html',
        ),
      },
    },
  },
})
