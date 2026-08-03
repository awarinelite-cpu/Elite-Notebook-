import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { registerSW } from 'virtual:pwa-register'
import './index.css'

// registerType is 'autoUpdate', but the plugin's own auto-injected register
// script never actually reloads the tab once a new service worker takes
// over — it just installs it silently in the background, so people stay
// stuck on old cached JS/CSS until they manually hard-refresh. This does it
// properly: skip-waits new workers immediately, reloads once the new one is
// in control, and re-checks for updates periodically while the tab is open
// (browsers otherwise only check for a new sw.js on navigation).
let refreshing = false
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })
}

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    setInterval(() => registration.update(), 60 * 1000)
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
)
