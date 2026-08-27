import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Avatar,
  Badge,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import ForumRoundedIcon from '@mui/icons-material/ForumRounded'
import HubRoundedIcon from '@mui/icons-material/HubRounded'
import InboxRoundedIcon from '@mui/icons-material/InboxRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import ViewKanbanRoundedIcon from '@mui/icons-material/ViewKanbanRounded'
import type { Channel, FeedItem, TelegramAccount } from './types'
import { authStatus, fetchCRMHistory, fetchCRMProfile, fetchFeed, logoutTelegram, sendCRMMessage, type CRMContactProfile } from './lib/api'
import { loadCRMState, updateCRMContact, type CRMContactState, type CRMStage, type CRMState } from './crm/store'
import { createTask, loadTasks, saveTasks, type CRMTask } from './crm/tasks'
import { createOpportunity, loadOpportunities, PIPELINE_STAGES, saveOpportunities, type CRMOpportunity, type PipelineStage } from './crm/opportunities'
import { NetworkCRMView } from './components/NetworkCRMView'

type View = 'inbox' | 'network' | 'pipeline' | 'tasks' | 'settings'
type Contact = {
  id: string
  name: string
  username?: string
  avatar?: string
  initials: string
  unread: number
  lastActivity: number
  latest?: FeedItem
  meta: CRMContactState
}
type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'warning' | 'info' }
type TaskDraft = Partial<CRMTask>
type OpportunityDraft = Partial<CRMOpportunity>

const CRM_STAGES: CRMStage[] = ['Lead', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost']
const TAGS = ['partner', 'sponsor', 'investor', 'lead', 'customer', 'community', 'vendor', 'high-priority']

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'TG'
}

function relative(ts: number) {
  if (!ts) return ''
  const diff = Date.now() - ts * 1000
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function preview(item?: FeedItem) {
  const text = String(item?.text || '').replace(/\s+/g, ' ').trim()
  if (text) return text.length > 62 ? `${text.slice(0, 60)}…` : text
  return item?.media ? `[${item.media.kind}]` : 'No recent message'
}

function mergeMessages(rows: FeedItem[]) {
  const map = new Map<string, FeedItem>()
  rows.forEach(row => map.set(row.id, row))
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp || a.messageId - b.messageId)
}

function ContactAvatar({ contact, size = 38 }: { contact: Contact; size?: number }) {
  return <Avatar src={contact.avatar} sx={{ width: size, height: size, bgcolor: 'action.hover', fontSize: size < 42 ? 12 : 14 }}>{contact.initials}</Avatar>
}

export default function CRMApp() {
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const [view, setView] = useState<View>('inbox')
  const [account, setAccount] = useState<TelegramAccount | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [crmState, setCRMState] = useState<CRMState>(() => loadCRMState())
  const [tasks, setTasks] = useState<CRMTask[]>(() => loadTasks())
  const [opportunities, setOpportunities] = useState<CRMOpportunity[]>(() => loadOpportunities())
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
  const [detailOpen, setDetailOpen] = useState(false)
  const [mobileThread, setMobileThread] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskDraft, setTaskDraft] = useState<TaskDraft>({})
  const [opportunityOpen, setOpportunityOpen] = useState(false)
  const [opportunityDraft, setOpportunityDraft] = useState<OpportunityDraft>({ stage: 'Lead' })
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const threadRef = useRef<HTMLDivElement | null>(null)
  const dragId = useRef<string | null>(null)

  const notify = useCallback((message: string, severity: Toast['severity'] = 'success') => setToast({ open: true, message, severity }), [])

  const loadTelegram = useCallback(async (initial = false) => {
    if (!initial) setRefreshing(true)
    try {
      const [status, page] = await Promise.all([authStatus(), fetchFeed(null, 180)])
      if (!status.connected) { location.href = '/'; return }
      setAccount(status.user || null)
      setChannels(page.channels)
      setFeed(page.feed)
      setSelectedId(current => current || page.channels.find(row => row.type === 'person' && !row.bot)?.id || null)
      setError('')
    } catch (reason) {
      setError(String((reason as Error)?.message || 'Could not refresh Telegram.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadTelegram(true)
    const timer = window.setInterval(() => void loadTelegram(false), 20_000)
    return () => window.clearInterval(timer)
  }, [loadTelegram])

  const contacts = useMemo<Contact[]>(() => {
    const last = new Map<string, FeedItem>()
    feed.forEach(item => {
      const current = last.get(item.channelId)
      if (!current || current.timestamp < item.timestamp) last.set(item.channelId, item)
    })
    return channels.filter(row => row.type === 'person' && !row.bot).map(row => ({
      id: row.id,
      name: row.title,
      username: row.username,
      avatar: row.avatar,
      initials: row.initials || initials(row.title),
      unread: Number(row.unread || 0),
      lastActivity: last.get(row.id)?.timestamp || 0,
      latest: last.get(row.id),
      meta: crmState[row.id] || { updatedAt: 0 }
    })).sort((a, b) => b.lastActivity - a.lastActivity)
  }, [channels, feed, crmState])

  const selected = contacts.find(row => row.id === selectedId) || null
  const filteredContacts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return contacts.filter(row => !needle || `${row.name} ${row.username || ''} ${row.meta.company || ''} ${(row.meta.tags || []).join(' ')}`.toLowerCase().includes(needle))
  }, [contacts, query])

  const patchContact = useCallback((id: string, patch: Partial<CRMContactState>) => setCRMState(current => updateCRMContact(current, id, patch)), [])

  const loadHistory = useCallback(async (sourceId: string) => {
    setHistoryLoading(true)
    try {
      const page = await fetchCRMHistory(sourceId, null, 80)
      setHistory(page.messages)
      setHistoryHasMore(page.hasMore)
      setNextBeforeId(page.nextBeforeId)
      requestAnimationFrame(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight })
    } catch (reason) {
      setError(String((reason as Error)?.message || 'Could not load conversation history.'))
      setHistory([])
    } finally { setHistoryLoading(false) }
  }, [])

  const loadProfile = useCallback(async (sourceId: string) => {
    setProfileLoading(true)
    try { setProfile((await fetchCRMProfile(sourceId)).profile) }
    catch { setProfile(null) }
    finally { setProfileLoading(false) }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setDraft('')
    setHistory([])
    setNotesDraft(crmState[selectedId]?.notes || '')
    void loadHistory(selectedId)
    void loadProfile(selectedId)
  }, [selectedId, loadHistory, loadProfile])

  useEffect(() => {
    if (!selectedId) return
    const stored = crmState[selectedId]?.notes || ''
    if (stored === notesDraft) return
    setNotesSaving(true)
    const timer = window.setTimeout(() => {
      patchContact(selectedId, { notes: notesDraft.trim() || undefined })
      setNotesSaving(false)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [notesDraft, selectedId, crmState, patchContact])

  async function loadOlder() {
    if (!selected || !historyHasMore || !nextBeforeId || olderLoading) return
    setOlderLoading(true)
    const node = threadRef.current
    const height = node?.scrollHeight || 0
    try {
      const page = await fetchCRMHistory(selected.id, nextBeforeId, 100)
      setHistory(current => mergeMessages([...page.messages, ...current]))
      setHistoryHasMore(page.hasMore)
      setNextBeforeId(page.nextBeforeId)
      requestAnimationFrame(() => { if (node) node.scrollTop = node.scrollHeight - height })
    } catch (reason) { notify(String((reason as Error)?.message || 'Could not load older messages.'), 'error') }
    finally { setOlderLoading(false) }
  }

  async function sendMessage() {
    const text = draft.trim()
    if (!selected || !text || sending) return
    const optimistic: FeedItem = { id: `optimistic:${Date.now()}`, messageId: -Date.now(), channelId: selected.id, timestamp: Math.floor(Date.now() / 1000), text, unread: false, saved: false, outgoing: true, reactions: [] }
    setDraft('')
    setSending(true)
    setHistory(current => mergeMessages([...current, optimistic]))
    requestAnimationFrame(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight })
    try {
      const result = await sendCRMMessage(selected.id, text)
      setHistory(current => mergeMessages(current.filter(row => row.id !== optimistic.id).concat(result.message)))
    } catch (reason) {
      setHistory(current => current.filter(row => row.id !== optimistic.id))
      setDraft(text)
      notify(String((reason as Error)?.message || 'Could not send message.'), 'error')
    } finally { setSending(false) }
  }

  function openContactBySource(sourceId: string) {
    setSelectedId(sourceId)
    setView('inbox')
    if (mobile) setMobileThread(true)
  }

  function openTask(task?: CRMTask, contact?: Contact) {
    setTaskDraft(task ? { ...task } : { contactId: contact?.id, username: contact?.username })
    setTaskOpen(true)
  }

  function saveTask() {
    const title = String(taskDraft.title || '').trim()
    if (!title) return
    const next = taskDraft.id ? tasks.map(row => row.id === taskDraft.id ? { ...row, ...taskDraft, title, updatedAt: Date.now() } as CRMTask : row) : [...tasks, createTask({ title, contactId: taskDraft.contactId, username: taskDraft.username, dueAt: taskDraft.dueAt })]
    setTasks(next); saveTasks(next); setTaskOpen(false); notify('Task saved')
  }

  function deleteTask(id: string) {
    const next = tasks.filter(row => row.id !== id)
    setTasks(next); saveTasks(next); setTaskOpen(false); notify('Task deleted')
  }

  function toggleTask(task: CRMTask) {
    const next = tasks.map(row => row.id === task.id ? { ...row, completed: !row.completed, updatedAt: Date.now() } : row)
    setTasks(next); saveTasks(next)
  }

  function openOpportunity(row?: CRMOpportunity, stage: PipelineStage = 'Lead', contact?: Contact) {
    setOpportunityDraft(row ? { ...row } : { stage, contactId: contact?.id, username: contact?.username, company: contact?.meta.company })
    setOpportunityOpen(true)
  }

  function saveOpportunity() {
    const title = String(opportunityDraft.title || '').trim()
    if (!title) return
    const next = opportunityDraft.id ? opportunities.map(row => row.id === opportunityDraft.id ? { ...row, ...opportunityDraft, title, stage: (opportunityDraft.stage || 'Lead') as PipelineStage, updatedAt: Date.now() } as CRMOpportunity : row) : [...opportunities, createOpportunity({ ...opportunityDraft, title })]
    setOpportunities(next); saveOpportunities(next); setOpportunityOpen(false); notify('Opportunity saved')
  }

  function deleteOpportunity(id: string) {
    const next = opportunities.filter(row => row.id !== id)
    setOpportunities(next); saveOpportunities(next); setOpportunityOpen(false); notify('Opportunity deleted')
  }

  function moveOpportunity(id: string, stage: PipelineStage) {
    const next = opportunities.map(row => row.id === id ? { ...row, stage, updatedAt: Date.now() } : row)
    setOpportunities(next); saveOpportunities(next)
  }

  async function logout() {
    await logoutTelegram().catch(() => {})
    location.href = '/'
  }

  const tagOptions = useMemo(() => [...new Set([...TAGS, ...contacts.flatMap(row => row.meta.tags || [])])].sort(), [contacts])
  const nav = [
    { id: 'inbox' as View, label: 'Inbox', icon: <InboxRoundedIcon />, badge: contacts.reduce((sum, row) => sum + row.unread, 0) },
    { id: 'network' as View, label: 'Network', icon: <HubRoundedIcon /> },
    { id: 'pipeline' as View, label: 'Pipeline', icon: <ViewKanbanRoundedIcon /> },
    { id: 'tasks' as View, label: 'Tasks', icon: <TaskAltRoundedIcon /> },
    { id: 'settings' as View, label: 'Settings', icon: <SettingsRoundedIcon /> }
  ]

  if (loading) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress size={24} /></Box>

  const details = selected ? <Box sx={{ width: { xs: '92vw', sm: 390 }, p: 2.5 }}>
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1.2 }}><ContactAvatar contact={selected} size={48} /><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="h2" noWrap>{selected.name}</Typography><Typography variant="body2" sx={{ color: 'text.secondary' }}>{selected.username ? `@${selected.username}` : `Telegram ID ${selected.id.replace(/^user:/, '')}`}</Typography></Box><IconButton onClick={() => setDetailOpen(false)}><CloseRoundedIcon /></IconButton></Stack>
    <Divider sx={{ my: 2 }} />
    <Stack sx={{ gap: 1.25 }}>
      <FormControl size="small" fullWidth><Select displayEmpty value={selected.meta.stage || ''} onChange={event => patchContact(selected.id, { stage: (event.target.value || undefined) as CRMStage | undefined })}><MenuItem value=""><em>No pipeline stage</em></MenuItem>{CRM_STAGES.map(stage => <MenuItem key={stage} value={stage}>{stage}</MenuItem>)}</Select></FormControl>
      <TextField label="Company" value={selected.meta.company || ''} onChange={event => patchContact(selected.id, { company: event.target.value || undefined })} />
      <TextField label="Next action" value={selected.meta.nextAction || ''} onChange={event => patchContact(selected.id, { nextAction: event.target.value || undefined })} />
      <TextField type="datetime-local" label="Follow up" value={selected.meta.followUpAt || ''} onChange={event => patchContact(selected.id, { followUpAt: event.target.value || undefined })} slotProps={{ inputLabel: { shrink: true } }} />
      <Autocomplete multiple freeSolo options={tagOptions} value={selected.meta.tags || []} onChange={(_, value) => patchContact(selected.id, { tags: value as string[] })} renderInput={params => <TextField {...params} label="Tags" placeholder="Add tag" />} />
      <Box><Stack direction="row" sx={{ justifyContent: 'space-between', mb: .6 }}><Typography variant="body2" sx={{ color: 'text.secondary' }}>Notes</Typography>{notesSaving ? <Typography variant="caption" sx={{ color: 'text.secondary' }}>Saving…</Typography> : <CheckRoundedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}</Stack><TextField fullWidth multiline minRows={4} value={notesDraft} onChange={event => setNotesDraft(event.target.value)} /></Box>
    </Stack>
    <Divider sx={{ my: 2 }} />
    <Typography variant="h3">Telegram profile</Typography>
    {profileLoading ? <CircularProgress size={18} sx={{ mt: 1.5 }} /> : profile ? <Stack sx={{ mt: 1.2, gap: .75 }}><Typography variant="body2" sx={{ color: 'text.secondary' }}>{profile.bio || 'No public bio'}</Typography><Typography variant="body2">{profile.status.label}{profile.status.lastSeenAt ? ` · ${new Date(profile.status.lastSeenAt).toLocaleString()}` : ''}</Typography><Typography variant="body2">Mutual groups · {profile.commonChatsCount}</Typography>{profile.mutualGroups.slice(0, 8).map(group => <Stack key={group.id} direction="row" sx={{ alignItems: 'center', gap: 1 }}><Avatar src={group.avatar} sx={{ width: 26, height: 26, fontSize: 10 }}>{group.initials}</Avatar><Typography variant="body2" noWrap>{group.title}</Typography></Stack>)}</Stack> : <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>Profile details were not returned by Telegram.</Typography>}
    <Divider sx={{ my: 2 }} />
    <Stack direction="row" sx={{ gap: 1 }}><Button fullWidth variant="outlined" onClick={() => openTask(undefined, selected)} startIcon={<TaskAltRoundedIcon />}>Task</Button><Button fullWidth variant="outlined" onClick={() => openOpportunity(undefined, 'Lead', selected)} startIcon={<ViewKanbanRoundedIcon />}>Opportunity</Button></Stack>
  </Box> : null

  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex' }}>
    <Box component="nav" sx={{ width: 68, flexShrink: 0, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', alignItems: 'center', borderRight: 1, borderColor: 'divider', py: 1.5, position: 'sticky', top: 0, height: '100vh' }}>
      <Avatar sx={{ width: 38, height: 38, bgcolor: 'text.primary', color: 'background.default', fontSize: 12, fontWeight: 800, mb: 1.5 }}>TG</Avatar>
      <Stack sx={{ gap: .5 }}>{nav.map(item => <Tooltip title={item.label} placement="right" key={item.id}><IconButton onClick={() => setView(item.id)} sx={{ width: 44, height: 44, color: view === item.id ? 'text.primary' : 'text.secondary', bgcolor: view === item.id ? 'action.selected' : 'transparent' }}><Badge badgeContent={item.badge || 0} color="error" max={99}>{item.icon}</Badge></IconButton></Tooltip>)}</Stack>
      <Box sx={{ flex: 1 }} />
      <Tooltip title={account?.username ? `@${account.username}` : account?.firstName || 'Telegram'} placement="right"><Avatar src={account?.avatar} sx={{ width: 34, height: 34 }}>{initials(account?.firstName || 'TG')}</Avatar></Tooltip>
    </Box>

    <Box component="main" sx={{ flex: 1, minWidth: 0, pb: { xs: 8, md: 0 } }}>
      {refreshing ? <LinearProgress sx={{ position: 'fixed', top: 0, left: { xs: 0, md: 68 }, right: 0, zIndex: 1500, height: 2 }} /> : null}
      {error ? <Alert severity="error" sx={{ borderRadius: 0 }} action={<IconButton size="small" onClick={() => setError('')}><CloseRoundedIcon fontSize="small" /></IconButton>}>{error}</Alert> : null}

      {view === 'inbox' ? <Box sx={{ height: { xs: 'calc(100vh - 64px)', md: '100vh' }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px minmax(0,1fr)' } }}>
        <Box sx={{ display: { xs: mobileThread ? 'none' : 'block', md: 'block' }, borderRight: 1, borderColor: 'divider', overflow: 'hidden' }}>
          <Box sx={{ p: 2 }}><Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}><Typography variant="h1">Inbox</Typography><IconButton onClick={() => void loadTelegram(false)}><RefreshRoundedIcon fontSize="small" /></IconButton></Stack><TextField fullWidth sx={{ mt: 1.5 }} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search" slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }} /></Box>
          <List disablePadding sx={{ height: 'calc(100% - 92px)', overflow: 'auto' }}>{filteredContacts.map(contact => <ListItemButton key={contact.id} selected={selectedId === contact.id} onClick={() => openContactBySource(contact.id)} sx={{ py: 1.15, px: 1.5 }}><ListItemAvatar sx={{ minWidth: 48 }}><ContactAvatar contact={contact} /></ListItemAvatar><ListItemText primary={<Typography variant="body2" noWrap sx={{ fontWeight: 650 }}>{contact.name}</Typography>} secondary={<Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block', mt: .25 }}>{preview(contact.latest)}</Typography>} /><Stack sx={{ alignItems: 'flex-end', gap: .5 }}><Typography variant="caption" sx={{ color: 'text.secondary' }}>{relative(contact.lastActivity)}</Typography>{contact.unread ? <Badge badgeContent={contact.unread} color="error" max={99} /> : null}</Stack></ListItemButton>)}</List>
        </Box>

        <Box sx={{ display: { xs: mobileThread ? 'flex' : 'none', md: 'flex' }, flexDirection: 'column', minWidth: 0 }}>
          {selected ? <><Toolbar sx={{ minHeight: 62, borderBottom: 1, borderColor: 'divider', px: 1.5, gap: 1 }}>{mobile ? <IconButton onClick={() => setMobileThread(false)}><ArrowBackRoundedIcon /></IconButton> : null}<ContactAvatar contact={selected} /><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" noWrap sx={{ fontWeight: 650 }}>{selected.name}</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>{selected.username ? `@${selected.username}` : 'Telegram contact'}</Typography></Box><IconButton onClick={() => setDetailOpen(true)}><MoreHorizRoundedIcon /></IconButton></Toolbar>
            <Box ref={threadRef} onScroll={event => { if (event.currentTarget.scrollTop < 70) void loadOlder() }} sx={{ flex: 1, overflow: 'auto', px: { xs: 1.5, md: 3 }, py: 2 }}>{historyLoading ? <Box sx={{ display: 'grid', placeItems: 'center', pt: 8 }}><CircularProgress size={22} /></Box> : <Stack sx={{ gap: .8, maxWidth: 860, mx: 'auto' }}>{historyHasMore ? <Button size="small" onClick={() => void loadOlder()} disabled={olderLoading} sx={{ alignSelf: 'center', mb: 1 }}>{olderLoading ? 'Loading…' : 'Load older'}</Button> : null}{history.map(item => <Box key={item.id} sx={{ maxWidth: '76%', alignSelf: item.outgoing ? 'flex-end' : 'flex-start', bgcolor: item.outgoing ? 'action.selected' : 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2.5, px: 1.4, py: 1, opacity: item.id.startsWith('optimistic:') ? .55 : 1 }}><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{item.text || `[${item.media?.kind || 'message'}]`}</Typography><Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: .35, textAlign: 'right' }}>{relative(item.timestamp)}</Typography></Box>)}</Stack>}</Box>
            <Box sx={{ borderTop: 1, borderColor: 'divider', p: 1.25 }}><Stack direction="row" sx={{ gap: 1, maxWidth: 900, mx: 'auto', alignItems: 'flex-end' }}><TextField fullWidth multiline maxRows={5} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} placeholder={`Message ${selected.name}`} /><IconButton onClick={() => void sendMessage()} disabled={!draft.trim() || sending} sx={{ width: 42, height: 42, bgcolor: draft.trim() ? 'text.primary' : 'action.hover', color: draft.trim() ? 'background.default' : 'text.secondary' }}>{sending ? <CircularProgress size={18} color="inherit" /> : <SendRoundedIcon />}</IconButton></Stack></Box>
          </> : <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}><Box><ForumRoundedIcon sx={{ color: 'text.disabled', fontSize: 34 }} /><Typography variant="h2" sx={{ mt: 1 }}>Choose a conversation</Typography></Box></Box>}
        </Box>
      </Box> : null}

      {view === 'network' ? <NetworkCRMView onOpenContact={openContactBySource} /> : null}

      {view === 'pipeline' ? <Box sx={{ p: { xs: 2, md: 3 } }}><Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { sm: 'flex-end' }, justifyContent: 'space-between', gap: 2 }}><Box><Typography variant="h1">Pipeline</Typography><Typography sx={{ color: 'text.secondary', mt: .6 }}>A simple board tied back to Telegram people.</Typography></Box><Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => openOpportunity()}>Add</Button></Stack><Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, minmax(220px, 1fr))`, gap: 1, overflowX: 'auto', pb: 2 }}>{PIPELINE_STAGES.map(stage => { const stageRows = opportunities.filter(row => row.stage === stage); return <Box key={stage} onDragOver={event => event.preventDefault()} onDrop={() => { if (dragId.current) moveOpportunity(dragId.current, stage); dragId.current = null }} sx={{ minHeight: 480, borderTop: 1, borderColor: 'divider', pt: 1.2 }}><Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}><Typography variant="body2" sx={{ fontWeight: 650 }}>{stage} <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>{stageRows.length}</Typography></Typography><IconButton size="small" onClick={() => openOpportunity(undefined, stage)}><AddRoundedIcon fontSize="small" /></IconButton></Stack><Stack sx={{ gap: .8 }}>{stageRows.map(row => <Paper key={row.id} draggable onDragStart={() => { dragId.current = row.id }} elevation={0} sx={{ p: 1.3, border: 1, borderColor: 'divider', cursor: 'grab' }}><Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}><Box sx={{ minWidth: 0 }}><Typography variant="body2" sx={{ fontWeight: 650 }}>{row.title}</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>{row.username ? `@${row.username}` : row.company || 'Unmapped'}</Typography></Box><IconButton size="small" onClick={() => openOpportunity(row)}><EditRoundedIcon fontSize="small" /></IconButton></Stack>{row.value !== undefined ? <Typography variant="body2" sx={{ mt: 1 }}>{new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(row.value)}</Typography> : null}</Paper>)}</Stack></Box> })}</Box></Box> : null}

      {view === 'tasks' ? <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 920 }}><Stack direction="row" sx={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}><Box><Typography variant="h1">Tasks</Typography><Typography sx={{ color: 'text.secondary', mt: .6 }}>Follow-ups mapped to Telegram people.</Typography></Box><Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => openTask()}>Add</Button></Stack><Stack sx={{ mt: 2.5 }}>{[...tasks].sort((a, b) => Number(Boolean(a.completed)) - Number(Boolean(b.completed)) || String(a.dueAt || '').localeCompare(String(b.dueAt || ''))).map(task => { const contact = contacts.find(row => row.id === task.contactId); return <Stack key={task.id} direction="row" sx={{ alignItems: 'center', gap: 1, py: 1.15, borderBottom: 1, borderColor: 'divider', opacity: task.completed ? .45 : 1 }}><Checkbox checked={Boolean(task.completed)} onChange={() => toggleTask(task)} /><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" sx={{ fontWeight: 650, textDecoration: task.completed ? 'line-through' : 'none' }}>{task.title}</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>{contact?.name || (task.username ? `@${task.username}` : 'Unmapped')}{task.dueAt ? ` · ${new Date(task.dueAt).toLocaleString()}` : ''}</Typography></Box><IconButton onClick={() => openTask(task)}><EditRoundedIcon fontSize="small" /></IconButton></Stack> })}</Stack></Box> : null}

      {view === 'settings' ? <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720 }}><Typography variant="h1">Settings</Typography><Stack sx={{ mt: 2.5, gap: 2 }}><Box><Typography variant="h3">Telegram</Typography><Typography variant="body2" sx={{ color: 'text.secondary', mt: .5 }}>{account?.username ? `Connected as @${account.username}` : `Connected as ${account?.firstName || 'Telegram user'}`}</Typography><Button color="error" sx={{ mt: 1 }} startIcon={<LogoutRoundedIcon />} onClick={() => void logout()}>Log out</Button></Box><Divider /><Box><Typography variant="h3">Storage</Typography><Typography variant="body2" sx={{ color: 'text.secondary', mt: .5 }}>CRM metadata stays in this browser. Network sync stores raw pulled Telegram messages in IndexedDB before classification. Telegram remains the source of truth.</Typography></Box><Divider /><Box><Typography variant="h3">Network export</Typography><Typography variant="body2" sx={{ color: 'text.secondary', mt: .5 }}>Build the Network view first, then export a workbook with Network, Dashboard, and Excluded sheets.</Typography><Button sx={{ mt: 1 }} startIcon={<DownloadRoundedIcon />} onClick={() => setView('network')}>Open Network</Button></Box></Stack></Box> : null}
    </Box>

    <Drawer anchor="right" open={detailOpen} onClose={() => setDetailOpen(false)}>{details}</Drawer>

    <BottomNavigation showLabels value={view} onChange={(_, value) => setView(value)} sx={{ display: { xs: 'flex', md: 'none' }, position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1400, borderTop: 1, borderColor: 'divider' }}>{nav.map(item => <BottomNavigationAction key={item.id} value={item.id} label={item.label} icon={item.icon} />)}</BottomNavigation>

    <Dialog open={taskOpen} onClose={() => setTaskOpen(false)} fullWidth maxWidth="xs"><DialogTitle>{taskDraft.id ? 'Edit task' : 'New task'}</DialogTitle><DialogContent><Stack sx={{ gap: 1.5, pt: .5 }}><TextField autoFocus label="Task" value={taskDraft.title || ''} onChange={event => setTaskDraft(current => ({ ...current, title: event.target.value }))} /><Autocomplete options={contacts} value={contacts.find(row => row.id === taskDraft.contactId) || null} getOptionLabel={option => option.username ? `${option.name} (@${option.username})` : option.name} onChange={(_, contact) => setTaskDraft(current => ({ ...current, contactId: contact?.id, username: contact?.username }))} renderInput={params => <TextField {...params} label="Telegram person" />} /><TextField label="Username mapping" value={taskDraft.username || ''} onChange={event => setTaskDraft(current => ({ ...current, username: event.target.value.replace(/^@/, '') }))} slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> } }} /><TextField type="datetime-local" label="Due" value={taskDraft.dueAt || ''} onChange={event => setTaskDraft(current => ({ ...current, dueAt: event.target.value || undefined }))} slotProps={{ inputLabel: { shrink: true } }} /></Stack></DialogContent><DialogActions>{taskDraft.id ? <Button color="error" onClick={() => deleteTask(taskDraft.id!)} startIcon={<DeleteOutlineRoundedIcon />}>Delete</Button> : null}<Box sx={{ flex: 1 }} /><Button onClick={() => setTaskOpen(false)}>Cancel</Button><Button variant="contained" disabled={!String(taskDraft.title || '').trim()} onClick={saveTask}>Save</Button></DialogActions></Dialog>

    <Dialog open={opportunityOpen} onClose={() => setOpportunityOpen(false)} fullWidth maxWidth="xs"><DialogTitle>{opportunityDraft.id ? 'Edit opportunity' : 'New opportunity'}</DialogTitle><DialogContent><Stack sx={{ gap: 1.5, pt: .5 }}><TextField autoFocus label="Opportunity" value={opportunityDraft.title || ''} onChange={event => setOpportunityDraft(current => ({ ...current, title: event.target.value }))} /><Autocomplete options={contacts} value={contacts.find(row => row.id === opportunityDraft.contactId) || null} getOptionLabel={option => option.username ? `${option.name} (@${option.username})` : option.name} onChange={(_, contact) => setOpportunityDraft(current => ({ ...current, contactId: contact?.id, username: contact?.username, company: current.company || contact?.meta.company }))} renderInput={params => <TextField {...params} label="Telegram person" />} /><TextField label="Username mapping" value={opportunityDraft.username || ''} onChange={event => setOpportunityDraft(current => ({ ...current, username: event.target.value.replace(/^@/, '') }))} slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> } }} /><TextField label="Company" value={opportunityDraft.company || ''} onChange={event => setOpportunityDraft(current => ({ ...current, company: event.target.value }))} /><FormControl size="small"><Select value={opportunityDraft.stage || 'Lead'} onChange={event => setOpportunityDraft(current => ({ ...current, stage: event.target.value as PipelineStage }))}>{PIPELINE_STAGES.map(stage => <MenuItem key={stage} value={stage}>{stage}</MenuItem>)}</Select></FormControl><TextField type="number" label="Value (USD)" value={opportunityDraft.value ?? ''} onChange={event => setOpportunityDraft(current => ({ ...current, value: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) }))} /></Stack></DialogContent><DialogActions>{opportunityDraft.id ? <Button color="error" onClick={() => deleteOpportunity(opportunityDraft.id!)} startIcon={<DeleteOutlineRoundedIcon />}>Delete</Button> : null}<Box sx={{ flex: 1 }} /><Button onClick={() => setOpportunityOpen(false)}>Cancel</Button><Button variant="contained" disabled={!String(opportunityDraft.title || '').trim()} onClick={saveOpportunity}>Save</Button></DialogActions></Dialog>

    <Snackbar open={toast.open} autoHideDuration={2200} onClose={() => setToast(current => ({ ...current, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity={toast.severity} variant="filled">{toast.message}</Alert></Snackbar>
  </Box>
}
