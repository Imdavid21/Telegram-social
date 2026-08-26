import { Box, Button, Container, Stack, Typography } from '@mui/material'
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

const ink = '#111111'
const muted = '#6f6f6f'
const border = '#e9e9e9'

export function LandingPage({ onConnect, onDemo, connecting, backendReady, booting, error }: LandingPageProps) {
  return <Box sx={{ minHeight: '100vh', bgcolor: '#fff', color: ink }}>
    <Container maxWidth="lg" sx={{ px: { xs: 2.5, md: 4 } }}>
      <Stack component="header" direction="row" alignItems="center" justifyContent="space-between" sx={{ height: 76, borderBottom: `1px solid ${border}` }}>
        <Stack component="a" href="/" direction="row" alignItems="center" spacing={1.1} sx={{ color: 'inherit', textDecoration: 'none' }}>
          <Box sx={{ width: 28, height: 28 }}><BrandMark /></Box>
          <Typography sx={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>Supergram</Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Button onClick={onDemo} color="inherit" sx={{ minWidth: 0, px: 1.5, fontSize: 13, fontWeight: 500, textTransform: 'none' }}>Demo</Button>
          <Button onClick={onConnect} disabled={connecting} variant="contained" disableElevation sx={{ borderRadius: 999, bgcolor: ink, color: '#fff', px: 2.2, py: 1, fontSize: 13, fontWeight: 600, textTransform: 'none', '&:hover': { bgcolor: '#222' } }}>
            {connecting ? 'Connecting' : 'Open app'}
          </Button>
        </Stack>
      </Stack>

      <Box component="main" sx={{ pt: { xs: 10, md: 16 }, pb: { xs: 10, md: 16 } }}>
        <Box sx={{ maxWidth: 940 }}>
          <Typography component="p" sx={{ mb: 3, color: muted, fontSize: 14, lineHeight: 1.5 }}>Telegram, ranked by what matters.</Typography>
          <Typography component="h1" sx={{ m: 0, maxWidth: 920, fontSize: { xs: '3.4rem', sm: '5rem', md: '7rem' }, lineHeight: { xs: .98, md: .92 }, letterSpacing: { xs: '-0.055em', md: '-0.07em' }, fontWeight: 500 }}>
            The signal without the noise.
          </Typography>
          <Typography sx={{ mt: { xs: 4, md: 5 }, maxWidth: 580, color: muted, fontSize: { xs: 17, md: 19 }, lineHeight: 1.55, letterSpacing: '-0.01em' }}>
            Supergram turns the channels and conversations you already follow into one clean feed. Media comes first. Important text becomes short news briefs. Repeated stories collapse into one.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 5, alignItems: { xs: 'stretch', sm: 'center' } }}>
            <Button onClick={onConnect} disabled={connecting || !backendReady} endIcon={<ArrowForwardRounded sx={{ fontSize: 17 }} />} variant="contained" disableElevation sx={{ alignSelf: { sm: 'flex-start' }, borderRadius: 999, bgcolor: ink, color: '#fff', px: 2.5, py: 1.25, fontSize: 14, fontWeight: 600, textTransform: 'none', '&:hover': { bgcolor: '#222' } }}>
              {connecting ? 'Connecting to Telegram' : 'Continue with Telegram'}
            </Button>
            <Button onClick={onDemo} startIcon={<PlayArrowRounded sx={{ fontSize: 17 }} />} color="inherit" sx={{ alignSelf: { sm: 'flex-start' }, borderRadius: 999, px: 2.2, py: 1.2, fontSize: 14, fontWeight: 500, textTransform: 'none' }}>
              Preview feed
            </Button>
          </Stack>
          {error ? <Typography sx={{ mt: 2, color: '#b42318', fontSize: 12 }}>{error}</Typography> : null}
          <Typography sx={{ mt: 2.5, color: '#9a9a9a', fontSize: 11.5 }}>
            {backendReady ? 'Telegram API ready' : booting ? 'Checking connection' : 'Backend unavailable'}
          </Typography>
        </Box>

        <Box sx={{ mt: { xs: 10, md: 16 }, borderTop: `1px solid ${border}` }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 5, md: 10 }} sx={{ py: { xs: 6, md: 8 } }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ color: muted, fontSize: 12, mb: 1.5 }}>01</Typography>
              <Typography sx={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em' }}>Ranked, not chronological</Typography>
              <Typography sx={{ mt: 1, color: muted, fontSize: 14, lineHeight: 1.6, maxWidth: 300 }}>Media, urgency, source velocity, freshness, and engagement decide what deserves the top of the feed.</Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ color: muted, fontSize: 12, mb: 1.5 }}>02</Typography>
              <Typography sx={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em' }}>Summarized by ML</Typography>
              <Typography sx={{ mt: 1, color: muted, fontSize: 14, lineHeight: 1.6, maxWidth: 300 }}>Long text updates are condensed into short, news-like briefs while the original message remains one tap away.</Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ color: muted, fontSize: 12, mb: 1.5 }}>03</Typography>
              <Typography sx={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em' }}>One story, many sources</Typography>
              <Typography sx={{ mt: 1, color: muted, fontSize: 14, lineHeight: 1.6, maxWidth: 300 }}>Similar posts across channels are grouped so the same event does not occupy half your screen.</Typography>
            </Box>
          </Stack>
        </Box>
      </Box>

      <Stack component="footer" direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ py: 4, borderTop: `1px solid ${border}`, color: '#8a8a8a' }}>
        <Typography sx={{ fontSize: 11.5 }}>Independent client using the Telegram API.</Typography>
        <Stack direction="row" spacing={2.5}>
          <Typography component="a" href="/privacy.html" sx={{ color: 'inherit', fontSize: 11.5, textDecoration: 'none' }}>Privacy</Typography>
          <Typography component="a" href="/terms.html" sx={{ color: 'inherit', fontSize: 11.5, textDecoration: 'none' }}>Terms</Typography>
        </Stack>
      </Stack>
    </Container>
  </Box>
}
