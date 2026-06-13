import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

// Register service worker for PWA / offline support
if ('serviceWorker' in navigator) {
  // When a new SW activates and takes control, reload once so the latest
  // deploy applies immediately (fixes "stuck on old version" after a release).
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/npd-planner/sw.js').then((reg) => {
      // Poll for updates on each launch
      reg.update().catch(() => {})
    }).catch(() => {
      // Non-fatal — app works without SW
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename="/npd-planner">
    <App />
  </BrowserRouter>
)
