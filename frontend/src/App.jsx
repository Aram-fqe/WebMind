import { useState, useEffect } from 'react'
import { checkHealth, ingestUrl, askQuestion } from './api/client.js'
import Header from './components/Header.jsx'
import IngestForm from './components/IngestForm.jsx'
import AskForm from './components/AskForm.jsx'
import './App.css'

// ---------------------------------------------------------------------------
// App — root component. Orchestrates layout and passes API calls down.
// ---------------------------------------------------------------------------

function App() {
  // ── Health check ──────────────────────────────────────────────────────────
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
        setErrorDetails(err.message)
      }
    }
    verifyHealth()
  }, [])

  return (
    <div className="app">
      <Header status={status} errorDetails={errorDetails} />

      <main className="main-content">
        <IngestForm onIngest={ingestUrl} />
        <AskForm onAsk={askQuestion} />
      </main>

      <footer className="app-footer">
        <p>WebMind — AI-powered web research assistant</p>
      </footer>
    </div>
  )
}

export default App
