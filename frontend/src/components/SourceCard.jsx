import { IconExternalLink, IconGlobe } from './Icons'

/**
 * SourceCard — displays a single source citation from the RAG response.
 * Shows the page URL as a clickable link with an external-link indicator.
 *
 * @param {object} props
 * @param {object} props.source — Source object from the /ask response
 * @param {string} props.source.source_url
 */
export default function SourceCard({ source }) {
  // Extract a readable hostname for display
  let hostname = source.source_url
  try {
    hostname = new URL(source.source_url).hostname.replace(/^www\./, '')
  } catch {
    // Fall back to the raw URL if parsing fails
  }

  return (
    <a
      className="source-card"
      href={source.source_url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="source-favicon">
        <IconGlobe size={14} />
      </span>
      <span className="source-info">
        <span className="source-hostname">{hostname}</span>
        <span className="source-url">{source.source_url}</span>
      </span>
      <span className="source-external">
        <IconExternalLink size={12} />
      </span>
    </a>
  )
}
