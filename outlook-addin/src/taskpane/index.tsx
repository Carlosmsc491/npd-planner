import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/taskpane.css'

Office.onReady(() => {
  const container = document.getElementById('root')!
  createRoot(container).render(<App />)
})
