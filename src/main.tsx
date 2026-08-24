import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './production.css'
import './feed.css'
import './feed-engine.css'

async function clearLegacyPwa() {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(async registration => {
        try { await registration.update() } catch {}
        try { await registration.unregister() } catch {}
      }))
    } catch {}
  }

  if ('caches' in window) {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map(key => caches.delete(key)))
    } catch {}
  }
}

function reportClientError(kind: string, error: unknown, componentStack = '') {
  const message = error instanceof Error ? error.message : String(error || 'Unknown client error')
  const stack = error instanceof Error ? error.stack || '' : ''
  void fetch('/api/client-error', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, message: message.slice(0, 800), stack: `${stack}\n${componentStack}`.slice(0, 5000), path: location.pathname })
  }).catch(() => {})
}

window.addEventListener('error', event => reportClientError('window', event.error || event.message))
window.addEventListener('unhandledrejection', event => reportClientError('promise', event.reason))

class RenderBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error || 'Render failed') }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError('react', error, info.componentStack || '')
  }

  render() {
    if (this.state.error) {
      return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#0b1116', color: '#f3f7fa', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <section style={{ width: 'min(520px, 100%)', padding: 24, border: '1px solid #222f39', borderRadius: 16, background: '#121a22' }}>
          <strong style={{ display: 'block', marginBottom: 8 }}>Supergram hit a rendering error.</strong>
          <p style={{ margin: '0 0 16px', color: '#9aa9b5', lineHeight: 1.5 }}>{this.state.error}</p>
          <button onClick={() => location.reload()} style={{ border: 0, borderRadius: 10, padding: '10px 14px', background: '#2AABEE', color: '#fff', fontWeight: 700 }}>Reload</button>
        </section>
      </main>
    }
    return this.props.children
  }
}

void clearLegacyPwa()

const root = document.getElementById('root')
if (!root) throw new Error('App root not found')
root.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;background:#0b1116;color:#8294a3;font:14px system-ui">Loading Supergram…</div>'
createRoot(root).render(<StrictMode><RenderBoundary><App /></RenderBoundary></StrictMode>)
