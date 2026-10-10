import { useState } from 'react'
import { IconSend, IconAlertCircle, IconFileText } from './Icons'
import LoadingSpinner from './LoadingSpinner'
import SourceCard from './SourceCard'

/**
 * AskForm — question input, answer rendering, and source citations.
 *
 * @param {object} props
 * @param {function} props.onAsk — async (question: string) => AskResponse
 */
export default function AskForm({ onAsk }) {
  const [question, setQuestion] = useState('')
  const [questionError, setQuestionError] = useState(null)
  const [asking, setAsking] = useState(false)
  const [result, setResult] = useState(null) // { type: 'success' | 'error', data | message }

  async function handleSubmit(e) {
    e.preventDefault()

    const trimmed = question.trim()
    if (!trimmed) {
      setQuestionError('Please enter a question.')
      return
    }

    setQuestionError(null)
    setResult(null)
    setAsking(true)

    try {
      const data = await onAsk(trimmed)
      setResult({ type: 'success', data })
    } catch (err) {
      setResult({ type: 'error', message: err.message })
    } finally {
      setAsking(false)
    }
  }

  // Deduplicate sources by URL — users see one link per page, not per chunk
  const uniqueSources = result?.type === 'success' && result.data.sources?.length
    ? [...new Map(result.data.sources.map((s) => [s.source_url, s])).values()]
    : []

  return (
    <section className="ask-section" aria-label="Ask WebMind a question">
      <div className="section-header">
        <h2 className="section-title">Ask a question</h2>
        <p className="section-desc">
          Ask anything about your indexed sources. WebMind retrieves relevant content and generates a grounded answer.
        </p>
      </div>

      <form className="ask-form" onSubmit={handleSubmit}>
        <div className="input-group">
          <input
            id="question-input"
            className={`text-input ${questionError ? 'input-error' : ''}`}
            type="text"
            placeholder="What does this article explain about…?"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value)
              if (questionError) setQuestionError(null)
            }}
            disabled={asking}
            aria-invalid={questionError ? 'true' : undefined}
            aria-describedby={questionError ? 'question-error' : undefined}
          />
          <button
            id="ask-btn"
            className="btn btn-accent"
            type="submit"
            disabled={asking}
          >
            {asking ? (
              <>
                <LoadingSpinner size={16} />
                <span>Thinking…</span>
              </>
            ) : (
              <>
                <IconSend size={16} />
                <span>Ask</span>
              </>
            )}
          </button>
        </div>

        {questionError && (
          <p id="question-error" className="field-error" role="alert">
            <IconAlertCircle size={14} />
            {questionError}
          </p>
        )}
      </form>

      {/* Error */}
      {result?.type === 'error' && (
        <div className="result-card result-error" role="alert">
          <div className="result-icon">
            <IconAlertCircle size={18} />
          </div>
          <div className="result-body">
            <div className="result-title">Could not generate an answer</div>
            <div className="result-detail">{result.message}</div>
          </div>
        </div>
      )}

      {/* Answer */}
      {result?.type === 'success' && (
        <div className="answer-container fade-in">
          <div className="answer-card">
            <div className="answer-header">
              <IconFileText size={16} />
              <span>Answer</span>
            </div>
            <div className="answer-text">{result.data.answer}</div>

            {result.data.timings?.total_latency_ms && (
              <div className="answer-meta">
                Generated in {(result.data.timings.total_latency_ms / 1000).toFixed(1)}s
              </div>
            )}
          </div>

          {/* Sources */}
          {uniqueSources.length > 0 && (
            <div className="sources-section">
              <div className="sources-header">
                Sources ({uniqueSources.length})
              </div>
              <div className="sources-list">
                {uniqueSources.map((src) => (
                  <SourceCard key={src.source_url} source={src} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state — no result yet */}
      {!result && !asking && (
        <div className="empty-state">
          <div className="empty-icon">
            <IconSend size={28} />
          </div>
          <p className="empty-text">
            Ingest a webpage, then ask a question to get started.
          </p>
        </div>
      )}
    </section>
  )
}
