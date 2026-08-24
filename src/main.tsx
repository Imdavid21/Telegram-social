import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './production.css'
import './feed.css'

async function clearLegacyPwa() {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(registration => registration.unregister()))
    } catch {}
  }

  if ('caches' in window) {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map(key => caches.delete(key)))
    } catch {}
  }
}

void clearLegacyPwa()

const root = document.getElementById('root')
if (!root) throw new Error('App root not found')
createRoot(root).render(<StrictMode><App /></StrictMode>)
