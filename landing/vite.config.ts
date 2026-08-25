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
    outDir: landingOutput,
    emptyOutDir: true,
    assetsDir: 'assets',
  },
})
