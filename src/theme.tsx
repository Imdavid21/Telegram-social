import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import type { ReactNode } from 'react'

const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'dark',
    primary: { main: '#F5F5F7', contrastText: '#0A0A0B' },
    background: { default: '#0A0A0B', paper: '#111113' },
    text: { primary: '#F5F5F7', secondary: '#8E8E93', disabled: '#5F5F63' },
    divider: '#242426',
    success: { main: '#7EDC8B' },
    warning: { main: '#F5C56B' },
    error: { main: '#FF7A7A' },
    info: { main: '#7FB4FF' }
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Segoe UI",sans-serif',
    h1: { fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1.08 },
    h2: { fontSize: '1.22rem', fontWeight: 680, letterSpacing: '-0.025em', lineHeight: 1.2 },
    h3: { fontSize: '.94rem', fontWeight: 650, letterSpacing: '-0.01em' },
    body1: { fontSize: '.9rem', lineHeight: 1.5 },
    body2: { fontSize: '.84rem', lineHeight: 1.48 },
    caption: { fontSize: '.72rem', lineHeight: 1.4 },
    button: { textTransform: 'none', fontWeight: 620, letterSpacing: '-0.01em', fontSize: '.82rem' }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        'html,body,#root': { minHeight: '100%', margin: 0 },
        body: { backgroundColor: '#0A0A0B', color: '#F5F5F7' },
        '*': { boxSizing: 'border-box' },
        '*::-webkit-scrollbar': { width: 9, height: 9 },
        '*::-webkit-scrollbar-thumb': { background: '#2A2A2D', borderRadius: 99, border: '2px solid transparent', backgroundClip: 'padding-box' },
        '*::-webkit-scrollbar-track': { background: 'transparent' }
      }
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 38, borderRadius: 11, paddingInline: 14, transition: 'transform 140ms ease, background-color 140ms ease, border-color 140ms ease', '&:active': { transform: 'scale(.985)' } },
        containedPrimary: { backgroundColor: '#F5F5F7', color: '#0A0A0B', '&:hover': { backgroundColor: '#FFFFFF' } }
      }
    },
    MuiIconButton: {
      styleOverrides: { root: { borderRadius: 11, transition: 'background-color 140ms ease, transform 140ms ease', '&:active': { transform: 'scale(.96)' } } }
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 11, backgroundColor: '#111113', fontSize: '.84rem', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2B2B2E' }, '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#3A3A3D' }, '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6B6B70', borderWidth: 1 } }
      }
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none', boxShadow: 'none' } }
    },
    MuiDrawer: {
      styleOverrides: { paper: { backgroundColor: 'rgba(17,17,19,.98)', backdropFilter: 'blur(24px)', borderColor: '#242426' } }
    },
    MuiDialog: {
      styleOverrides: { paper: { border: '1px solid #2A2A2D', backgroundColor: '#141416', backgroundImage: 'none', boxShadow: '0 28px 90px rgba(0,0,0,.52)', borderRadius: 18 } }
    },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: '1.05rem', fontWeight: 680, padding: '20px 20px 10px' } } },
    MuiDialogContent: { styleOverrides: { root: { padding: '10px 20px 16px' } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '8px 20px 18px' } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 600, height: 26 } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: 10, marginInline: 6, transition: 'background-color 130ms ease' } } },
    MuiTableCell: { styleOverrides: { root: { borderColor: '#242426', fontSize: '.8rem', padding: '10px 12px' }, head: { color: '#8E8E93', fontWeight: 620, backgroundColor: '#111113' } } },
    MuiTooltip: { defaultProps: { arrow: false, enterDelay: 420 }, styleOverrides: { tooltip: { backgroundColor: '#2A2A2D', color: '#F5F5F7', fontSize: '.72rem', borderRadius: 8 } } },
    MuiBottomNavigation: { styleOverrides: { root: { backgroundColor: 'rgba(17,17,19,.96)', backdropFilter: 'blur(22px)' } } },
    MuiBottomNavigationAction: { styleOverrides: { root: { minWidth: 0, color: '#8E8E93', '&.Mui-selected': { color: '#F5F5F7' } } } }
  }
})

export function AppTheme({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider>
}
