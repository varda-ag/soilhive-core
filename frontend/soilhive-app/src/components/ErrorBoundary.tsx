import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  info: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, info: null };
  }

  render() {
    if (this.state.hasError) {
      const fallbackComponent = this.props.fallback;
      return <div style={{ color: 'red' }}>{fallbackComponent ?? <p>{this.state.error!.message}</p>}</div>;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
