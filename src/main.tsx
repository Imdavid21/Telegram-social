import { Component, StrictMode, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import App from './App'
import { initInteractionEnvironment } from './lib/interaction'
import { loadSettings } from './lib/storage'
import type { ThemeMode, UserSettings } from './types'
import './styles.css'
import './production.css'
import './feed.css'
import './feed-engine.css'
import './landing.css'
import './demo.css'
import './identity.css'
import './app-system.css'
import './session-boot.css'
import './ux-overhaul.css'

function resolveThemeMode(themeMode: ThemeMode) {
  if (themeMode === 'light' || themeMode === 'dark') return themeMode
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function buildTheme(mode: 'light' | 'dark') {
  const dark = mode === 'dark'
  return createTheme({
    palette: {
      mode,
      background: { default: dark ? '#0E1114' : '#FAFAFA', paper: dark ? '#11161B' : '#FFFFFF' },
      primary: { main: dark ? '#F5F5F5' : '#111111', contrastText: dark ? '#0A0A0B' : '#FFFFFF' },
      error: { main: dark ? '#FF7A8A' : '#B42318' },
      text: { primary: dark ? '#F4F7F9' : '#111111', secondary: dark ? '#A8B3BD' : '#5F6368' },
      divider: dark ? '#25313B' : '#DBDBDB',
      action: { hover: dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.045)', selected: dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.07)' }
    },
    typography: {
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      button: { textTransform: 'none', fontWeight: 700 },
      body1: { lineHeight: 1.55 },
      body2: { lineHeight: 1.5 }
    },
    shape: { borderRadius: 12 },
    components: {
      MuiButton: {
        defaultProps: { disableRipple: true, disableElevation: true },
        styleOverrides: { root: { borderRadius: 10, minHeight: 44 } }
      },
      MuiIconButton: {
        defaultProps: { disableRipple: true },
        styleOverrides: { root: { borderRadius: 10, minWidth: 44, minHeight: 44 } }
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiDialog: { styleOverrides: { paper: { border: `1px solid ${dark ? '#25313B' : '#DBDBDB'}`, borderRadius: 20 } } },
      MuiSkeleton: { styleOverrides: { root: { backgroundColor: dark ? 'rgba(255,255,255,.075)' : 'rgba(0,0,0,.07)' } } },
      MuiTab: { styleOverrides: { root: { minHeight: 44, textTransform: 'none', fontWeight: 650 } } },
      MuiListItemButton: { styleOverrides: { root: { minHeight: 52, borderRadius: 10 } } }
    }
  })
}

function AppThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings())
  const [systemLight, setSystemLight] = useState(() => window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false)

  useEffect(() => {
    const onSettings = (event: Event) => {
      const custom = event as CustomEvent<UserSettings>
      setSettings(custom.detail || loadSettings())
    }
    window.addEventListener('supergram:settings-changed', onSettings)
    return () => window.removeEventListener('supergram:settings-changed', onSettings)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setSystemLight(media.matches)
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [])

  const mode = settings.themeMode === 'system' ? (systemLight ? 'light' : 'dark') : resolveThemeMode(settings.themeMode)
  const theme = useMemo(() => buildTheme(mode), [mode])

  useEffect(() => {
    document.documentElement.dataset.theme = mode
    document.documentElement.style.colorScheme = mode
  }, [mode])

  return <ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider>
}

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Supergram render failure', error, info) }
  render() {
    if (!this.state.error) return this.props.children
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'Canvas', color: 'CanvasText', fontFamily: 'Inter, sans-serif' }}>
      <section style={{ width: 'min(520px,100%)', border: '1px solid color-mix(in srgb, CanvasText 16%, transparent)', borderRadius: 20, padding: 24 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Supergram hit a rendering error</h1>
        <p style={{ margin: 0, opacity: .72, lineHeight: 1.6 }}>Reload the app. If this keeps happening, the latest client build needs attention.</p>
        <button onClick={() => location.reload()} style={{ marginTop: 18, border: '1px solid currentColor', borderRadius: 10, padding: '10px 16px', background: 'transparent', color: 'inherit', fontWeight: 800 }}>Reload Supergram</button>
      </section>
    </main>
  }
}

initInteractionEnvironment()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <AppThemeProvider><App /></AppThemeProvider>
    </RootErrorBoundary>
  </StrictMode>,
)
