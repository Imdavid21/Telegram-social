import { Box, Button, Container, Stack, Typography, alpha, useTheme } from '@mui/material'
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import { BrandMark } from './BrandMark'

type LandingPageProps = {
  onConnect: () => void
  onDemo: () => void
  connecting: boolean
  backendReady: boolean
  booting: boolean
  error?: string
}

export function LandingPage({ onConnect, onDemo, connecting, backendReady, booting, error }: LandingPageProps) {
  const theme = useTheme()
  const ink = theme.palette.text.primary
  const muted = theme.palette.text.secondary
  const border = theme.palette.divider
  const canvas = theme.palette.background.default
  const buttonBg = theme.palette.mode === 'dark' ? theme.palette.common.white : '#111111'
  const buttonText = theme.palette.mode === 'dark' ? '#111111' : theme.palette.common.white

  return <Box sx={{ minHeight: '100vh', bgcolor: canvas, color: ink }}>
    <Container maxWidth="lg" sx={{ px: { xs: 2.5, md: 4 } }}>
      <Stack component="header" direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 76, borderBottom: `1px solid ${border}` }}>
        <Stack component="a" href="/" direction="row" alignItems="center" spacing={1.1} sx={{ color: 'inherit', textDecoration: 'none' }}>
          <Box sx={{ width: 28, height: 28 }}><BrandMark /></Box>
          <Typography sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>Supergram</Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Button onClick={onDemo} color="inherit" sx={{ minWidth: 0, px: 1.5, fontSize: 13, fontWeight: 600 }}>Preview</Button>
          <Button onClick={backendReady ? onConnect : onConnect} disabled={connecting} variant="contained" disableElevation sx={{ borderRadius: 999, bgcolor: buttonBg, color: buttonText, px: 2.2, fontSize: 13, fontWeight: 700, '&:hover': { bgcolor: alpha(buttonBg, .88) } }}>
            {connecting ? 'Connecting' : backendReady ? 'Open app' : 'Try again'}
          </Button>
        </Stack>
      </Stack>

      <Box component="main" sx={{ pt: { xs: 9, md: 15 }, pb: { xs: 9, md: 15 } }}>
        <Box sx={{ maxWidth: 940 }}>
          <Typography component="p" sx={{ mb: 3, color: muted, fontSize: 14, lineHeight: 1.5 }}>Your Telegram graph, rebuilt for attention.</Typography>
          <Typography component="h1" sx={{ m: 0, maxWidth: 920, fontSize: { xs: '3.35rem', sm: '5rem', md: '7rem' }, lineHeight: { xs: .98, md: .92 }, letterSpacing: { xs: '-0.055em', md: '-0.07em' }, fontWeight: 500 }}>
            The signal without the noise.
          </Typography>
          <Typography sx={{ mt: { xs: 4, md: 5 }, maxWidth: 620, color: muted, fontSize: { xs: 17, md: 19 }, lineHeight: 1.55, letterSpacing: '-0.01em' }}>
            Supergram turns the channels, groups, and conversations you already follow into one feed. Switch between ranked and chronological views, scan media quickly, condense long updates, and keep every post tied to its original Telegram source.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 5, alignItems: { xs: 'stretch', sm: 'center' } }}>
            <Button onClick={onConnect} disabled={connecting} endIcon={<ArrowForwardRounded sx={{ fontSize: 17 }} />} variant="contained" disableElevation sx={{ alignSelf: { sm: 'flex-start' }, borderRadius: 999, bgcolor: buttonBg, color: buttonText, px: 2.5, fontSize: 14, fontWeight: 700, '&:hover': { bgcolor: alpha(buttonBg, .88) } }}>
              {connecting ? 'Connecting to Telegram' : backendReady ? 'Continue with Telegram' : 'Retry connection'}
            </Button>
            <Button onClick={onDemo} startIcon={<PlayArrowRounded sx={{ fontSize: 17 }} />} color="inherit" sx={{ alignSelf: { sm: 'flex-start' }, borderRadius: 999, px: 2.2, fontSize: 14, fontWeight: 600 }}>
              Preview feed
            </Button>
          </Stack>
          {error ? <Typography role="alert" sx={{ mt: 2, color: 'error.main', fontSize: 13, lineHeight: 1.5 }}>{error}</Typography> : null}
          <Typography sx={{ mt: 2.5, color: muted, fontSize: 12 }}>
            {backendReady ? 'Ready to connect' : booting ? 'Checking Telegram connection…' : 'Telegram connection is currently unavailable'}
          </Typography>
        </Box>

        <Box sx={{ mt: { xs: 10, md: 16 }, borderTop: `1px solid ${border}` }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 5, md: 10 }} sx={{ py: { xs: 6, md: 8 } }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ color: muted, fontSize: 12, mb: 1.5 }}>01</Typography>
              <Typography sx={{ fontSize: 19, fontWeight: 650, letterSpacing: '-0.02em' }}>For You or Latest</Typography>
              <Typography sx={{ mt: 1, color: muted, fontSize: 14, lineHeight: 1.6, maxWidth: 320 }}>Use relevance ranking when you want signal, or switch to strict reverse chronology when order matters more.</Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ color: muted, fontSize: 12, mb: 1.5 }}>02</Typography>
              <Typography sx={{ fontSize: 19, fontWeight: 650, letterSpacing: '-0.02em' }}>Long updates, condensed</Typography>
              <Typography sx={{ mt: 1, color: muted, fontSize: 14, lineHeight: 1.6, maxWidth: 320 }}>Long public updates can become short, readable briefs while the original message remains one action away.</Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ color: muted, fontSize: 12, mb: 1.5 }}>03</Typography>
              <Typography sx={{ fontSize: 19, fontWeight: 650, letterSpacing: '-0.02em' }}>One story, many sources</Typography>
              <Typography sx={{ mt: 1, color: muted, fontSize: 14, lineHeight: 1.6, maxWidth: 320 }}>Similar cross-channel updates can be grouped so repetition takes less space without erasing where the story came from.</Typography>
            </Box>
          </Stack>
        </Box>
      </Box>

      <Stack component="footer" direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ py: 4, borderTop: `1px solid ${border}`, color: muted }}>
        <Typography sx={{ fontSize: 12 }}>Independent client using the Telegram API. Not affiliated with Telegram.</Typography>
        <Stack direction="row" spacing={2.5}>
          <Typography component="a" href="/privacy.html" sx={{ color: 'inherit', fontSize: 12, textDecoration: 'none' }}>Privacy</Typography>
          <Typography component="a" href="/terms.html" sx={{ color: 'inherit', fontSize: 12, textDecoration: 'none' }}>Terms</Typography>
        </Stack>
      </Stack>
    </Container>
  </Box>
}
