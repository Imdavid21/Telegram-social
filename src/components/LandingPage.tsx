import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Toolbar,
  Typography
} from '@mui/material'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import ForumRoundedIcon from '@mui/icons-material/ForumRounded'
import Groups2RoundedIcon from '@mui/icons-material/Groups2Rounded'
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import ViewKanbanRoundedIcon from '@mui/icons-material/ViewKanbanRounded'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { BrandMark } from './BrandMark'

type LandingPageProps = {
  onConnect: () => void
  connecting: boolean
  backendReady: boolean
  error?: string
}

type WorkflowEvent = {
  icon: React.ReactNode
  title: string
  body: string
}

const workflowEvents: WorkflowEvent[] = [
  { icon: <ForumRoundedIcon fontSize="small" />, title: 'Telegram message received', body: 'Can we discuss the partnership this week?' },
  { icon: <Groups2RoundedIcon fontSize="small" />, title: 'Relationship context loaded', body: 'Profile, username, and mutual groups are attached.' },
  { icon: <TaskAltRoundedIcon fontSize="small" />, title: 'Follow-up created', body: 'Book partnership call · Friday' },
  { icon: <ViewKanbanRoundedIcon fontSize="small" />, title: 'Opportunity moved', body: 'Qualified' }
]

const features = [
  {
    icon: <ForumRoundedIcon />,
    title: 'Work from the real conversation',
    copy: 'Load older messages, read the full relationship history, and send Telegram messages from the same workspace.'
  },
  {
    icon: <Groups2RoundedIcon />,
    title: 'Open the person, not a CRM record',
    copy: 'Pull Telegram profile details and mutual groups when a contact opens, then keep private CRM context beside them.'
  },
  {
    icon: <TaskAltRoundedIcon />,
    title: 'Make every follow-up explicit',
    copy: 'Create, edit, complete, and delete tasks with direct Telegram username mapping and clear due states.'
  },
  {
    icon: <ViewKanbanRoundedIcon />,
    title: 'Move deals without losing the thread',
    copy: 'Use a Trello-style pipeline for opportunities while every card remains tied back to a Telegram contact.'
  },
  {
    icon: <AutoAwesomeRoundedIcon />,
    title: 'Use AI only when you ask for it',
    copy: 'Generate a relationship brief from loaded messages, review it, and decide whether to apply a suggested next action.'
  },
  {
    icon: <ShieldRoundedIcon />,
    title: 'Keep Telegram as the message source',
    copy: 'Messages stay in Telegram. CRM notes, tags, tasks, and opportunities sit beside the conversation instead of replacing it.'
  }
]

const pipelineStages = ['Lead', 'Contacted', 'Qualified', 'Proposal']

function Reveal({ children, delay = 0, y = 24 }: { children: React.ReactNode; delay?: number; y?: number }) {
  const reduced = useReducedMotion()
  return <motion.div
    initial={reduced ? false : { opacity: 0, y }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.18 }}
    transition={{ duration: reduced ? 0 : .6, delay, ease: [0.2, 0.8, 0.2, 1] }}
  >{children}</motion.div>
}

function Pressable({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion()
  return <motion.div whileHover={reduced ? undefined : { scale: 1.015 }} whileTap={reduced ? undefined : { scale: .98 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}>{children}</motion.div>
}

function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1])
  return <motion.div style={{ scaleX, transformOrigin: '0 50%' }} aria-hidden="true">
    <Box sx={{ position: 'fixed', inset: '0 0 auto 0', height: 2, bgcolor: 'primary.main', zIndex: 2000 }} />
  </motion.div>
}

function WorkflowStack() {
  const [active, setActive] = useState(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) return
    const timer = window.setInterval(() => setActive(current => (current + 1) % workflowEvents.length), 1600)
    return () => window.clearInterval(timer)
  }, [reduced])

  return <Paper variant="outlined" sx={{ position: 'relative', overflow: 'hidden', p: { xs: 1.5, sm: 2 }, bgcolor: '#0D100E', borderColor: '#262C27', minHeight: 410 }}>
    <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 72% 18%, rgba(208,255,79,.08), transparent 36%)', pointerEvents: 'none' }} />
    <Stack sx={{ position: 'relative', gap: 1.1 }}>
      {workflowEvents.map((event, index) => {
        const done = index < active
        const selected = index === active
        return <motion.div
          key={event.title}
          animate={reduced ? undefined : { y: selected ? -2 : 0, scale: selected ? 1.015 : 1, opacity: index > active ? .46 : 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: selected ? 'rgba(208,255,79,.055)' : '#111412', borderColor: selected ? 'rgba(208,255,79,.28)' : '#252A26' }}>
            <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1.25 }}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: done || selected ? 'primary.main' : '#202520', color: done || selected ? 'primary.contrastText' : 'text.secondary' }}>{done ? <CheckRoundedIcon fontSize="small" /> : event.icon}</Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 760 }}>{event.title}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: .35, lineHeight: 1.55 }}>{event.body}</Typography>
              </Box>
              {selected ? <motion.div animate={reduced ? undefined : { opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.3, repeat: Infinity }}><Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'primary.main', mt: .6 }} /></motion.div> : null}
            </Stack>
          </Paper>
        </motion.div>
      })}
    </Stack>
    <Box sx={{ position: 'relative', mt: 2 }}>
      <LinearProgress variant="determinate" value={((active + 1) / workflowEvents.length) * 100} sx={{ height: 5, borderRadius: 99, bgcolor: '#1A1F1A' }} />
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: .9 }}>One conversation becomes a tracked relationship.</Typography>
    </Box>
  </Paper>
}

function ProductWindow() {
  const reduced = useReducedMotion()
  const [messageSent, setMessageSent] = useState(false)
  const [pipelineStep, setPipelineStep] = useState(2)

  useEffect(() => {
    if (reduced) return
    const timer = window.setInterval(() => setPipelineStep(current => current === 3 ? 2 : current + 1), 2500)
    return () => window.clearInterval(timer)
  }, [reduced])

  return <Box sx={{ position: 'relative' }}>
    <motion.div
      animate={reduced ? undefined : { boxShadow: ['0 40px 100px rgba(0,0,0,.35)', '0 50px 130px rgba(0,0,0,.5)', '0 40px 100px rgba(0,0,0,.35)'] }}
      transition={{ duration: 4, repeat: Infinity }}
      style={{ borderRadius: 18 }}
    >
      <Paper variant="outlined" sx={{ overflow: 'hidden', bgcolor: '#0A0C0B', borderColor: '#292F29', borderRadius: '18px' }}>
        <Box sx={{ height: 42, borderBottom: 1, borderColor: 'divider', px: 1.5, display: 'flex', alignItems: 'center', gap: .7 }}>
          {[0, 1, 2].map(dot => <Box key={dot} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#343A34' }} />)}
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>Telegram CRM</Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '110px minmax(0,1fr)', md: '220px minmax(0,1fr) 260px' }, minHeight: { xs: 430, md: 520 } }}>
          <Box sx={{ borderRight: 1, borderColor: 'divider', bgcolor: '#0D100E', p: { xs: 1, md: 1.5 } }}>
            <Typography variant="body2" sx={{ fontWeight: 780, mb: 1.2, display: { xs: 'none', md: 'block' } }}>Relationships</Typography>
            {['Partner lead', 'Investor intro', 'Community lead', 'Vendor'].map((name, index) => <Box key={name} sx={{ p: 1, borderRadius: 2, bgcolor: index === 0 ? 'rgba(208,255,79,.07)' : 'transparent', mb: .6 }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: .8 }}>
                <Avatar sx={{ width: 28, height: 28, fontSize: 10, bgcolor: index === 0 ? 'primary.main' : '#242A24', color: index === 0 ? 'primary.contrastText' : 'text.primary' }}>{name.slice(0, 1)}</Avatar>
                <Box sx={{ minWidth: 0, display: { xs: 'none', md: 'block' } }}><Typography variant="caption" sx={{ display: 'block', fontWeight: 720 }} noWrap>{name}</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>{index === 0 ? 'Can we discuss this week?' : 'Recent Telegram chat'}</Typography></Box>
              </Stack>
            </Box>)}
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Box sx={{ height: 58, borderBottom: 1, borderColor: 'divider', px: { xs: 1.2, md: 2 }, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: '#252B25' }}>P</Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="body2" sx={{ fontWeight: 760 }}>Partner lead</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>@partner · 6 mutual groups</Typography></Box>
              <IconButton size="small"><MoreHorizRoundedIcon fontSize="small" /></IconButton>
            </Box>
            <Stack sx={{ flex: 1, p: { xs: 1.2, md: 2 }, gap: 1 }}>
              <Paper variant="outlined" sx={{ p: 1.15, maxWidth: '78%', bgcolor: '#111412' }}><Typography variant="body2">Saw the partnership deck. Can we discuss this week?</Typography></Paper>
              <Paper variant="outlined" sx={{ p: 1.15, maxWidth: '78%', ml: 'auto', bgcolor: 'rgba(208,255,79,.06)', borderColor: 'rgba(208,255,79,.2)' }}><Typography variant="body2">Yes. I can do Thursday or Friday.</Typography></Paper>
              <motion.div initial={false} animate={{ opacity: messageSent ? 1 : 0, y: messageSent ? 0 : 8 }}>
                <Paper variant="outlined" sx={{ p: 1.15, maxWidth: '78%', ml: 'auto', bgcolor: 'rgba(208,255,79,.06)', borderColor: 'rgba(208,255,79,.2)' }}><Typography variant="body2">Friday works. I will send two time slots.</Typography></Paper>
              </motion.div>
            </Stack>
            <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
              <Paper variant="outlined" sx={{ px: 1.2, py: .8, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#0E110F' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>Message Partner lead…</Typography>
                <Pressable><IconButton size="small" color="primary" onClick={() => { setMessageSent(true); window.setTimeout(() => setMessageSent(false), 2800) }}><SendRoundedIcon fontSize="small" /></IconButton></Pressable>
              </Paper>
            </Box>
          </Box>

          <Box sx={{ display: { xs: 'none', md: 'block' }, borderLeft: 1, borderColor: 'divider', p: 1.8, bgcolor: '#0D100E' }}>
            <Typography variant="body2" sx={{ fontWeight: 780 }}>Relationship context</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: .45 }}>CRM state sits beside the Telegram peer.</Typography>
            <Divider sx={{ my: 1.6 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Pipeline</Typography>
            <Stack direction="row" sx={{ mt: .8, gap: .55, flexWrap: 'wrap' }}>{pipelineStages.map((stage, index) => <motion.div key={stage} animate={reduced ? undefined : { opacity: index <= pipelineStep ? 1 : .35, scale: index === pipelineStep ? 1.04 : 1 }}><Chip size="small" label={stage} variant={index === pipelineStep ? 'filled' : 'outlined'} color={index === pipelineStep ? 'primary' : 'default'} /></motion.div>)}</Stack>
            <Divider sx={{ my: 1.6 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Next action</Typography>
            <Typography variant="body2" sx={{ mt: .45, fontWeight: 700 }}>Send two call slots</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: .3 }}>Due Friday</Typography>
            <Divider sx={{ my: 1.6 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Tags</Typography>
            <Stack direction="row" sx={{ mt: .8, gap: .6, flexWrap: 'wrap' }}><Chip size="small" label="partner" variant="outlined" /><Chip size="small" label="high-priority" variant="outlined" /></Stack>
            <Divider sx={{ my: 1.6 }} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Notes</Typography>
            <Typography variant="body2" sx={{ mt: .45, color: 'text.secondary' }}>Interested in a partnership discussion. No commercial terms agreed yet.</Typography>
          </Box>
        </Box>
      </Paper>
    </motion.div>
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 24, x: 12 }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true }}
      transition={{ type: 'spring', stiffness: 220, damping: 24, delay: .25 }}
      style={{ position: 'absolute', right: -12, bottom: -22 }}
    >
      <Paper variant="outlined" sx={{ display: { xs: 'none', sm: 'block' }, p: 1.2, bgcolor: '#111412', borderColor: 'rgba(208,255,79,.24)', minWidth: 210 }}>
        <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}><Avatar sx={{ width: 30, height: 30, bgcolor: 'primary.main', color: 'primary.contrastText' }}><CheckRoundedIcon fontSize="small" /></Avatar><Box><Typography variant="caption" sx={{ display: 'block', fontWeight: 760 }}>CRM state saved</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>Tag, note, and next action updated</Typography></Box></Stack>
      </Paper>
    </motion.div>
  </Box>
}

function PipelineDemo() {
  const reduced = useReducedMotion()
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (reduced) return
    const timer = window.setInterval(() => setStage(current => (current + 1) % 4), 1500)
    return () => window.clearInterval(timer)
  }, [reduced])

  return <Paper variant="outlined" sx={{ p: 1.3, bgcolor: '#0D100E', overflow: 'hidden' }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px,1fr))', gap: .8, minWidth: 560 }}>
      {pipelineStages.map((name, index) => <Box key={name} sx={{ minHeight: 165, borderRadius: 2, p: .9, bgcolor: '#0A0C0B', border: 1, borderColor: 'divider' }}>
        <Typography variant="caption" sx={{ color: index === stage ? 'primary.main' : 'text.secondary', fontWeight: 730 }}>{name}</Typography>
        {index === stage ? <motion.div layoutId="pipeline-demo-card" transition={{ type: 'spring', stiffness: 300, damping: 28 }}><Paper variant="outlined" sx={{ mt: .8, p: 1.1, bgcolor: '#141814', borderColor: 'rgba(208,255,79,.2)' }}><Typography variant="body2" sx={{ fontWeight: 720 }}>Partnership</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>@partner</Typography></Paper></motion.div> : null}
      </Box>)}
    </Box>
  </Paper>
}

function NotesDemo() {
  const reduced = useReducedMotion()
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (reduced) return
    const timer = window.setInterval(() => {
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1200)
    }, 2600)
    return () => window.clearInterval(timer)
  }, [reduced])
  return <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#0D100E', height: '100%' }}>
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography variant="body2" sx={{ fontWeight: 760 }}>Notes and tags</Typography><motion.div animate={reduced ? undefined : { opacity: saved ? 1 : .35, scale: saved ? 1 : .92 }}><Stack direction="row" sx={{ alignItems: 'center', gap: .4 }}><CheckRoundedIcon color="primary" sx={{ fontSize: 15 }} /><Typography variant="caption" sx={{ color: saved ? 'primary.main' : 'text.secondary' }}>{saved ? 'Saved' : 'Autosave'}</Typography></Stack></motion.div></Stack>
    <Paper variant="outlined" sx={{ mt: 1.2, p: 1.2, minHeight: 104, bgcolor: '#0A0C0B' }}><Typography variant="body2" sx={{ color: 'text.secondary' }}>Warm introduction through a mutual group. Interested in partnership. Follow up after Friday call.</Typography></Paper>
    <Stack direction="row" sx={{ gap: .6, flexWrap: 'wrap', mt: 1.1 }}><Chip size="small" label="partner" /><Chip size="small" label="warm-intro" variant="outlined" /><Chip size="small" label="follow-up" variant="outlined" /></Stack>
  </Paper>
}

function ProfileDemo() {
  return <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#0D100E', height: '100%' }}>
    <Stack direction="row" sx={{ gap: 1.1, alignItems: 'center' }}><Avatar sx={{ bgcolor: '#262C26' }}>P</Avatar><Box><Typography variant="body2" sx={{ fontWeight: 760 }}>Partner lead</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>@partner · online recently</Typography></Box></Stack>
    <Divider sx={{ my: 1.4 }} />
    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Mutual groups</Typography>
    <Stack sx={{ gap: .7, mt: .8 }}>{['Builders group', 'Devcon planning', 'Partnerships'].map((group, index) => <motion.div key={group} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * .09 }}><Paper variant="outlined" sx={{ p: .8, display: 'flex', alignItems: 'center', gap: .8, bgcolor: '#0A0C0B' }}><Avatar sx={{ width: 24, height: 24, fontSize: 9, bgcolor: '#232823' }}>{group[0]}</Avatar><Typography variant="caption">{group}</Typography></Paper></motion.div>)}</Stack>
  </Paper>
}

export function LandingPage({ onConnect, connecting, backendReady, error }: LandingPageProps) {
  const reduced = useReducedMotion()
  const connectionText = useMemo(() => backendReady ? 'Telegram connection is ready.' : 'Checking the Telegram connection.', [backendReady])

  return <Box sx={{ minHeight: '100vh', bgcolor: '#080A09', overflow: 'hidden' }}>
    <ScrollProgress />
    <AppBar position="fixed" elevation={0} color="transparent" sx={{ backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(255,255,255,.06)', bgcolor: 'rgba(8,10,9,.76)' }}>
      <Toolbar sx={{ maxWidth: 1280, width: '100%', mx: 'auto', px: { xs: 2, sm: 3 }, minHeight: 68 }}>
        <Box sx={{ width: 31, height: 31, mr: 1.1 }}><BrandMark /></Box>
        <Typography sx={{ fontWeight: 820, letterSpacing: '-.02em', flex: 1 }}>Telegram CRM</Typography>
        <Button href="#product" color="inherit" sx={{ display: { xs: 'none', md: 'inline-flex' }, mr: .5 }}>Product</Button>
        <Button href="#workflow" color="inherit" sx={{ display: { xs: 'none', md: 'inline-flex' }, mr: 1 }}>Workflow</Button>
        <Pressable><Button variant="contained" onClick={onConnect} disabled={connecting}>{connecting ? 'Connecting' : 'Connect Telegram'}</Button></Pressable>
      </Toolbar>
      {connecting ? <LinearProgress /> : null}
    </AppBar>

    <Container maxWidth="lg" sx={{ pt: { xs: 15, md: 19 } }}>
      <Box sx={{ textAlign: 'center', maxWidth: 1030, mx: 'auto' }}>
        <motion.div initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .5 }}>
          <Typography component="h1" sx={{ fontSize: { xs: '3.25rem', sm: '4.6rem', md: '6.5rem' }, lineHeight: { xs: .98, md: .94 }, letterSpacing: '-.065em', fontWeight: 820, textWrap: 'balance' }}>Your Telegram has the relationships. Give them a CRM.</Typography>
        </motion.div>
        <motion.div initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .55, delay: .08 }}>
          <Typography sx={{ mt: 3, mx: 'auto', maxWidth: 760, color: '#A5ADA6', fontSize: { xs: '1rem', md: '1.2rem' }, lineHeight: 1.65 }}>Track conversations, people, notes, tasks, follow-ups, and opportunities from the Telegram account where the relationship already lives.</Typography>
        </motion.div>
        <motion.div initial={reduced ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .55, delay: .16 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'center', gap: 1.2, mt: 4 }}>
            <Pressable><Button size="large" variant="contained" endIcon={<ArrowForwardRoundedIcon />} onClick={onConnect} disabled={connecting}>{connecting ? 'Connecting to Telegram' : 'Connect Telegram'}</Button></Pressable>
            <Pressable><Button size="large" variant="outlined" href="#product">See the workflow</Button></Pressable>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'center', alignItems: 'center', gap: .8, mt: 2 }}><Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: backendReady ? 'primary.main' : 'warning.main', boxShadow: backendReady ? '0 0 16px rgba(208,255,79,.45)' : 'none' }} /><Typography variant="caption" sx={{ color: 'text.secondary' }}>{connectionText}</Typography></Stack>
          {error ? <Alert severity="error" sx={{ mt: 2.2, mx: 'auto', maxWidth: 620, textAlign: 'left' }}>{error}</Alert> : null}
        </motion.div>
      </Box>

      <Box sx={{ mt: { xs: 7, md: 10 }, pb: { xs: 11, md: 16 } }}>
        <motion.div initial={reduced ? false : { opacity: 0, y: 40, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reduced ? 0 : .8, delay: .2, ease: [0.2, 0.8, 0.2, 1] }}>
          <ProductWindow />
        </motion.div>
      </Box>
    </Container>

    <Box id="workflow" sx={{ borderTop: '1px solid rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.06)', bgcolor: '#0A0C0B' }}>
      <Container maxWidth="lg" sx={{ py: { xs: 9, md: 14 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,.82fr) minmax(420px,1.18fr)' }, gap: { xs: 4, md: 8 }, alignItems: 'center' }}>
          <Reveal>
            <Typography component="h2" sx={{ fontSize: { xs: '2.5rem', md: '4.5rem' }, lineHeight: .98, letterSpacing: '-.055em', fontWeight: 810 }}>A conversation should leave a clear next step.</Typography>
            <Typography sx={{ mt: 2, color: 'text.secondary', fontSize: { xs: '1rem', md: '1.08rem' }, lineHeight: 1.65, maxWidth: 570 }}>The CRM attaches structure to the Telegram peer. A message can become a profile update, a follow-up, a task, or an opportunity without copying the relationship into a separate system.</Typography>
          </Reveal>
          <Reveal delay={.08}><WorkflowStack /></Reveal>
        </Box>
      </Container>
    </Box>

    <Container maxWidth="lg" id="product" sx={{ py: { xs: 10, md: 15 } }}>
      <Reveal>
        <Typography component="h2" sx={{ fontSize: { xs: '2.7rem', md: '5rem' }, lineHeight: .96, letterSpacing: '-.06em', fontWeight: 810, maxWidth: 920 }}>Built around how relationship work actually happens.</Typography>
        <Typography sx={{ mt: 2, color: 'text.secondary', maxWidth: 720, fontSize: { xs: '1rem', md: '1.1rem' }, lineHeight: 1.7 }}>The inbox stays primary. Contacts, pipeline, tasks, notes, tags, profile context, and AI all refer back to the same Telegram identity.</Typography>
      </Reveal>

      <Box sx={{ mt: 6, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.15fr .85fr' }, gap: 1.4 }}>
        <Reveal><Box sx={{ overflow: 'hidden' }}><PipelineDemo /></Box></Reveal>
        <Reveal delay={.05}><NotesDemo /></Reveal>
        <Reveal delay={.08}><ProfileDemo /></Reveal>
        <Reveal delay={.12}>
          <Paper variant="outlined" sx={{ p: 2.2, bgcolor: '#0D100E', height: '100%', minHeight: 220 }}>
            <AutoAwesomeRoundedIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h2" sx={{ mt: 2 }}>Relationship briefs use the conversation you choose.</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.2, maxWidth: 470 }}>Load the messages, ask for a brief, review the summary, and apply a next action only if it is useful. AI does not silently rewrite CRM state.</Typography>
            <Stack direction="row" sx={{ gap: .7, mt: 2, flexWrap: 'wrap' }}><Chip size="small" label="What changed" variant="outlined" /><Chip size="small" label="Open questions" variant="outlined" /><Chip size="small" label="Next action" variant="outlined" /></Stack>
          </Paper>
        </Reveal>
      </Box>

      <Box sx={{ mt: { xs: 9, md: 13 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3,1fr)' }, borderTop: 1, borderLeft: { md: 1 }, borderColor: 'divider' }}>
        {features.map((feature, index) => <Reveal delay={Math.min(index * .035, .14)} key={feature.title}><Box sx={{ p: { xs: 2.5, md: 3 }, minHeight: 230, borderRight: 1, borderBottom: 1, borderColor: 'divider', bgcolor: index % 2 ? '#0A0C0B' : '#0B0D0C' }}><Box sx={{ color: 'primary.main' }}>{feature.icon}</Box><Typography variant="h2" sx={{ mt: 2 }}>{feature.title}</Typography><Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.1, lineHeight: 1.65 }}>{feature.copy}</Typography></Box></Reveal>)}
      </Box>
    </Container>

    <Box sx={{ borderTop: '1px solid rgba(255,255,255,.06)', bgcolor: '#0A0C0B' }}>
      <Container maxWidth="lg" sx={{ py: { xs: 9, md: 14 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr .85fr' }, gap: { xs: 4, md: 8 }, alignItems: 'center' }}>
          <Reveal>
            <Typography component="h2" sx={{ fontSize: { xs: '2.5rem', md: '4.2rem' }, lineHeight: .98, letterSpacing: '-.055em', fontWeight: 810 }}>The CRM should know the relationship without pretending to know more than it does.</Typography>
            <Typography sx={{ mt: 2, color: 'text.secondary', lineHeight: 1.7, maxWidth: 650 }}>Stages, values, notes, intent, and next actions appear only when you set them or explicitly apply an AI suggestion. Telegram stays the source of message history.</Typography>
          </Reveal>
          <Reveal delay={.08}>
            <Paper variant="outlined" sx={{ p: 2.4, bgcolor: '#0D100E' }}>
              {[
                ['Full message history', 'Loaded from Telegram on demand'],
                ['Notes and tags', 'Stored as CRM context'],
                ['Tasks and pipeline', 'Mapped to Telegram usernames'],
                ['AI relationship brief', 'Runs only when requested']
              ].map(([title, copy], index) => <Box key={title}><Stack direction="row" sx={{ alignItems: 'center', gap: 1.2, py: 1.3 }}><Avatar sx={{ width: 30, height: 30, bgcolor: 'rgba(208,255,79,.09)', color: 'primary.main' }}><CheckRoundedIcon fontSize="small" /></Avatar><Box><Typography variant="body2" sx={{ fontWeight: 750 }}>{title}</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>{copy}</Typography></Box></Stack>{index < 3 ? <Divider /> : null}</Box>)}
            </Paper>
          </Reveal>
        </Box>
      </Container>
    </Box>

    <Container maxWidth="md" sx={{ py: { xs: 11, md: 17 }, textAlign: 'center' }}>
      <Reveal>
        <Typography component="h2" sx={{ fontSize: { xs: '3rem', md: '5.6rem' }, lineHeight: .95, letterSpacing: '-.065em', fontWeight: 820 }}>Stop rebuilding your Telegram relationships in a spreadsheet.</Typography>
        <Typography sx={{ mt: 2.4, color: 'text.secondary', mx: 'auto', maxWidth: 680, fontSize: { xs: '1rem', md: '1.12rem' }, lineHeight: 1.65 }}>Connect Telegram and add CRM structure to the conversations you already use for partnerships, sales, community, fundraising, and follow-ups.</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'center', gap: 1.2, mt: 4 }}><Pressable><Button size="large" variant="contained" endIcon={<ArrowForwardRoundedIcon />} onClick={onConnect} disabled={connecting}>Connect Telegram</Button></Pressable><Pressable><Button size="large" variant="outlined" href="#product">Review the product</Button></Pressable></Stack>
      </Reveal>
    </Container>

    <Divider />
    <Container maxWidth="lg"><Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2, justifyContent: 'space-between', alignItems: { sm: 'center' }, py: 3 }}><Typography variant="body2" sx={{ color: 'text.secondary' }}>Independent client using the Telegram API. Not affiliated with Telegram.</Typography><Stack direction="row" sx={{ gap: .5 }}><Button size="small" href="/privacy.html" color="inherit">Privacy</Button><Button size="small" href="/terms.html" color="inherit">Terms</Button></Stack></Stack></Container>
  </Box>
}
