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
    background: { default: '#0A0A0B', paper: '#141416' },
    primary: { main: '#F5F5F5', contrastText: '#0A0A0B' },
    text: { primary: '#FAFAFA', secondary: '#B6B6BA' },
    divider: '#2B2B2F',
    action: { hover: 'rgba(255,255,255,.055)', selected: 'rgba(255,255,255,.10)' }
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
    MuiDialog: { styleOverrides: { paper: { border: '1px solid #2B2B2F', borderRadius: 24 } } },
    MuiSkeleton: { styleOverrides: { root: { backgroundColor: 'rgba(255,255,255,.075)' } } }
  }
})

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Supergram render failure', error, info) }
  render() {
    if (!this.state.error) return this.props.children
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#0A0A0B', color: '#FAFAFA', fontFamily: 'Inter, sans-serif' }}>
      <section style={{ width: 'min(520px,100%)', border: '1px solid #2B2B2F', borderRadius: 20, padding: 24, background: '#141416' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Supergram hit a rendering error</h1>
        <p style={{ margin: 0, color: '#B6B6BA', lineHeight: 1.6 }}>Reload the app. If this keeps happening, the latest client build needs attention.</p>
        <button onClick={() => location.reload()} style={{ marginTop: 18, border: 0, borderRadius: 10, padding: '10px 16px', background: '#FAFAFA', color: '#0A0A0B', fontWeight: 800 }}>Reload</button>
      </section>
    </main>
  }
}

initInteractionEnvironment()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </RootErrorBoundary>
  </StrictMode>,
)
