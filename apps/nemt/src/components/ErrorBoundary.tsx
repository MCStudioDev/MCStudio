import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  private handlePromiseRejection = (event: PromiseRejectionEvent) => {
    if (event.reason instanceof Error) {
      this.setState({ hasError: true, error: event.reason });
    } else {
      this.setState({ hasError: true, error: new Error(String(event.reason)) });
    }
  };

  private handleErrorEvent = (event: ErrorEvent) => {
    this.setState({ hasError: true, error: event.error });
  };

  public componentDidMount() {
    window.addEventListener('unhandledrejection', this.handlePromiseRejection);
    window.addEventListener('error', this.handleErrorEvent);
  }

  public componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.handlePromiseRejection);
    window.removeEventListener('error', this.handleErrorEvent);
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      let details = null;

      if (this.state.error) {
        try {
          const parsedError = JSON.parse(this.state.error.message);
          if (parsedError.error && parsedError.operationType) {
            errorMessage = "A database permission error occurred.";
            details = `You do not have permission to perform this action (${parsedError.operationType} on ${parsedError.path || 'unknown path'}).`;
          } else {
            errorMessage = this.state.error.message;
          }
        } catch (e) {
          errorMessage = this.state.error.message;
        }
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="bg-white p-8 rounded-xl shadow-sm max-w-md w-full">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
            <p className="text-slate-700 mb-4">{errorMessage}</p>
            {details && (
              <p className="text-sm text-slate-500 mb-6 bg-slate-100 p-3 rounded-lg font-mono">
                {details}
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
