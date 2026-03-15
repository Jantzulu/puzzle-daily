import React, { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  autoReloadOnChunkError?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary to prevent white-screen crashes.
 * Catches rendering errors in child components and displays a recovery UI.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);

    // Auto-reload on chunk load failures (stale deploys) if opted in
    if (this.props.autoReloadOnChunkError && this.isChunkLoadError(error)) {
      const reloadKey = 'chunk_error_reload';
      // Prevent infinite reload loops — only auto-reload once per session
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
      }
    }
  }

  private isChunkLoadError(error: Error): boolean {
    const msg = error.message.toLowerCase();
    return msg.includes('failed to fetch dynamically imported module')
      || msg.includes('loading chunk')
      || msg.includes('loading css chunk')
      || (error.name === 'ChunkLoadError');
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6"
          style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
        >
          <div className="max-w-md w-full bg-stone-800 border-2 border-blood-600/50 rounded-lg shadow-2xl p-8 text-center">
            <div className="text-4xl mb-4">&#x1F6E1;&#xFE0F;</div>
            <h2 className="text-xl font-medieval font-bold text-copper-400 mb-2">
              Something Went Wrong
            </h2>
            <p className="text-parchment-300 text-sm mb-4">
              An unexpected error occurred. You can try going back or reloading the page.
            </p>
            {this.state.error && (
              <details className="mb-4 text-left">
                <summary className="text-stone-400 text-xs cursor-pointer hover:text-stone-300">
                  Error details
                </summary>
                <pre className="mt-2 text-xs text-blood-400 bg-stone-900 rounded p-3 overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="dungeon-btn px-4 py-2 text-sm font-bold"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="dungeon-btn px-4 py-2 text-sm font-bold"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
