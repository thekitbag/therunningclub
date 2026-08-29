'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Honest offline and stale-data indicator.
 *
 * The service worker serves public pages network-first and falls back to the
 * last cached copy. When that happens the visitor is looking at results that may
 * have moved on, so they are told plainly rather than being shown stale numbers
 * as though they were live.
 *
 * The signal is a real reachability probe rather than `navigator.onLine`. That
 * flag only reports whether the device has *a* network connection: it stays
 * true on a captive portal, on a phone with signal but no data, and whenever the
 * server itself is down — every case where the page really is stale.
 */

/** Bypasses the service worker entirely, so failure means the server is unreachable. */
const PROBE_URL = '/api/ping';
const PROBE_TIMEOUT_MS = 4000;

async function serverIsReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const response = await fetch(PROBE_URL, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

export function StaleBanner() {
  const [stale, setStale] = useState(false);

  const check = useCallback(() => {
    // A negative `onLine` is conclusive; a positive one proves nothing, so it
    // is confirmed with an actual request.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStale(true);
      return;
    }
    void serverIsReachable().then((reachable) => setStale(!reachable));
  }, []);

  useEffect(() => {
    check();

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  if (!stale) return null;

  return (
    <div className="shell pad-block-sm">
      <div className="notice notice--warn" role="status" data-testid="stale-banner">
        <p className="notice__title">You are offline</p>
        <p>
          This is the last copy of this page your device saved. Results published since then are not
          shown. Reconnect and reload to see the current standings.
        </p>
      </div>
    </div>
  );
}
