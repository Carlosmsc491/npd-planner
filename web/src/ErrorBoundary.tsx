import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

// Catches render errors so a crash shows a recovery screen instead of a blank page.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: unknown) {
    console.error('App crashed:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="#E24B4A" strokeWidth="2" className="w-6 h-6">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-1">Something went wrong</h1>
          <p className="text-sm text-gray-500 mb-5 max-w-xs">{this.state.error.message || 'An unexpected error occurred.'}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-green-500 text-white text-sm font-semibold px-5 py-2.5 hover:bg-green-600 active:scale-95 transition"
          >
            Reload app
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
