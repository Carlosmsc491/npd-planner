import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

// Register service worker for PWA / offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/npd-planner/sw.js').catch(() => {
      // Non-fatal — app works without SW
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename="/npd-planner">
    <App />
  </BrowserRouter>
)
