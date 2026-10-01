import { useState, useEffect } from 'react'
import { checkHealth } from './api/client.js'
import './App.css'

function App() {
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

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>WebMind</h1>
      <h2>Backend Status</h2>
      <p>
        ● {status}
      </p>
      {errorDetails && (
        <p style={{ color: 'red' }}>
          {errorDetails}
        </p>
      )}
    </div>
  )
}

export default App
