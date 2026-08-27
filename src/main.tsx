import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { Alert, Box, Button, Typography } from '@mui/material'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import App from './App'
import { AppTheme } from './theme'
import { initInteractionEnvironment } from './lib/interaction'
import { store } from './store/store'

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Telegram CRM render failure', error, info) }
  render() {
    if (!this.state.error) return this.props.children
    return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Box sx={{ width: '100%', maxWidth: 520 }}>
        <Typography variant="h2" component="h1">The CRM could not render.</Typography>
        <Alert severity="error" sx={{ mt: 2 }}>Reload the app. If the error returns, the latest client build needs attention.</Alert>
        <Button sx={{ mt: 2 }} variant="contained" startIcon={<RefreshRoundedIcon />} onClick={() => location.reload()}>Reload</Button>
      </Box>
    </Box>
  }
}

initInteractionEnvironment()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <AppTheme>
        <RootErrorBoundary><App /></RootErrorBoundary>
      </AppTheme>
    </Provider>
  </StrictMode>
)
