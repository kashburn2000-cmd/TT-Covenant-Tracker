import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AccessGate } from './components/AccessGate.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AccessGate>
      <App />
    </AccessGate>
  </React.StrictMode>,
)
