import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves from /npd-planner/ — set base so assets resolve correctly.
// For local dev or a custom domain, override via VITE_BASE_URL env var.
const base = process.env.VITE_BASE_URL ?? '/npd-planner/'

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    // Vite doesn't read a bare PORT env var by default — it only honors
    // --port / server.port. Without this, an occupied 5173 makes Vite
    // silently fall back to 5174+ while any tool that pre-assigned a port
    // (e.g. the preview server's autoPort) keeps expecting the port it
    // picked, and the two never agree.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
