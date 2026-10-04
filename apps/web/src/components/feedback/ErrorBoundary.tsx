import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import ErrorState from './ErrorState';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom recovery UI — receives the caught error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * §16.1 global chrome — the shared *Error* boundary (spec: "ErrorBoundary …
 * none exists anywhere"). Mounts above the route table so a crashing screen
 * degrades to the ErrorState recovery UI instead of a blank page; "Try again"
 * resets the boundary and re-renders the subtree.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console is the MVP's observability (no error-reporting service, §2.2).
    console.error('ErrorBoundary caught a render error:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <ErrorState
          title="Something went wrong"
          message={
            error.message ||
            'An unexpected error interrupted this screen. The rest of the app is still reachable.'
          }
          onRetry={this.reset}
          action={
            <Button type="button" variant="ghost" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          }
        />
      </div>
    );
  }
}
