import { useState, useEffect } from 'react'
import { checkHealth, ingestUrl, askQuestion } from './api/client.js'
import './App.css'

// ---------------------------------------------------------------------------
// URL validation — lightweight, client-side only
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
  // ── Health check state ──────────────────────────────────────────────────
  const [status, setStatus] = useState('Checking backend...')
  const [errorDetails, setErrorDetails] = useState(null)

  useEffect(() => {
    async function verifyHealth() {
      try {
        await checkHealth()
        setStatus('Connected')
        setErrorDetails(null)
      } catch (err) {
        setStatus('Disconnected')
        setErrorDetails(err.message) // ApiError provides a safe message
      }
    }
    verifyHealth()
  }, [])

  // ── Ingestion state ─────────────────────────────────────────────────────
  const [url, setUrl] = useState('')
  const [validationError, setValidationError] = useState(null)
  const [ingesting, setIngesting] = useState(false)
  const [ingestResult, setIngestResult] = useState(null) // { type: 'success' | 'error', data }

  async function handleIngest(e) {
    e.preventDefault()

    // Client-side validation
    const error = validateUrl(url)
    if (error) {
      setValidationError(error)
      return
    }

    setValidationError(null)
    setIngestResult(null)
    setIngesting(true)

    try {
      const result = await ingestUrl(url.trim())
      setIngestResult({ type: 'success', data: result })
    } catch (err) {
      // err is always an ApiError — .message is user-safe
      setIngestResult({ type: 'error', message: err.message })
    } finally {
      setIngesting(false)
    }
  }

  // ── Q&A state ───────────────────────────────────────────────────────────
  const [question, setQuestion] = useState('')
  const [questionError, setQuestionError] = useState(null)
  const [asking, setAsking] = useState(false)
  const [askResult, setAskResult] = useState(null) // { type: 'success' | 'error', data | message }

  async function handleAsk(e) {
    e.preventDefault()

    // Client-side validation — reject empty / whitespace-only
    const trimmed = question.trim()
    if (!trimmed) {
      setQuestionError('Please enter a question.')
      return
    }

    setQuestionError(null)
    setAskResult(null)
    setAsking(true)

    try {
      const result = await askQuestion(trimmed)
      setAskResult({ type: 'success', data: result })
    } catch (err) {
      // err is always an ApiError — .message is user-safe
      setAskResult({ type: 'error', message: err.message })
    } finally {
      setAsking(false)
    }
  }

  // Determine health status CSS class
  let statusClass = 'status-checking'
  if (status === 'Connected') statusClass = 'status-connected'
  else if (status === 'Disconnected') statusClass = 'status-disconnected'

  return (
    <div className="app">
      <h1>WebMind</h1>

      {/* ── Health status ────────────────────────────────────────────────── */}
      <div className="health-status">
        <p>
          <span className={statusClass}>●</span> Backend: {status}
        </p>
        {errorDetails && (
          <p className="error-details">{errorDetails}</p>
        )}
      </div>

      {/* ── Ingestion ────────────────────────────────────────────────────── */}
      <div className="ingest-section">
        <h2>Ingest a webpage</h2>

        <form className="ingest-form" onSubmit={handleIngest}>
          <input
            id="url-input"
            className="url-input"
            type="text"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              if (validationError) setValidationError(null)
            }}
            disabled={ingesting}
            autoComplete="url"
          />
          <button
            id="ingest-btn"
            className="ingest-btn"
            type="submit"
            disabled={ingesting}
          >
            {ingesting ? 'Ingesting…' : 'Ingest URL'}
          </button>
        </form>

        {validationError && (
          <p className="validation-error">{validationError}</p>
        )}

        {ingestResult?.type === 'success' && (
          <div className="ingest-success">
            <div className="success-title">✓ URL ingested successfully.</div>
            <div className="success-details">
              <strong>{ingestResult.data.title}</strong>
              {' — '}
              {ingestResult.data.chunks_created} chunk{ingestResult.data.chunks_created !== 1 ? 's' : ''} created
            </div>
          </div>
        )}

        {ingestResult?.type === 'error' && (
          <div className="ingest-error">
            ✗ {ingestResult.message}
          </div>
        )}
      </div>

      {/* ── Q&A ──────────────────────────────────────────────────────────── */}
      <div className="ask-section">
        <h2>Ask WebMind</h2>

        <form className="ask-form" onSubmit={handleAsk}>
          <input
            id="question-input"
            className="question-input"
            type="text"
            placeholder="What does this webpage explain about?"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value)
              if (questionError) setQuestionError(null)
            }}
            disabled={asking}
          />
          <button
            id="ask-btn"
            className="ask-btn"
            type="submit"
            disabled={asking}
          >
            {asking ? 'Asking…' : 'Ask WebMind'}
          </button>
        </form>

        {questionError && (
          <p className="validation-error">{questionError}</p>
        )}

        {askResult?.type === 'error' && (
          <div className="ask-error">
            ✗ {askResult.message}
          </div>
        )}

        {askResult?.type === 'success' && (
          <>
            <div className="answer-block">
              <div className="answer-label">Answer</div>
              <div className="answer-text">{askResult.data.answer}</div>
            </div>

            {askResult.data.sources && askResult.data.sources.length > 0 && (() => {
              // Deduplicate sources by URL — users see one link per page, not per chunk
              const uniqueSources = [...new Map(
                askResult.data.sources.map((s) => [s.source_url, s])
              ).values()]
              return (
                <div className="sources-block">
                  <div className="sources-label">
                    Sources ({uniqueSources.length})
                  </div>
                  <ul className="sources-list">
                    {uniqueSources.map((src) => (
                      <li key={src.source_url}>
                        <a
                          className="source-url"
                          href={src.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {src.source_url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })()}
          </>
        )}
      </div>
    </div>
  )
}

export default App
