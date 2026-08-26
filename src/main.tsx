import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import App from './App'
import { initInteractionEnvironment } from './lib/interaction'
import './styles.css'
import './production.css'
import './feed.css'
import './feed-engine.css'
import './landing.css'
import './demo.css'
import './identity.css'
import './app-system.css'
import './session-boot.css'

const muiTheme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#0e1114', paper: '#11161b' },
    primary: { main: '#2aabee' },
    text: { primary: '#f4f7f9', secondary: '#8e9caa' },
    divider: '#25313b',
    action: { hover: 'rgba(255,255,255,.045)', selected: 'rgba(42,171,238,.10)' }
  },
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: { textTransform: 'none', fontWeight: 700 }
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableRipple: true, disableElevation: true },
      styleOverrides: { root: { borderRadius: 12, minHeight: 40 } }
    },
    MuiIconButton: {
      defaultProps: { disableRipple: true },
      styleOverrides: { root: { borderRadius: 10 } }
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiDialog: { styleOverrides: { paper: { border: '1px solid #25313b', borderRadius: 24 } } },
    MuiInputBase: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiTooltip: { styleOverrides: { tooltip: { background: '#17212b', color: '#f4f7f9', border: '1px solid #25313b', fontSize: 11 } } }
  }
})

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
      return <main style={{ minHeight: 'var(--tg-viewport-height, 100vh)', display: 'grid', placeItems: 'center', padding: 24, background: '#0e1114', color: '#f4f7f9', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <section style={{ width: 'min(520px, 100%)', padding: 28, border: '1px solid #25313b', borderRadius: 24, background: '#11161b' }}>
          <strong style={{ display: 'block', marginBottom: 8, fontSize: 22, letterSpacing: '-.035em' }}>Supergram could not render this view.</strong>
          <p style={{ margin: '0 0 18px', color: '#8e9caa', lineHeight: 1.55 }}>{this.state.error}</p>
          <button className="pressable" onClick={() => location.reload()} style={{ border: 0, borderRadius: 12, padding: '11px 16px', background: '#2aabee', color: '#fff', fontWeight: 700 }}>Reload</button>
        </section>
      </main>
    }
    return this.props.children
  }
}

void clearLegacyPwa()
initInteractionEnvironment()

const root = document.getElementById('root')
if (!root) throw new Error('App root not found')
root.innerHTML = '<div style="min-height:var(--tg-viewport-height,100vh);display:grid;place-items:center;background:#0e1114;color:#8e9caa;font:13px Inter,system-ui,sans-serif">Loading Supergram…</div>'
createRoot(root).render(
  <StrictMode>
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <RenderBoundary><App /></RenderBoundary>
    </ThemeProvider>
  </StrictMode>
)
