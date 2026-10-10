/**
 * LoadingSpinner — a simple CSS-animated spinner for loading states.
 * Renders inline so it can be placed inside buttons or standalone.
 */
export default function LoadingSpinner({ size = 18, className = '' }) {
  return (
    <span
      className={`loading-spinner ${className}`}
      style={{
        width: size,
        height: size,
      }}
      role="status"
      aria-label="Loading"
    >
      <span className="visually-hidden">Loading…</span>
    </span>
  )
}
