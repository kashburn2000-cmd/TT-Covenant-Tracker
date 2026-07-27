import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthGate } from './components/AuthGate.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'

// Outer boundary is the last resort — it catches a crash in the app chrome
// itself (nav, header, auth), where the per-tab boundary inside App can't
// help. Without it those render as a blank page.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary label="The app" fullHeight={false} hint="Try again, or reload to start clean.">
      <AuthGate>
        <App />
      </AuthGate>
    </ErrorBoundary>
  </React.StrictMode>,
)
