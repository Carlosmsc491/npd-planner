import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

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
    plugins: [react()],
  },
})
