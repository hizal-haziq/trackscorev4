import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorPage } from './ErrorPage';
import { getRoleHome } from '../../utils/navigation';
import { readSession } from '../../services/auth';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (typeof window !== 'undefined' && (import.meta as any).env?.DEV) {
      // In development only, log for debugging
      console.warn('[TrackScore ErrorBoundary caught render crash]:', error.message, errorInfo.componentStack);
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  handleHome = (): void => {
    const session = readSession();
    const home = getRoleHome(session?.user?.role);
    window.location.href = home;
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <ErrorPage
          error={this.state.error}
          title="Something Went Wrong"
          message="An unexpected problem occurred while rendering this view. You can try again or return to your dashboard."
          onRetry={this.handleRetry}
          onHome={this.handleHome}
        />
      );
    }

    return this.props.children;
  }
}

