import { captureOwnerStack, Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { ...this.state, ...{ hasError: true, error } };
  }

  componentDidCatch(error, info) {
  }

  render() {
    if (this.state.hasError) {
      const fallbackComponent = this.props.fallback;
      return (
        <div style={{color: 'red'}}>
          { fallbackComponent ??
            <p>{this.state.error}</p>
          }
        </div>
      );;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;