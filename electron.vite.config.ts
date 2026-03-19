import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Remove crossorigin attributes from generated HTML — they break file:// loading in Electron
function removeCrossorigin(): Plugin {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin/g, '')
    },
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['electron', 'playwright', 'playwright-core'],
        output: {
          format: 'cjs',
          interop: 'default'
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['electron'],
        output: { format: 'cjs' }
      }
    }
  },
  renderer: {
    plugins: [react(), removeCrossorigin()],
  },
})
