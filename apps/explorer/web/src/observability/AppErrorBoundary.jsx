import React from 'react';
import { reportClientError } from './logger';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    reportClientError(error, {
      source: 'react.error_boundary',
      componentStack: info?.componentStack || '',
    });
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="min-h-screen bg-black px-6 py-24 text-white">
          <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/5 p-8">
            <h1 className="text-2xl font-semibold">Aeko Scan hit an unexpected error</h1>
            <p className="mt-3 text-sm text-gray-400">
              Reload the page. If the problem continues, the failure has been recorded for operators.
            </p>
            <button
              type="button"
              className="mt-6 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
              onClick={() => globalThis.location?.reload()}
            >
              Reload Aeko Scan
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
