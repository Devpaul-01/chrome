import { Component, ErrorInfo, ReactNode } from 'react';
import { logError } from '../../utils/errors';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component to catch React rendering errors
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logError(error, `React Error Boundary: ${errorInfo.componentStack}`);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="card bg-red-50 border border-red-200 p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Something went wrong</h2>
          <p className="text-sm text-red-600 mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={this.handleReset} className="btn-primary">
              Try Again
            </button>
            <button onClick={() => window.location.reload()} className="btn-secondary">
              Reload Extension
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
