import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('FinTrack UI error', error.name, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="fatal-error">
        <section className="card empty-state">
          <span className="badge badge-danger">Application error</span>
          <h1>FinTrack could not display this screen</h1>
          <p>
            Your encrypted data has not been deleted. Close and reopen the app. If the
            problem continues, restore a verified backup from a clean install.
          </p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => window.location.reload()}
          >
            Reload application
          </button>
        </section>
      </main>
    )
  }
}
