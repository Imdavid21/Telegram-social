import { useEffect, useState } from 'react'
import {
  Alert,
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  Fade,
  Grow,
  LinearProgress,
  Paper,
  Stack,
  Toolbar,
  Typography
} from '@mui/material'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import ForumRoundedIcon from '@mui/icons-material/ForumRounded'
import Groups2RoundedIcon from '@mui/icons-material/Groups2Rounded'
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import ViewKanbanRoundedIcon from '@mui/icons-material/ViewKanbanRounded'
import { BrandMark } from './BrandMark'

type LandingPageProps = {
  onConnect: () => void
  connecting: boolean
  backendReady: boolean
  error?: string
}

const benefits = [
  { icon: <ForumRoundedIcon />, title: 'Telegram becomes the work surface', copy: 'Read the conversation, reply, update CRM context, and schedule the next action without switching tools.' },
  { icon: <ViewKanbanRoundedIcon />, title: 'Pipeline stays connected to people', copy: 'Map opportunities to Telegram usernames and move work through a Trello-style board without losing the conversation.' },
  { icon: <TaskAltRoundedIcon />, title: 'Follow-ups become explicit', copy: 'Create tasks against Telegram contacts, see what is due, and clear work with immediate visual feedback.' },
  { icon: <AutoAwesomeRoundedIcon />, title: 'AI works from relationship history', copy: 'Generate grounded briefs from loaded messages, review the result, and apply suggestions only when you choose.' },
  { icon: <Groups2RoundedIcon />, title: 'Profiles include relationship context', copy: 'Open a contact to pull richer Telegram profile details and mutual groups alongside your private CRM notes.' },
  { icon: <ShieldRoundedIcon />, title: 'Telegram remains the source of truth', copy: 'CRM metadata sits beside Telegram instead of duplicating your messages into a second inbox database.' }
]

function ProductPreview() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setStep(current => (current + 1) % 4), 1800)
    return () => window.clearInterval(timer)
  }, [])

  const rows = [
    ['Kadar', 'Would love to discuss this week', 'Qualified'],
    ['LayerZero Labs', 'Deck viewed yesterday', 'Proposal'],
    ['Aarav Mehta', 'Interested in partnership', 'Lead']
  ]

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden', bgcolor: '#0D100E', borderColor: 'divider', boxShadow: '0 36px 100px rgba(0,0,0,.35)' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '250px minmax(0,1fr) 260px' }, minHeight: 470 }}>
        <Box sx={{ borderRight: { md: 1 }, borderBottom: { xs: 1, md: 0 }, borderColor: 'divider', p: 2 }}>
          <Typography variant="h3">Relationships</Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: .5,
              mb: 2
            }}>Needs attention</Typography>
          <Stack sx={{
            gap: .8
          }}>{rows.map(([name, copy, stage], index) => <Grow in timeout={250 + index * 120} key={name}>
            <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: index === 0 ? 'rgba(208,255,79,.08)' : 'transparent', border: '1px solid', borderColor: index === 0 ? 'rgba(208,255,79,.18)' : 'transparent' }}>
              <Stack
                direction="row"
                sx={{
                  justifyContent: "space-between",
                  gap: 1
                }}><Typography variant="body2" sx={{
                fontWeight: 700
              }}>{name}</Typography><Typography variant="caption" color={index === 0 ? 'primary.main' : 'text.secondary'}>{stage}</Typography></Stack>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: 'block',
                  mt: .4
                }}>{copy}</Typography>
            </Box>
          </Grow>)}</Stack>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Typography sx={{
            fontWeight: 750
          }}>Kadar</Typography><Typography variant="caption" sx={{
            color: "text.secondary"
          }}>@kadar</Typography></Box>
          <Stack
            sx={{
              gap: 1.2,
              p: 2.5,
              flex: 1
            }}>
            <Fade in timeout={350}><Paper variant="outlined" sx={{ alignSelf: 'flex-start', p: 1.4, maxWidth: '76%', bgcolor: 'background.paper' }}><Typography variant="body2">Saw the Devcon idea. What are you planning this year?</Typography></Paper></Fade>
            <Fade in timeout={650}><Paper variant="outlined" sx={{ alignSelf: 'flex-end', p: 1.4, maxWidth: '76%', bgcolor: 'rgba(208,255,79,.08)', borderColor: 'rgba(208,255,79,.22)' }}><Typography variant="body2">We are putting together a high-signal trader and builder activation.</Typography></Paper></Fade>
            <Fade in timeout={950}><Paper variant="outlined" sx={{ alignSelf: 'flex-start', p: 1.4, maxWidth: '76%', bgcolor: 'background.paper' }}><Typography variant="body2">Looks interesting. Would love to discuss this week.</Typography></Paper></Fade>
          </Stack>
          <Box sx={{ px: 2, pb: 2 }}><Paper variant="outlined" sx={{ p: 1.2, color: 'text.secondary' }}>Message Kadar…</Paper></Box>
        </Box>

        <Box sx={{ borderLeft: { md: 1 }, borderTop: { xs: 1, md: 0 }, borderColor: 'divider', p: 2 }}>
          <Typography variant="h3">Relationship context</Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: .7
            }}>CRM details stay attached to the Telegram peer.</Typography>
          <Divider sx={{ my: 2 }} />
          <Stack sx={{
            gap: 1.6
          }}>
            <Box><Typography variant="caption" sx={{
              color: "text.secondary"
            }}>Stage</Typography><Typography variant="body2" sx={{
              fontWeight: 700
            }}>Qualified</Typography></Box>
            <Box><Typography variant="caption" sx={{
              color: "text.secondary"
            }}>Next action</Typography><Typography variant="body2" sx={{
              fontWeight: 700
            }}>Offer two call slots</Typography></Box>
            <Box><Typography variant="caption" sx={{
              color: "text.secondary"
            }}>AI brief</Typography><Typography variant="body2">Strong sponsorship intent. No pricing objection yet.</Typography></Box>
          </Stack>
          <Box sx={{ mt: 3 }}>
            <LinearProgress variant="determinate" value={(step + 1) * 25} sx={{ height: 6, borderRadius: 99 }} />
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                display: 'block',
                mt: 1
              }}>{['Conversation loaded', 'Profile enriched', 'CRM context attached', 'Next action ready'][step]}</Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

export function LandingPage({ onConnect, connecting, backendReady, error }: LandingPageProps) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" elevation={0} color="transparent" sx={{ backdropFilter: 'blur(16px)', borderBottom: 1, borderColor: 'divider', bgcolor: 'rgba(11,13,12,.82)' }}>
        <Toolbar sx={{ maxWidth: 1240, width: '100%', mx: 'auto', gap: 1.5 }}>
          <Box sx={{ width: 32, height: 32 }}><BrandMark /></Box>
          <Typography
            sx={{
              fontWeight: 800,
              flex: 1
            }}>Telegram CRM</Typography>
          <Button href="#how-it-works" color="inherit" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>How it works</Button>
          <Button variant="contained" onClick={onConnect} disabled={connecting}>{connecting ? 'Connecting' : 'Connect Telegram'}</Button>
        </Toolbar>
        {connecting ? <LinearProgress /> : null}
      </AppBar>

      <Container maxWidth="lg">
        <Box sx={{ py: { xs: 8, md: 13 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr .95fr' }, gap: { xs: 5, md: 8 }, alignItems: 'center' }}>
          <Fade in timeout={450}>
            <Box>
              <Typography component="h1" variant="h1" sx={{ fontSize: { xs: '3rem', md: '5rem' }, maxWidth: 760 }}>A CRM built around your Telegram conversations.</Typography>
              <Typography sx={{ mt: 2.5, maxWidth: 680, fontSize: { xs: '1rem', md: '1.18rem' }, color: 'text.secondary', lineHeight: 1.65 }}>Turn Telegram relationships into a structured operating system for follow-ups, opportunities, tasks, notes, and relationship intelligence without moving the conversation into another tool.</Typography>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                sx={{
                  gap: 1.5,
                  mt: 4
                }}>
                <Button size="large" variant="contained" endIcon={<ArrowForwardRoundedIcon />} onClick={onConnect} disabled={connecting}>{connecting ? 'Connecting to Telegram' : 'Start with Telegram'}</Button>
                <Button size="large" variant="outlined" href="#product">See the product</Button>
              </Stack>
              {error ? <Alert severity="error" sx={{ mt: 2.5, maxWidth: 620 }}>{error}</Alert> : null}
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  mt: 2
                }}>{backendReady ? 'Telegram connection is ready.' : 'Telegram connection is being checked.'}</Typography>
            </Box>
          </Fade>

          <Grow in timeout={700}>
            <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'background.paper' }}>
              <Stack sx={{
                gap: 2.2
              }}>
                <Typography variant="h2">One relationship, one context.</Typography>
                {[
                  ['1', 'Open a Telegram contact'],
                  ['2', 'Load the full conversation and profile'],
                  ['3', 'Attach notes, tags, tasks, and opportunities'],
                  ['4', 'Use AI to understand what changed and what to do next']
                ].map(([number, copy], index) => <Fade in timeout={500 + index * 180} key={number}><Stack
                  direction="row"
                  sx={{
                    gap: 1.5,
                    alignItems: "center"
                  }}><Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: 'rgba(208,255,79,.1)', color: 'primary.main', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{number}</Box><Typography variant="body2">{copy}</Typography></Stack></Fade>)}
              </Stack>
            </Paper>
          </Grow>
        </Box>

        <Box id="product" sx={{ pb: { xs: 8, md: 13 } }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '3rem' }, mb: 1 }}>Conversation first, CRM second.</Typography>
          <Typography
            sx={{
              color: "text.secondary",
              mb: 4,
              maxWidth: 760
            }}>The inbox is where work starts. Pipeline, tasks, contacts, and AI are views over the same relationship context rather than disconnected modules.</Typography>
          <ProductPreview />
        </Box>

        <Box id="how-it-works" sx={{ py: { xs: 7, md: 11 }, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '2rem', md: '3rem' } }}>Built for people who already run business through Telegram.</Typography>
          <Typography
            sx={{
              color: "text.secondary",
              mt: 1,
              mb: 4,
              maxWidth: 760
            }}>The product removes the manual work between “we spoke on Telegram” and “the relationship is actually tracked.”</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3,1fr)' }, gap: 1.5 }}>
            {benefits.map((item, index) => <Grow in timeout={420 + index * 110} key={item.title}><Paper variant="outlined" sx={{ p: 2.5, minHeight: 190 }}><Box sx={{ color: 'primary.main', mb: 2 }}>{item.icon}</Box><Typography variant="h3">{item.title}</Typography><Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mt: 1
              }}>{item.copy}</Typography></Paper></Grow>)}
          </Box>
        </Box>

        <Box sx={{ py: { xs: 8, md: 12 }, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '2.2rem', md: '3.4rem' } }}>Your Telegram inbox already contains the CRM.</Typography>
          <Typography
            sx={{
              color: "text.secondary",
              mt: 1.5,
              mb: 3,
              mx: 'auto',
              maxWidth: 700
            }}>Connect the account you already use and turn conversations into a usable relationship system.</Typography>
          <Button size="large" variant="contained" endIcon={<ArrowForwardRoundedIcon />} onClick={onConnect} disabled={connecting}>Connect Telegram</Button>
        </Box>
      </Container>

      <Divider />
      <Container maxWidth="lg"><Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{
          gap: 2,
          justifyContent: "space-between",
          py: 3
        }}><Typography variant="body2" sx={{
        color: "text.secondary"
      }}>Independent client using the Telegram API. Not affiliated with Telegram.</Typography><Stack direction="row" sx={{
        gap: 2
      }}><Button size="small" href="/privacy.html" color="inherit">Privacy</Button><Button size="small" href="/terms.html" color="inherit">Terms</Button></Stack></Stack></Container>
    </Box>
  );
}
