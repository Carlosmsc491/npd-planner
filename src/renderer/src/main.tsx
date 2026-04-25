import { Component, ErrorInfo, ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './assets/main.css'
import { CrashReportModal } from './components/ui/CrashReportModal'

const isDev = import.meta.env.DEV

interface ErrorBoundaryState {
  error: Error | null
  route: string
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, route: '' }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Capture current route at crash time (HashRouter uses window.location.hash)
    const route = window.location.hash.replace(/^#/, '') || '/'
    return { error, route }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info)
  }

  render() {
    if (this.state.error) {
      // In development: show raw error so devtools still work normally
      if (isDev) {
        return (
          <div style={{ padding: 32, fontFamily: 'monospace', background: '#fff', color: '#111', minHeight: '100vh' }}>
            <h2 style={{ color: '#dc2626', marginBottom: 12 }}>Application Error (dev)</h2>
            <pre style={{ background: '#f3f4f6', padding: 16, borderRadius: 8, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>
              {this.state.error.message}{'\n\n'}{this.state.error.stack}
            </pre>
          </div>
        )
      }
      // In production: friendly modal with Send Report option
      return <CrashReportModal error={this.state.error} route={this.state.route} />
    }
    return this.props.children
  }
}

// React.StrictMode intentionally omitted — Firebase 12 persistentLocalCache is
// incompatible with StrictMode's double-effect invocation in development.
// StrictMode causes "INTERNAL ASSERTION FAILED: Unexpected state" (ID: b815/ca9)
// because onSnapshot listeners are subscribed, immediately unsubscribed, then
// re-subscribed faster than the Firestore watch stream can handle.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary>
    <HashRouter>
      <App />
    </HashRouter>
  </ErrorBoundary>
)
