import { Alert, Avatar, Box, Button, CircularProgress, Container, Paper, Stack, Typography } from '@mui/material'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded'

type Props = { onConnect: () => void; connecting: boolean; backendReady: boolean; error?: string }

function ProductPreview() {
  return <Paper variant="outlined" sx={{ width: '100%', maxWidth: 900, mx: 'auto', overflow: 'hidden', textAlign: 'left', borderRadius: 3 }}>
    <Stack direction="row" sx={{ minHeight: 410 }}>
      <Box sx={{ width: { xs: '100%', md: 340 }, borderRight: { md: 1 }, borderColor: 'divider', p: 2 }}>
        <Typography variant="h2">Today</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .4, mb: 2 }}>3 people need attention</Typography>
        {[['M', 'Maya Chen', 'New message', 'Can you review the proposal today?'], ['D', 'David Park', 'Follow up now', 'Send the revised scope'], ['P', 'Priya Shah', 'Going quiet', 'Last contact 32 days ago']].map(([letter, name, reason, detail], index) => <Stack key={name} direction="row" sx={{ gap: 1.2, p: 1.25, mb: .6, borderRadius: 2, bgcolor: index === 0 ? 'action.selected' : 'transparent' }}><Avatar sx={{ width: 36, height: 36, fontSize: 12 }}>{letter}</Avatar><Box sx={{ minWidth: 0 }}><Typography variant="body2" sx={{ fontWeight: 700 }}>{name}</Typography><Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700 }}>{reason}</Typography><Typography variant="body2" color="text.secondary" noWrap>{detail}</Typography></Box></Stack>)}
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'flex' }, flex: 1, p: 3, flexDirection: 'column' }}><Stack direction="row" sx={{ alignItems: 'center', gap: 1.2, pb: 2, borderBottom: 1, borderColor: 'divider' }}><Avatar>M</Avatar><Box sx={{ flex: 1 }}><Typography sx={{ fontWeight: 700 }}>Maya Chen</Typography><Typography variant="caption" color="text.secondary">Needs a reply</Typography></Box><Button size="small" startIcon={<ScheduleRoundedIcon />}>Follow up</Button></Stack><Stack sx={{ flex: 1, justifyContent: 'center', gap: 1 }}><Paper variant="outlined" sx={{ alignSelf: 'flex-start', p: 1.4, maxWidth: '78%' }}><Typography variant="body2">Can you review the proposal today?</Typography></Paper><Paper sx={{ alignSelf: 'flex-end', p: 1.4, maxWidth: '78%', bgcolor: 'action.selected' }}><Typography variant="body2">Yes. I’ll send comments by 4.</Typography></Paper></Stack><Stack direction="row" sx={{ alignItems: 'center', gap: 1, border: 1, borderColor: 'divider', borderRadius: 2, px: 1.4, height: 44 }}><Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Message Maya</Typography><CheckRoundedIcon fontSize="small" /></Stack></Box>
    </Stack>
  </Paper>
}

export function MinimalLandingPage({ onConnect, connecting, backendReady, error }: Props) {
  return <Box sx={{ height: '100dvh', overflowY: 'auto', overscrollBehavior: 'contain', bgcolor: 'background.default' }}>
    <Container maxWidth="lg">
      <Stack component="header" direction="row" sx={{ height: 72, alignItems: 'center' }}><Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}><Avatar sx={{ width: 30, height: 30, bgcolor: 'text.primary', color: 'background.default', fontSize: 11, fontWeight: 900 }}>T</Avatar><Typography variant="body2" sx={{ fontWeight: 750 }}>Telegram Focus</Typography></Stack><Box sx={{ flex: 1 }} /><Button onClick={onConnect} disabled={connecting || !backendReady} variant="outlined">Connect Telegram</Button></Stack>
      <Box component="main" sx={{ textAlign: 'center', pt: { xs: 8, md: 12 }, pb: 10 }}>
        <Typography component="h1" sx={{ fontSize: { xs: '3rem', md: '5.4rem' }, lineHeight: .98, fontWeight: 760, letterSpacing: '-.065em', maxWidth: 920, mx: 'auto' }}>Never lose an important Telegram conversation.</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: { xs: '1rem', md: '1.16rem' }, maxWidth: 620, mx: 'auto', mt: 2.5 }}>See who needs a reply, remember the context, and follow up at the right time.</Typography>
        <Button onClick={onConnect} disabled={connecting || !backendReady} variant="contained" size="large" endIcon={connecting ? <CircularProgress size={16} color="inherit" /> : <ArrowForwardRoundedIcon />} sx={{ mt: 3 }}>{connecting ? 'Connecting…' : 'Connect Telegram'}</Button>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.4 }}>Your Telegram session stays private. Relationship notes remain under your control.</Typography>
        {error ? <Alert severity="error" sx={{ maxWidth: 620, mx: 'auto', mt: 2 }}>{error}</Alert> : !backendReady ? <Alert severity="info" sx={{ maxWidth: 620, mx: 'auto', mt: 2 }}>Telegram connection is temporarily unavailable.</Alert> : null}
        <Box sx={{ mt: { xs: 7, md: 10 } }}><ProductPreview /></Box>
      </Box>
    </Container>
  </Box>
}
