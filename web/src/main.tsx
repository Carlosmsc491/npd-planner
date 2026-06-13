import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './ErrorBoundary'

// No caching service worker — the app is online-first (Firebase realtime).
// Earlier SW versions cached the shell and caused blank screens after deploys,
// so we proactively unregister any existing SW and clear its caches. The
// kill-switch sw.js handles clients that still have an old SW in control.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {})
}
if (typeof caches !== 'undefined') {
  caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <BrowserRouter basename="/npd-planner">
      <App />
    </BrowserRouter>
  </ErrorBoundary>
)
