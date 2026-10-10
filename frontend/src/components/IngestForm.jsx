import { useState } from 'react'
import { IconPlus, IconCheck, IconAlertCircle } from './Icons'
import LoadingSpinner from './LoadingSpinner'

/**
 * Validates that the input is a non-empty http(s) URL.
 * Returns null if valid, or an error message string if invalid.
 */
function validateUrl(input) {
  const trimmed = input.trim()
  if (!trimmed) {
    return 'Please enter a URL.'
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'URL must start with http:// or https://'
    }
  } catch {
    return 'Please enter a valid URL (e.g. https://example.com).'
  }
  return null
}

/**
 * IngestForm — URL ingestion section.
 * Handles input, validation, API call, and result display.
 *
 * @param {object} props
 * @param {function} props.onIngest — async (url: string) => IngestResponse
 */
export default function IngestForm({ onIngest }) {
  const [url, setUrl] = useState('')
  const [validationError, setValidationError] = useState(null)
  const [ingesting, setIngesting] = useState(false)
  const [result, setResult] = useState(null) // { type: 'success' | 'error', data | message }

  async function handleSubmit(e) {
    e.preventDefault()

    const error = validateUrl(url)
    if (error) {
      setValidationError(error)
      return
    }

    setValidationError(null)
    setResult(null)
    setIngesting(true)

    try {
      const data = await onIngest(url.trim())
      setResult({ type: 'success', data })
    } catch (err) {
      setResult({ type: 'error', message: err.message })
    } finally {
      setIngesting(false)
    }
  }

  return (
    <section className="ingest-section" aria-label="Ingest a webpage">
      <div className="section-header">
        <h2 className="section-title">Add a source</h2>
        <p className="section-desc">
          Paste a URL to extract, chunk, and index its content for question answering.
        </p>
      </div>

      <form className="ingest-form" onSubmit={handleSubmit}>
        <div className="input-group">
          <input
            id="url-input"
            className={`text-input ${validationError ? 'input-error' : ''}`}
            type="text"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              if (validationError) setValidationError(null)
              if (result) setResult(null)
            }}
            disabled={ingesting}
            autoComplete="url"
            aria-invalid={validationError ? 'true' : undefined}
            aria-describedby={validationError ? 'url-error' : undefined}
          />
          <button
            id="ingest-btn"
            className="btn btn-primary"
            type="submit"
            disabled={ingesting}
          >
            {ingesting ? (
              <>
                <LoadingSpinner size={16} />
                <span>Ingesting…</span>
              </>
            ) : (
              <>
                <IconPlus size={16} />
                <span>Ingest</span>
              </>
            )}
          </button>
        </div>

        {validationError && (
          <p id="url-error" className="field-error" role="alert">
            <IconAlertCircle size={14} />
            {validationError}
          </p>
        )}
      </form>

      {/* Success result */}
      {result?.type === 'success' && (
        <div className="result-card result-success" role="status">
          <div className="result-icon">
            <IconCheck size={18} />
          </div>
          <div className="result-body">
            <div className="result-title">Source indexed successfully</div>
            <div className="result-detail">
              <strong>{result.data.title}</strong>
              <span className="result-meta">
                {result.data.chunks_created} chunk{result.data.chunks_created !== 1 ? 's' : ''} created
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error result */}
      {result?.type === 'error' && (
        <div className="result-card result-error" role="alert">
          <div className="result-icon">
            <IconAlertCircle size={18} />
          </div>
          <div className="result-body">
            <div className="result-title">Ingestion failed</div>
            <div className="result-detail">{result.message}</div>
          </div>
        </div>
      )}
    </section>
  )
}
