import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthGate } from './components/AuthGate.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { DealLinksProvider } from './components/DealLinksContext.jsx'

// Outer boundary is the last resort — it catches a crash in the app chrome
// itself (nav, header, auth), where the per-tab boundary inside App can't
// help. Without it those render as a blank page.
//
// DealLinksProvider sits inside AuthGate (its requests need the signed-in
// user's token) and outside App, so the cross-tab join is loaded once and
// every screen reads the same picture of each deal.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary label="The app" fullHeight={false} hint="Try again, or reload to start clean.">
      <AuthGate>
        <DealLinksProvider>
          <App />
        </DealLinksProvider>
      </AuthGate>
    </ErrorBoundary>
  </React.StrictMode>,
)
