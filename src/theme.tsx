import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import type { ReactNode } from 'react'

const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'dark',
    primary: { main: '#D0FF4F', contrastText: '#101310' },
    background: { default: '#0B0D0C', paper: '#111412' },
    text: { primary: '#F3F5F1', secondary: '#9AA39B' },
    divider: '#232923',
    success: { main: '#A5D645' },
    warning: { main: '#E5B965' },
    error: { main: '#EF7979' },
    info: { main: '#8DB7FF' }
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Inter,Arial,sans-serif',
    h1: { fontSize: '2rem', fontWeight: 760, letterSpacing: '-0.045em', lineHeight: 1.05 },
    h2: { fontSize: '1.35rem', fontWeight: 740, letterSpacing: '-0.03em' },
    h3: { fontSize: '1rem', fontWeight: 720 },
    button: { textTransform: 'none', fontWeight: 700 },
    body2: { lineHeight: 1.5 }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        'html,body,#root': { minHeight: '100%', margin: 0 },
        body: { backgroundColor: '#0B0D0C' },
        '*': { boxSizing: 'border-box' }
      }
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 40, borderRadius: 10 }
      }
    },
    MuiIconButton: {
      styleOverrides: { root: { borderRadius: 10 } }
    },
    MuiTextField: {
      defaultProps: { size: 'small' }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 10, backgroundColor: '#0E110F' }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: { border: '1px solid #252A26', backgroundImage: 'none', boxShadow: '0 24px 70px rgba(0,0,0,.45)' }
      }
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } }
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 8, fontWeight: 650 } }
    },
    MuiTooltip: {
      defaultProps: { arrow: true, enterDelay: 450 }
    }
  }
})

export function AppTheme({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider>
}
