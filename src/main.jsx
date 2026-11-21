import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext'
import HintLayer from './components/HintLayer'
import './styles/index.css'

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
