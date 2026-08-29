/** Route-level loading state, announced politely rather than silently blank. */
export default function Loading() {
  return (
    <div className="shell pad-block">
      <p role="status" className="muted">
        Loading…
      </p>
    </div>
  );
}
