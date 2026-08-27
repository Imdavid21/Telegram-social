import { Alert, Avatar, Box, Button, CircularProgress, Container, Divider, Paper, Stack, Typography } from '@mui/material'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import HubRoundedIcon from '@mui/icons-material/HubRounded'
import InboxRoundedIcon from '@mui/icons-material/InboxRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import ViewKanbanRoundedIcon from '@mui/icons-material/ViewKanbanRounded'
import { motion, useReducedMotion } from 'motion/react'

type Props = { onConnect: () => void; connecting: boolean; backendReady: boolean; error?: string }

function Demo() {
  const reduced = useReducedMotion()
  return <motion.div initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, ease: [0.2, .8, .2, 1] }}>
    <Paper sx={{ border: 1, borderColor: 'divider', overflow: 'hidden', borderRadius: 3, bgcolor: '#0E0E10' }}>
      <Box sx={{ height: 38, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', px: 1.5, gap: .7 }}>{[0, 1, 2].map(dot => <Box key={dot} sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#353538' }} />)}</Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '100px 1fr', md: '250px 1fr 250px' }, minHeight: { xs: 390, md: 500 } }}>
        <Box sx={{ borderRight: 1, borderColor: 'divider', p: 1 }}>
          {['Founder', 'Investor', 'Partner', 'Developer'].map((name, index) => <Stack key={name} direction="row" sx={{ alignItems: 'center', gap: 1, p: 1, borderRadius: 2, bgcolor: index === 0 ? 'action.selected' : 'transparent' }}><Avatar sx={{ width: 28, height: 28, fontSize: 10 }}>{name[0]}</Avatar><Box sx={{ display: { xs: 'none', md: 'block' }, minWidth: 0 }}><Typography variant="body2" noWrap sx={{ fontWeight: 650 }}>{name}</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>Recent Telegram chat</Typography></Box></Stack>)}
        </Box>
        <Box sx={{ p: { xs: 1.5, md: 2.5 }, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="body2" sx={{ fontWeight: 650 }}>Founder</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>@founder · 4 mutual groups</Typography>
          <Stack sx={{ flex: 1, justifyContent: 'center', gap: 1.2 }}><Paper sx={{ alignSelf: 'flex-start', p: 1.2, border: 1, borderColor: 'divider', maxWidth: '75%' }}><Typography variant="body2">Can we discuss the partnership this week?</Typography></Paper><Paper sx={{ alignSelf: 'flex-end', p: 1.2, border: 1, borderColor: 'divider', bgcolor: 'action.selected', maxWidth: '75%' }}><Typography variant="body2">Yes. Friday works.</Typography></Paper></Stack>
          <Box sx={{ height: 42, border: 1, borderColor: 'divider', borderRadius: 2, display: 'flex', alignItems: 'center', px: 1.2 }}><Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>Message Founder…</Typography><ArrowForwardRoundedIcon fontSize="small" /></Box>
        </Box>
        <Box sx={{ display: { xs: 'none', md: 'block' }, borderLeft: 1, borderColor: 'divider', p: 2 }}><Typography variant="h3">Relationship</Typography><Divider sx={{ my: 1.5 }} /><Typography variant="caption" sx={{ color: 'text.secondary' }}>Category</Typography><Typography variant="body2" sx={{ mt: .3 }}>Founder</Typography><Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.4 }}>Company</Typography><Typography variant="body2" sx={{ mt: .3 }}>Acme Labs</Typography><Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.4 }}>Next action</Typography><Typography variant="body2" sx={{ mt: .3 }}>Book follow-up</Typography><Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.4 }}>Signal</Typography><Typography variant="body2" sx={{ mt: .3 }}>You never replied</Typography></Box>
      </Box>
    </Paper>
  </motion.div>
}

export function MinimalLandingPage({ onConnect, connecting, backendReady, error }: Props) {
  const reduced = useReducedMotion()
  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
    <Container maxWidth="lg">
      <Stack direction="row" sx={{ height: 70, alignItems: 'center' }}><Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}><Avatar sx={{ width: 30, height: 30, bgcolor: 'text.primary', color: 'background.default', fontSize: 11, fontWeight: 800 }}>TG</Avatar><Typography variant="body2" sx={{ fontWeight: 680 }}>Telegram CRM</Typography></Stack><Box sx={{ flex: 1 }} /><Button onClick={onConnect} disabled={connecting || !backendReady} variant="contained">{connecting ? 'Connecting…' : 'Open app'}</Button></Stack>
      {error ? <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert> : null}
      <Box sx={{ pt: { xs: 8, md: 13 }, pb: { xs: 6, md: 9 }, textAlign: 'center', maxWidth: 900, mx: 'auto' }}>
        <motion.div initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}><Typography component="h1" sx={{ fontSize: { xs: '3rem', md: '5.3rem' }, lineHeight: .98, fontWeight: 720, letterSpacing: '-.065em' }}>Your Telegram network, organized.</Typography><Typography sx={{ color: 'text.secondary', fontSize: { xs: '1rem', md: '1.18rem' }, maxWidth: 640, mx: 'auto', mt: 2.2 }}>Private chats become searchable relationships, follow-ups, opportunities, and a living network CRM without leaving Telegram behind.</Typography><Button onClick={onConnect} disabled={connecting || !backendReady} variant="contained" size="large" endIcon={connecting ? <CircularProgress size={15} color="inherit" /> : <ArrowForwardRoundedIcon />} sx={{ mt: 3 }}>{connecting ? 'Connecting Telegram' : 'Connect Telegram'}</Button></motion.div>
      </Box>
      <Demo />
      <Box sx={{ py: { xs: 8, md: 13 } }}><Typography variant="h1" sx={{ mb: 4 }}>Built around the relationship.</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4,1fr)' }, borderTop: 1, borderColor: 'divider' }}>{[
        [<InboxRoundedIcon />, 'Inbox', 'Read and reply with full Telegram history.'],
        [<HubRoundedIcon />, 'Network', 'Classify private chats from actual conversation context.'],
        [<ViewKanbanRoundedIcon />, 'Pipeline', 'Move opportunities without losing the person behind them.'],
        [<TaskAltRoundedIcon />, 'Follow-ups', 'Track what needs to happen next.']
      ].map(([icon, title, copy], index) => <Box key={String(title)} sx={{ py: 3, px: { xs: 0, md: 2 }, borderBottom: { xs: 1, md: 0 }, borderRight: { md: index < 3 ? 1 : 0 }, borderColor: 'divider' }}>{icon}<Typography variant="h2" sx={{ mt: 2 }}>{title}</Typography><Typography variant="body2" sx={{ color: 'text.secondary', mt: .8 }}>{copy}</Typography></Box>)}</Box></Box>
      <Divider />
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ py: 5, alignItems: { sm: 'center' }, gap: 2 }}><Box sx={{ flex: 1 }}><Typography variant="h2">Telegram stays the source of truth.</Typography><Typography variant="body2" sx={{ color: 'text.secondary', mt: .6 }}>CRM context is layered around your authenticated Telegram session.</Typography></Box><Button onClick={onConnect} disabled={connecting || !backendReady} variant="contained">Open app</Button></Stack>
    </Container>
  </Box>
}
