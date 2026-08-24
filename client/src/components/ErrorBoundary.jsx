/**
 * @module ErrorBoundary
 * @description React class-based error boundary that catches unhandled
 * render-time errors and displays a graceful recovery UI instead of a
 * blank white screen.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeFeatureComponent />
 *   </ErrorBoundary>
 */
import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import PropTypes from 'prop-types';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  /** Catches render errors and stores them in local state. */
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  /** Logs the full component stack for debugging. */
  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { fallback: Fallback } = this.props;

    if (Fallback) {
      return (
        <Fallback
          error={this.state.error}
          reset={this.handleReset}
        />
      );
    }

    // Default fallback UI
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-rose-400" />
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white">Unexpected Rendering Error</h2>
          <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
            A component encountered an unrecoverable error. The rest of the
            application remains unaffected.
          </p>
        </div>

        {process.env.NODE_ENV !== 'production' && this.state.error && (
          <pre className="text-left text-[10px] font-mono text-rose-300 bg-slate-950 border border-rose-900/40 p-3 rounded-xl max-w-lg overflow-x-auto">
            {this.state.error.toString()}
          </pre>
        )}

        <button
          onClick={this.handleReset}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Try Again</span>
        </button>
      </div>
    );
  }
}

ErrorBoundary.propTypes = {
  /** The component tree to monitor for render errors */
  children: PropTypes.node.isRequired,
  /** Optional custom fallback component; receives `error` and `reset` props */
  fallback: PropTypes.elementType,
};

ErrorBoundary.defaultProps = {
  fallback: null,
};

export { ErrorBoundary };
