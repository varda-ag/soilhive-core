import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  // Rendered instead of children after a render error. Nothing when omitted.
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? (this.props.fallback ?? null) : this.props.children;
  }
}

export default ErrorBoundary;
