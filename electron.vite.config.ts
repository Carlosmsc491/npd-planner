import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'

// Remove crossorigin attributes from generated HTML — they break file:// loading in Electron
function removeCrossorigin(): Plugin {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin/g, '')
    },
  }
}

// Copy PDF.js worker to build output for production
function copyPdfWorker(): Plugin {
  return {
    name: 'copy-pdf-worker',
    writeBundle(options) {
      const outDir = options.dir || 'out/renderer'
      const src = resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs')
      const dest = resolve(outDir, 'pdf.worker.min.mjs')
      if (!existsSync(dirname(dest))) {
        mkdirSync(dirname(dest), { recursive: true })
      }
      if (existsSync(src)) {
        copyFileSync(src, dest)
        console.log('[copy-pdf-worker] Copied pdf.worker.min.mjs to', outDir)
      } else {
        console.warn('[copy-pdf-worker] pdf.worker.min.mjs not found at', src)
      }
    }
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
    plugins: [react(), removeCrossorigin(), copyPdfWorker()],
  },
})
