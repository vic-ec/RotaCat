import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext'
import HintLayer from './components/HintLayer'
import './styles/index.css'
import { registerServiceWorker, reloadOnMissingChunk } from './lib/staleDeploy'

// After a deploy, move an open copy of the old version onto the new one
// rather than let it show missing images or pages (lib/staleDeploy).
reloadOnMissingChunk()
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Outside App, and so outside AuthProvider: /login, /signup and
        /pending render before a profile exists and still need a theme. */}
    <ThemeProvider>
      <App />
      {/* Restyles every `title` tooltip in the app — see HintLayer. */}
      <HintLayer />
    </ThemeProvider>
  </React.StrictMode>
)
