import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Avatar, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Drawer, IconButton, InputAdornment, List, ListItemAvatar, ListItemButton, ListItemText, Paper, Snackbar, Stack, TextField, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded'
import PeopleOutlineRoundedIcon from '@mui/icons-material/PeopleOutlineRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import TodayRoundedIcon from '@mui/icons-material/TodayRounded'
import type { Channel, FeedItem, TelegramAccount } from './types'
import { authStatus, fetchCRMHistory, fetchCRMProfile, fetchFeed, logoutTelegram, sendCRMMessage, type CRMContactProfile } from './lib/api'
import { loadCRMState, updateCRMContact, type CRMContactState, type CRMState } from './crm/store'

type View = 'today' | 'people' | 'settings'
type Contact = { id: string; name: string; username?: string; avatar?: string; initials: string; unread: number; lastActivity: number; latest?: FeedItem; meta: CRMContactState }
type Attention = { contact: Contact; reason: string; detail: string; priority: number }
type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'info' }

const day = 86_400_000
const initials = (value: string) => value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'TG'

function relative(ts: number) {
  if (!ts) return 'No recent activity'
  const diff = Date.now() - ts * 1000
  if (diff < 60_000) return 'Now'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function preview(item?: FeedItem) {
  const text = String(item?.text || '').replace(/\s+/g, ' ').trim()
  if (text) return text.length > 92 ? `${text.slice(0, 90)}…` : text
  return item?.media ? `${item.media.kind} message` : 'No recent message'
}

function mergeMessages(rows: FeedItem[]) {
  const map = new Map<string, FeedItem>()
  rows.forEach(row => map.set(row.id, row))
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp || a.messageId - b.messageId)
}

function ContactAvatar({ contact, size = 40 }: { contact: Contact; size?: number }) {
  return <Avatar src={contact.avatar} sx={{ width: size, height: size, bgcolor: 'action.hover', fontSize: 12 }}>{contact.initials}</Avatar>
}

function attentionFor(contact: Contact): Attention | null {
  const now = Date.now()
  const dismissedUntil = contact.meta.dismissedUntil ? Date.parse(contact.meta.dismissedUntil) : 0
  if (dismissedUntil > now) return null
  const followUp = contact.meta.followUpAt ? Date.parse(contact.meta.followUpAt) : 0
  if (followUp && followUp <= now) return { contact, reason: 'Follow up now', detail: contact.meta.nextAction || 'You asked to return to this relationship.', priority: 400 + Math.floor((now - followUp) / day) }
  if (contact.unread > 0) return { contact, reason: contact.unread === 1 ? 'New message' : `${contact.unread} new messages`, detail: preview(contact.latest), priority: 300 + contact.unread }
  if (contact.meta.nextAction) return { contact, reason: 'Next step', detail: contact.meta.nextAction, priority: 200 }
  const age = contact.lastActivity ? now - contact.lastActivity * 1000 : 0
  if (age > 30 * day) return { contact, reason: 'Relationship is going quiet', detail: `Last contact ${relative(contact.lastActivity).toLowerCase()}.`, priority: 100 + Math.floor(age / day) }
  return null
}

export default function CRMApp() {
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const [view, setView] = useState<View>('today')
  const [account, setAccount] = useState<TelegramAccount | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [crmState, setCRMState] = useState<CRMState>(() => loadCRMState())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<FeedItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null)
  const [olderLoading, setOlderLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [profile, setProfile] = useState<CRMContactProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [mobileThread, setMobileThread] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUpDraft, setFollowUpDraft] = useState('')
  const [nextActionDraft, setNextActionDraft] = useState('')
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const threadRef = useRef<HTMLDivElement | null>(null)

  const notify = useCallback((message: string, severity: Toast['severity'] = 'success') => setToast({ open: true, message, severity }), [])
  const patchContact = useCallback((id: string, patch: Partial<CRMContactState>) => setCRMState(current => updateCRMContact(current, id, patch)), [])

  const loadTelegram = useCallback(async (initial = false) => {
    if (!initial) setRefreshing(true)
    try {
      const [status, page] = await Promise.all([authStatus(), fetchFeed(null, 180)])
      if (!status.connected) { location.href = '/'; return }
      setAccount(status.user || null)
      setChannels(page.channels)
      setFeed(page.feed)
      setError('')
    } catch (reason) { setError(String((reason as Error)?.message || 'Telegram could not be refreshed.')) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => {
    void loadTelegram(true)
    const timer = window.setInterval(() => void loadTelegram(false), 30_000)
    return () => window.clearInterval(timer)
  }, [loadTelegram])

  const contacts = useMemo<Contact[]>(() => {
    const last = new Map<string, FeedItem>()
    feed.forEach(item => { const current = last.get(item.channelId); if (!current || current.timestamp < item.timestamp) last.set(item.channelId, item) })
    return channels.filter(row => row.type === 'person' && !row.bot).map(row => ({
      id: row.id, name: row.title, username: row.username, avatar: row.avatar,
      initials: row.initials || initials(row.title), unread: Number(row.unread || 0),
      lastActivity: last.get(row.id)?.timestamp || 0, latest: last.get(row.id), meta: crmState[row.id] || { updatedAt: 0 }
    })).sort((a, b) => b.lastActivity - a.lastActivity)
  }, [channels, feed, crmState])

  const attention = useMemo(() => contacts.map(attentionFor).filter((row): row is Attention => Boolean(row)).sort((a, b) => b.priority - a.priority), [contacts])
  const filteredContacts = useMemo(() => { const needle = query.trim().toLowerCase(); return contacts.filter(row => !needle || `${row.name} ${row.username || ''} ${row.meta.company || ''}`.toLowerCase().includes(needle)) }, [contacts, query])
  const selected = contacts.find(row => row.id === selectedId) || null
  const selectedAttention = selected ? attentionFor(selected) : null

  const loadHistory = useCallback(async (sourceId: string) => {
    setHistoryLoading(true)
    try {
      const page = await fetchCRMHistory(sourceId, null, 80)
      setHistory(page.messages); setHistoryHasMore(page.hasMore); setNextBeforeId(page.nextBeforeId)
      requestAnimationFrame(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight })
    } catch (reason) { notify(String((reason as Error)?.message || 'This conversation could not be loaded.'), 'error'); setHistory([]) }
    finally { setHistoryLoading(false) }
  }, [notify])

  useEffect(() => {
    if (!selectedId) return
    const row = crmState[selectedId] || { updatedAt: 0 }
    setDraft(''); setNotesDraft(row.notes || ''); setNextActionDraft(row.nextAction || ''); setFollowUpDraft(row.followUpAt || ''); setProfile(null)
    void loadHistory(selectedId)
    setProfileLoading(true)
    void fetchCRMProfile(selectedId).then(result => setProfile(result.profile)).catch(() => setProfile(null)).finally(() => setProfileLoading(false))
  }, [selectedId, loadHistory])

  async function loadOlder() {
    if (!selected || !historyHasMore || !nextBeforeId || olderLoading) return
    setOlderLoading(true)
    const node = threadRef.current; const previousHeight = node?.scrollHeight || 0
    try {
      const page = await fetchCRMHistory(selected.id, nextBeforeId, 100)
      setHistory(current => mergeMessages([...page.messages, ...current])); setHistoryHasMore(page.hasMore); setNextBeforeId(page.nextBeforeId)
      requestAnimationFrame(() => { if (node) node.scrollTop = node.scrollHeight - previousHeight })
    } catch { notify('Older messages could not be loaded.', 'error') }
    finally { setOlderLoading(false) }
  }

  async function sendMessage() {
    const text = draft.trim()
    if (!selected || !text || sending) return
    const optimistic: FeedItem = { id: `optimistic:${Date.now()}`, messageId: -Date.now(), channelId: selected.id, timestamp: Math.floor(Date.now() / 1000), text, unread: false, saved: false, outgoing: true, reactions: [] }
    setDraft(''); setSending(true); setHistory(current => mergeMessages([...current, optimistic]))
    requestAnimationFrame(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight })
    try {
      const result = await sendCRMMessage(selected.id, text)
      setHistory(current => mergeMessages(current.filter(row => row.id !== optimistic.id).concat(result.message)))
      patchContact(selected.id, { dismissedUntil: new Date(Date.now() + 7 * day).toISOString() }); notify('Sent. This relationship is cleared for now.')
    } catch (reason) { setHistory(current => current.filter(row => row.id !== optimistic.id)); setDraft(text); notify(String((reason as Error)?.message || 'Message not sent.'), 'error') }
    finally { setSending(false) }
  }

  function openContact(id: string) { setSelectedId(id); if (mobile) setMobileThread(true) }
  function dismissSelected(days = 1) { if (!selected) return; patchContact(selected.id, { dismissedUntil: new Date(Date.now() + days * day).toISOString() }); notify(days === 1 ? 'Hidden until tomorrow.' : 'Marked done for now.'); if (mobile) setMobileThread(false) }
  function saveFollowUp() { if (!selected) return; patchContact(selected.id, { nextAction: nextActionDraft.trim() || undefined, followUpAt: followUpDraft || undefined, dismissedUntil: followUpDraft || undefined }); setFollowUpOpen(false); notify(followUpDraft ? 'Follow-up scheduled.' : 'Next step saved.') }
  async function logout() { await logoutTelegram().catch(() => {}); location.href = '/' }

  if (loading) return <Box sx={{ height: '100dvh', display: 'grid', placeItems: 'center' }}><Stack sx={{ alignItems: 'center', gap: 1.5 }}><CircularProgress size={24} /><Typography color="text.secondary">Checking your Telegram relationships</Typography></Stack></Box>

  const todayList = <Stack sx={{ height: '100%', minHeight: 0 }}><Box sx={{ px: 2.5, pt: 3, pb: 2 }}><Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}><Box sx={{ flex: 1 }}><Typography variant="h1">Today</Typography><Typography color="text.secondary" variant="body2" sx={{ mt: .5 }}>{attention.length ? `${attention.length} ${attention.length === 1 ? 'person needs' : 'people need'} attention` : 'Nothing needs your attention'}</Typography></Box><Tooltip title="Refresh"><IconButton aria-label="Refresh Telegram" onClick={() => void loadTelegram(false)} disabled={refreshing}><RefreshRoundedIcon className={refreshing ? 'spin' : ''} /></IconButton></Tooltip></Stack></Box>{error ? <Alert severity="error" sx={{ mx: 2, mb: 1 }} action={<Button color="inherit" onClick={() => void loadTelegram(false)}>Retry</Button>}>{error}</Alert> : null}<List disablePadding sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', px: 1 }}>{attention.length ? attention.map(({ contact, reason, detail }) => <ListItemButton key={contact.id} selected={selectedId === contact.id} onClick={() => openContact(contact.id)} sx={{ py: 1.5, mb: .5, alignItems: 'flex-start' }}><ListItemAvatar><ContactAvatar contact={contact} /></ListItemAvatar><ListItemText primary={<Stack direction="row" sx={{ gap: 1, alignItems: 'baseline' }}><Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }} noWrap>{contact.name}</Typography><Typography variant="caption" color="text.secondary">{relative(contact.lastActivity)}</Typography></Stack>} secondary={<Box sx={{ mt: .45 }}><Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700 }}>{reason}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .25 }} noWrap>{detail}</Typography></Box>} /></ListItemButton>) : <Box sx={{ px: 2, py: 7, textAlign: 'center' }}><CheckRoundedIcon sx={{ fontSize: 34, color: 'success.main' }} /><Typography variant="h2" sx={{ mt: 1.5 }}>You’re caught up</Typography><Typography color="text.secondary" variant="body2" sx={{ mt: .75 }}>New messages and scheduled follow-ups will appear here.</Typography></Box>}</List></Stack>

  const peopleList = <Stack sx={{ height: '100%', minHeight: 0 }}><Box sx={{ px: 2.5, pt: 3, pb: 2 }}><Typography variant="h1">People</Typography><TextField fullWidth placeholder="Search people" value={query} onChange={event => setQuery(event.target.value)} sx={{ mt: 2 }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }} /></Box><List disablePadding sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', px: 1 }}>{filteredContacts.map(contact => <ListItemButton key={contact.id} selected={selectedId === contact.id} onClick={() => openContact(contact.id)} sx={{ py: 1.1 }}><ListItemAvatar><ContactAvatar contact={contact} /></ListItemAvatar><ListItemText primary={contact.name} secondary={contact.username ? `@${contact.username}` : relative(contact.lastActivity)} /><Typography variant="caption" color="text.secondary">{contact.unread ? `${contact.unread} new` : relative(contact.lastActivity)}</Typography></ListItemButton>)}</List></Stack>

  const settings = <Box sx={{ p: { xs: 2.5, md: 4 }, maxWidth: 640, overflowY: 'auto', height: '100%', overscrollBehavior: 'contain', pb: { xs: 10, md: 4 } }}><Typography variant="h1">Settings</Typography><Typography color="text.secondary" sx={{ mt: .75 }}>Keep the essentials under your control.</Typography><Paper variant="outlined" sx={{ mt: 3, p: 2 }}><Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}><Avatar src={account?.avatar}>{initials(account?.firstName || 'TG')}</Avatar><Box sx={{ flex: 1 }}><Typography sx={{ fontWeight: 700 }}>{account?.firstName || 'Telegram account'}</Typography><Typography variant="body2" color="text.secondary">{account?.username ? `@${account.username}` : 'Connected securely'}</Typography></Box><Button color="error" onClick={() => void logout()}>Sign out</Button></Stack></Paper><Stack sx={{ mt: 3, gap: 2 }}><Box><Typography variant="h3">Privacy</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .6 }}>Telegram remains the source of truth. Relationship notes and follow-up state stay in this browser.</Typography></Box><Divider /><Box><Typography variant="h3">Appearance</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .6 }}>The interface uses a focused dark theme designed for long conversations.</Typography></Box></Stack></Box>

  const conversation = selected ? <Stack sx={{ height: '100%', minHeight: 0, overflow: 'hidden' }}><Stack direction="row" sx={{ flex: '0 0 auto', alignItems: 'center', gap: 1.2, px: 2, minHeight: 68, borderBottom: 1, borderColor: 'divider' }}>{mobile ? <IconButton aria-label="Back to list" onClick={() => setMobileThread(false)}><ArrowBackRoundedIcon /></IconButton> : null}<ContactAvatar contact={selected} /><Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontWeight: 700 }} noWrap>{selected.name}</Typography><Typography variant="caption" color="text.secondary" noWrap>{selectedAttention?.reason || (selected.username ? `@${selected.username}` : 'Telegram relationship')}</Typography></Box><Button size="small" startIcon={<ScheduleRoundedIcon />} onClick={() => setFollowUpOpen(true)}>Follow up</Button><IconButton aria-label="Relationship details" onClick={() => setDetailsOpen(true)}><MoreHorizRoundedIcon /></IconButton></Stack>{selectedAttention ? <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ flex: '0 0 auto', alignItems: { sm: 'center' }, gap: 1, px: 2, py: 1.25, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}><Box sx={{ flex: 1 }}><Typography variant="caption" sx={{ fontWeight: 800 }}>{selectedAttention.reason}</Typography><Typography variant="body2" color="text.secondary">{selectedAttention.detail}</Typography></Box><Stack direction="row" sx={{ gap: .75 }}><Button size="small" onClick={() => dismissSelected(1)}>Tomorrow</Button><Button size="small" variant="contained" onClick={() => dismissSelected(7)}>Done</Button></Stack></Stack> : null}<Box ref={threadRef} onScroll={event => { if (event.currentTarget.scrollTop < 80) void loadOlder() }} sx={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', px: { xs: 1.5, md: 3 }, py: 2 }}>{historyLoading ? <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}><Stack sx={{ alignItems: 'center', gap: 1 }}><CircularProgress size={22} /><Typography variant="body2" color="text.secondary">Loading conversation</Typography></Stack></Box> : <Stack sx={{ maxWidth: 760, mx: 'auto', gap: .75 }}>{historyHasMore ? <Button size="small" sx={{ alignSelf: 'center', mb: 1 }} onClick={() => void loadOlder()} disabled={olderLoading}>{olderLoading ? 'Loading…' : 'Load earlier messages'}</Button> : null}{history.map(item => <Paper key={item.id} variant="outlined" sx={{ alignSelf: item.outgoing ? 'flex-end' : 'flex-start', maxWidth: '78%', px: 1.4, py: 1, bgcolor: item.outgoing ? 'action.selected' : 'background.paper', borderColor: item.outgoing ? 'transparent' : 'divider' }}><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.text || `${item.media?.kind || 'Media'} message`}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .45, textAlign: 'right' }}>{relative(item.timestamp)}</Typography></Paper>)}{!history.length ? <Box sx={{ py: 8, textAlign: 'center' }}><Typography variant="h2">No messages loaded</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .6 }}>Start the conversation below.</Typography></Box> : null}</Stack>}</Box><Stack component="form" onSubmit={event => { event.preventDefault(); void sendMessage() }} direction="row" sx={{ flex: '0 0 auto', gap: 1, p: 1.5, borderTop: 1, borderColor: 'divider', bgcolor: 'background.default' }}><TextField fullWidth multiline maxRows={5} placeholder={`Message ${selected.name}`} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} /><IconButton type="submit" aria-label="Send message" disabled={!draft.trim() || sending} sx={{ alignSelf: 'flex-end', bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.main' } }}>{sending ? <CircularProgress size={20} color="inherit" /> : <SendRoundedIcon />}</IconButton></Stack></Stack> : <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 3, textAlign: 'center' }}><Box><TodayRoundedIcon sx={{ fontSize: 36, color: 'text.secondary' }} /><Typography variant="h2" sx={{ mt: 1.5 }}>Choose a relationship</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .6 }}>Open someone to see the context and take the next step.</Typography></Box></Box>

  const details = selected ? <Box sx={{ width: { xs: '92vw', sm: 390 }, p: 2.5, height: '100%', overflowY: 'auto', overscrollBehavior: 'contain' }}><Stack direction="row" sx={{ alignItems: 'center', gap: 1.2 }}><ContactAvatar contact={selected} size={48} /><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="h2" noWrap>{selected.name}</Typography><Typography variant="body2" color="text.secondary">{selected.username ? `@${selected.username}` : 'Telegram relationship'}</Typography></Box><IconButton aria-label="Close details" onClick={() => setDetailsOpen(false)}><CloseRoundedIcon /></IconButton></Stack><Divider sx={{ my: 2.5 }} /><Typography variant="h3">Next step</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .6 }}>{selected.meta.nextAction || 'No next step set.'}</Typography><Button size="small" sx={{ mt: 1 }} onClick={() => setFollowUpOpen(true)}>Set next step</Button><Divider sx={{ my: 2.5 }} /><Stack direction="row" sx={{ alignItems: 'center' }}><Typography variant="h3" sx={{ flex: 1 }}>Notes</Typography><Button size="small" onClick={() => { patchContact(selected.id, { notes: notesDraft.trim() || undefined }); notify('Notes saved.') }}>Save</Button></Stack><TextField fullWidth multiline minRows={5} value={notesDraft} onChange={event => setNotesDraft(event.target.value)} placeholder="Context worth remembering" sx={{ mt: 1 }} /><Divider sx={{ my: 2.5 }} /><Typography variant="h3">Telegram profile</Typography>{profileLoading ? <CircularProgress size={18} sx={{ mt: 1.5 }} /> : <Stack sx={{ mt: 1, gap: .7 }}><Typography variant="body2" color="text.secondary">{profile?.bio || 'No public bio available.'}</Typography>{profile?.status?.label ? <Typography variant="body2">{profile.status.label}</Typography> : null}{profile?.commonChatsCount ? <Typography variant="body2">{profile.commonChatsCount} mutual groups</Typography> : null}</Stack>}</Box> : null

  return <Box sx={{ height: '100dvh', width: '100%', overflow: 'hidden', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '72px minmax(280px, 360px) minmax(0, 1fr)' }, bgcolor: 'background.default' }}><Stack component="nav" aria-label="Primary" sx={{ display: { xs: mobileThread ? 'none' : 'flex', md: 'flex' }, position: { xs: 'fixed', md: 'static' }, zIndex: 10, left: 0, right: 0, bottom: 0, height: { xs: 64, md: '100%' }, flexDirection: { xs: 'row', md: 'column' }, alignItems: 'center', justifyContent: { xs: 'space-around', md: 'flex-start' }, gap: { md: 1 }, py: { md: 2 }, borderRight: { md: 1 }, borderTop: { xs: 1, md: 0 }, borderColor: 'divider', bgcolor: 'background.paper' }}>{[{ id: 'today' as View, label: 'Today', icon: <TodayRoundedIcon /> }, { id: 'people' as View, label: 'People', icon: <PeopleOutlineRoundedIcon /> }, { id: 'settings' as View, label: 'Settings', icon: <SettingsOutlinedIcon /> }].map(item => <Tooltip key={item.id} title={item.label} placement="right"><IconButton aria-label={item.label} onClick={() => { setView(item.id); setMobileThread(false) }} sx={{ width: 44, height: 44, color: view === item.id ? 'primary.main' : 'text.secondary', bgcolor: view === item.id ? 'action.selected' : 'transparent' }}>{item.icon}</IconButton></Tooltip>)}</Stack><Box sx={{ display: { xs: mobileThread || view === 'settings' ? 'none' : 'block', md: view === 'settings' ? 'none' : 'block' }, height: '100%', minHeight: 0, overflow: 'hidden', borderRight: 1, borderColor: 'divider', pb: { xs: 8, md: 0 } }}>{view === 'people' ? peopleList : todayList}</Box><Box component="main" sx={{ gridColumn: { md: view === 'settings' ? '2 / 4' : 'auto' }, display: { xs: mobileThread || view === 'settings' ? 'block' : 'none', md: 'block' }, height: '100%', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>{view === 'settings' ? settings : conversation}</Box><Drawer anchor="right" open={detailsOpen} onClose={() => setDetailsOpen(false)}>{details}</Drawer><Dialog open={followUpOpen} onClose={() => setFollowUpOpen(false)} fullWidth maxWidth="xs"><DialogTitle>Set the next step</DialogTitle><DialogContent><Stack sx={{ gap: 2, pt: .5 }}><TextField autoFocus label="What should happen next?" value={nextActionDraft} onChange={event => setNextActionDraft(event.target.value)} placeholder="Send the proposal" /><TextField type="datetime-local" label="When?" value={followUpDraft} onChange={event => setFollowUpDraft(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} helperText="Leave empty to keep it visible in Today." /></Stack></DialogContent><DialogActions><Button onClick={() => setFollowUpOpen(false)}>Cancel</Button><Button variant="contained" onClick={saveFollowUp} disabled={!nextActionDraft.trim() && !followUpDraft}>Save</Button></DialogActions></Dialog><Snackbar open={toast.open} autoHideDuration={2400} onClose={() => setToast(current => ({ ...current, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity={toast.severity} variant="filled">{toast.message}</Alert></Snackbar></Box>
}
