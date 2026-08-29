/**
 * Race-bib position marker.
 *
 * The app's signature element and its consistent way of showing a position.
 * A tied position is announced in text as well as marked with "=", so the
 * information does not depend on noticing a glyph.
 */
export function Bib({
  position,
  tied = false,
  tone = 'default',
  size,
  label,
}: {
  position: number | null;
  tied?: boolean;
  tone?: 'default' | 'green' | 'purple' | 'quiet';
  size?: 'sm';
  label?: string;
}) {
  const toneClass =
    tone === 'green'
      ? ' bib--gold'
      : tone === 'purple'
        ? ' bib--purple'
        : tone === 'quiet'
          ? ' bib--quiet'
          : '';
  const sizeClass = size === 'sm' ? ' bib--sm' : '';

  if (position === null) {
    return (
      <span className={`bib bib--quiet${sizeClass}`} aria-hidden="true">
        –
      </span>
    );
  }

  return (
    <span className={`bib${toneClass}${sizeClass}`}>
      <span aria-hidden="true">
        {tied ? '=' : ''}
        {position}
      </span>
      <span className="visually-hidden">
        {label ?? 'Position'} {position}
        {tied ? ', tied' : ''}
      </span>
    </span>
  );
}
