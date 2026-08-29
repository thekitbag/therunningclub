import type { ReactNode } from 'react';

/**
 * Wrapper for a table that may overflow horizontally.
 *
 * A region that scrolls must be reachable by keyboard, or someone who cannot
 * use a pointer simply loses the columns beyond the fold. Making the wrapper
 * focusable and labelled is what satisfies that, and putting it in one
 * component means no table can quietly be added without it.
 */
export function ScrollableTable({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label={`${label} — scrollable table`}
    >
      {children}
    </div>
  );
}
