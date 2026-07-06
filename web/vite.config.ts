import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves from /npd-planner/ — set base so assets resolve correctly.
// For local dev or a custom domain, override via VITE_BASE_URL env var.
const base = process.env.VITE_BASE_URL ?? '/npd-planner/'

export default defineConfig({
  plugins: [react()],
  base,
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
