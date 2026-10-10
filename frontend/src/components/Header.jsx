import { IconBolt } from './Icons'

/**
 * Header — application header with brand identity and backend health status.
 *
 * @param {object} props
 * @param {'Checking backend...' | 'Connected' | 'Disconnected'} props.status
 * @param {string | null} props.errorDetails
 */
export default function Header({ status, errorDetails }) {
  let statusClass = 'status-checking'
  let statusLabel = 'Checking…'

  if (status === 'Connected') {
    statusClass = 'status-connected'
    statusLabel = 'Connected'
  } else if (status === 'Disconnected') {
    statusClass = 'status-disconnected'
    statusLabel = 'Disconnected'
  }

  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand">
          <div className="brand-icon">
            <IconBolt size={22} />
          </div>
          <h1 className="brand-name">WebMind</h1>
        </div>

        <div className="health-indicator" title={errorDetails || statusLabel}>
          <span className={`health-dot ${statusClass}`} />
          <span className="health-label">{statusLabel}</span>
        </div>
      </div>
    </header>
  )
}
