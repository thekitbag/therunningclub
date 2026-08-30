'use client';

import { useEffect } from 'react';

/**
 * Public error boundary.
 *
 * Shows a generic message and the correlation identifier Next generates, never
 * the underlying error. Diagnostic detail stays in the server logs.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server has already logged the detail; this only records that the
    // browser rendered the fallback.
    console.error('Page failed to render', error.digest ?? '');
  }, [error]);

  return (
    <div className="shell pad-block">
      <div className="notice notice--error" role="alert">
        <p className="notice__title">Something went wrong</p>
        <p>
          We could not load this page. Please try again in a moment.
          {error.digest ? (
            <>
              {' '}
              If you report this, quote reference <code>{error.digest}</code>.
            </>
          ) : null}
        </p>
      </div>
      <div className="btn-row" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn--primary" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
