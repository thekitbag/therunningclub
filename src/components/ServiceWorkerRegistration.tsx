'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Registration is skipped entirely on admin routes. That is belt-and-braces:
 * the worker's own fetch handler already refuses to cache `/admin`, but not
 * registering it from an authenticated page removes any chance of a private
 * response being seen by a caching layer at all.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.pathname.startsWith('/admin')) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration must never break the page: the site works
        // perfectly well without offline support.
      });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
