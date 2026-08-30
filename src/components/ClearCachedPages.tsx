'use client';

import { useEffect } from 'react';

/**
 * Asks the service worker to drop its cached pages.
 *
 * Rendered on the unlock page, which is reached whenever a device is locked or
 * the club passcode has been rotated. Both are moments where previously cached
 * results should stop being readable offline on that device.
 */
export function ClearCachedPages() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.active?.postMessage({ type: 'CLEAR_PAGE_CACHE' });
      })
      .catch(() => {
        // No worker registered yet: there is nothing cached to clear.
      });
  }, []);

  return null;
}
