import React, { Component, ErrorInfo, ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './assets/main.css'

interface ErrorBoundaryState {
  error: Error | null
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#fff', color: '#111', minHeight: '100vh' }}>
          <h2 style={{ color: '#dc2626', marginBottom: 12 }}>Application Error</h2>
          <pre style={{ background: '#f3f4f6', padding: 16, borderRadius: 8, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      )
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
