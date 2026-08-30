import type { ReactNode } from 'react';

/**
 * Honest empty state.
 *
 * Used wherever a section has no published data yet. Deliberately says that
 * nothing has been published rather than rendering placeholder rows that could
 * be mistaken for real results.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children ? (
        <div className="prose muted" style={{ marginInline: 'auto' }}>
          {children}
        </div>
      ) : null}
      {action ? (
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: '1rem' }}>
          {action}
        </div>
      ) : null}
    </div>
  );
}
