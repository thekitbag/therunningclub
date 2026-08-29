import { formatTimestamp } from '@/lib/dates';

/**
 * "Last updated" line shown on every published page.
 *
 * One of the product's trust principles: a visitor should always be able to
 * tell how current the numbers in front of them are.
 */
export function LastUpdated({ at }: { at: Date | null }) {
  if (!at) return null;
  return (
    <p className="muted">
      Last updated <time dateTime={at.toISOString()}>{formatTimestamp(at)}</time>
    </p>
  );
}
