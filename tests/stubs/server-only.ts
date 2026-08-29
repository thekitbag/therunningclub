/**
 * Test stub for the `server-only` package.
 *
 * `server-only` works by resolving to a module that throws unless the bundler
 * applies React's `react-server` condition. Vitest does not apply that
 * condition, so importing any server module under test would fail.
 *
 * Aliasing it here keeps the real guard intact for `next build` — which is the
 * only place it needs to work — while letting integration tests exercise the
 * server modules directly.
 */
export {};
