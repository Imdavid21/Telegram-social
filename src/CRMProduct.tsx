import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AppBar,
  Autocomplete,
  Avatar,
  Badge,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Fade,
  FormControl,
  Grow,
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  Zoom,
  useMediaQuery,
  useTheme
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import ForumRoundedIcon from '@mui/icons-material/ForumRounded'
import Groups2RoundedIcon from '@mui/icons-material/Groups2Rounded'
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
import {
  authStatus,
  fetchCRMHistory,
  fetchCRMProfile,
  fetchFeed,
  logoutTelegram,
  sendCRMMessage,
  type CRMContactProfile
} from './lib/api'
import { clearOpenAIKey, hasOpenAIKey, saveOpenAIKey, summarizeWithUserOpenAI } from './lib/userOpenAI'
import { loadSettings } from './lib/storage'
import { loadCRMState, updateCRMContact, type CRMContactState, type CRMStage, type CRMState } from './crm/store'
import { createTask, loadTasks, saveTasks, type CRMTask } from './crm/tasks'
import { createOpportunity, loadOpportunities, PIPELINE_STAGES, saveOpportunities, type CRMOpportunity, type PipelineStage } from './crm/opportunities'

type View = 'inbox' | 'pipeline' | 'contacts' | 'tasks' | 'settings'
type InboxFilter = 'attention' | 'all' | 'unread' | 'followup'
type Toast = { open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }
type ConfirmState = { kind: 'task' | 'opportunity'; id: string } | null

type Contact = {
  id: string
  channelId: string
  name: string
  username?: string
  avatar?: string
  initials: string
  lastActivity: number
  unread: number
  latest?: FeedItem
  meta: CRMContactState
}

const stages: CRMStage[] = ['Lead', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost']
const defaultTags = ['partner', 'sponsor', 'investor', 'lead', 'customer', 'community', 'vendor', 'high-priority']
const drawerWidth = 218

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'TG';
}

function formatActivity(ts: number) {
  if (!ts) return 'No recent activity'
  const date = new Date(ts * 1000)
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatMoney(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return ''
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function formatDateTime(value?: string) {
  if (!value) return 'Not scheduled'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not scheduled' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function isDue(value?: string) {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && timestamp <= Date.now()
}

function preview(item?: FeedItem) {
  if (!item) return 'No recent message loaded'
  const text = String(item.text || '').replace(/\s+/g, ' ').trim()
  if (text) return text.length > 84 ? `${text.slice(0, 81)}…` : text
  return item.media ? `[${item.media.kind}]` : 'Message'
}

function mergeMessages(rows: FeedItem[]) {
  const map = new Map<string, FeedItem>()
  for (const row of rows) map.set(row.id, row)
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp || a.messageId - b.messageId)
}

function ContactAvatar({ contact, size = 40 }: { contact: Contact; size?: number }) {
  return <Avatar src={contact.avatar} sx={{ width: size, height: size, bgcolor: '#202620', color: 'text.primary', fontSize: size < 48 ? 13 : 17 }}>{contact.initials}</Avatar>
}

export default function CRMProduct() {
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const wide = useMediaQuery(theme.breakpoints.up('xl'))
  const [account, setAccount] = useState<TelegramAccount | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [crmState, setCRMState] = useState<CRMState>(() => loadCRMState())
  const [tasks, setTasks] = useState<CRMTask[]>(() => loadTasks())
  const [opportunities, setOpportunities] = useState<CRMOpportunity[]>(() => loadOpportunities())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>('inbox')
  const [filter, setFilter] = useState<InboxFilter>('attention')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending] = useState(false)
  const [history, setHistory] = useState<FeedItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [olderLoading, setOlderLoading] = useState(false)
  const [fullHistoryLoading, setFullHistoryLoading] = useState(false)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [profile, setProfile] = useState<CRMContactProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false)
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false)
  const [aiBusy, setAIBusy] = useState(false)
  const [aiError, setAIError] = useState('')
  const [keyConnected, setKeyConnected] = useState(() => hasOpenAIKey())
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [taskDraft, setTaskDraft] = useState<Partial<CRMTask>>({})
  const [opportunityDialogOpen, setOpportunityDialogOpen] = useState(false)
  const [opportunityDraft, setOpportunityDraft] = useState<Partial<CRMOpportunity>>({ stage: 'Lead' })
  const [confirmState, setConfirmState] = useState<ConfirmState>(null)
  const [toast, setToast] = useState<Toast>({ open: false, message: '', severity: 'success' })
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
      if (initial) {
        const first = page.channels.find(row => row.type === 'person' || row.type === 'conversation')
        setSelectedId(current => current || first?.id || null)
      }
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

  useEffect(() => {
    const handler = () => setKeyConnected(hasOpenAIKey())
    window.addEventListener('supergram:openai-key-changed', handler)
    return () => window.removeEventListener('supergram:openai-key-changed', handler)
  }, [])

  const contacts = useMemo<Contact[]>(() => {
    const lastByChannel = new Map<string, FeedItem>()
    for (const item of feed) {
      const current = lastByChannel.get(item.channelId)
      if (!current || item.timestamp > current.timestamp) lastByChannel.set(item.channelId, item)
    }
    return channels
      .filter(row => row.type === 'person' || row.type === 'conversation')
      .map(row => ({
        id: row.id,
        channelId: row.id,
        name: row.title,
        username: row.username,
        avatar: row.avatar,
        initials: row.initials || initials(row.title),
        lastActivity: lastByChannel.get(row.id)?.timestamp || 0,
        unread: Number(row.unread || 0),
        latest: lastByChannel.get(row.id),
        meta: crmState[row.id] || { updatedAt: 0 }
      }))
      .sort((a, b) => b.lastActivity - a.lastActivity)
  }, [channels, feed, crmState])

  const selected = contacts.find(row => row.id === selectedId) || null
  const selectedTasks = useMemo(() => tasks.filter(task => task.contactId === selectedId), [tasks, selectedId])
  const selectedOpportunities = useMemo(() => opportunities.filter(row => row.contactId === selectedId), [opportunities, selectedId])
  const attentionCount = useMemo(() => contacts.filter(row => row.unread > 0 || Boolean(row.meta.nextAction) || isDue(row.meta.followUpAt) || tasks.some(task => !task.completed && task.contactId === row.id && isDue(task.dueAt))).length, [contacts, tasks])
  const unreadCount = useMemo(() => contacts.reduce((sum, row) => sum + row.unread, 0), [contacts])
  const followUpCount = useMemo(() => contacts.filter(row => Boolean(row.meta.followUpAt)).length, [contacts])

  const filteredContacts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let rows = contacts.filter(row => !needle || `${row.name} ${row.username || ''} ${row.meta.company || ''} ${(row.meta.tags || []).join(' ')}`.toLowerCase().includes(needle))
    if (view === 'inbox') {
      if (filter === 'unread') rows = rows.filter(row => row.unread > 0)
      if (filter === 'followup') rows = rows.filter(row => Boolean(row.meta.followUpAt))
      if (filter === 'attention') rows = rows.filter(row => row.unread > 0 || row.meta.nextAction || isDue(row.meta.followUpAt) || tasks.some(task => !task.completed && task.contactId === row.id && isDue(task.dueAt)))
    }
    return rows
  }, [contacts, query, filter, view, tasks])

  function patchContact(id: string, patch: Partial<CRMContactState>) {
    setCRMState(current => updateCRMContact(current, id, patch))
  }

  const loadHistory = useCallback(async (contactId: string) => {
    setHistoryLoading(true)
    try {
      const page = await fetchCRMHistory(contactId, null, 80)
      setHistory(page.messages)
      setHistoryHasMore(page.hasMore)
      setNextBeforeId(page.nextBeforeId)
      setHistoryTotal(page.total)
      setError('')
      requestAnimationFrame(() => {
        if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
      })
    } catch (reason) {
      setError(String((reason as Error)?.message || 'Could not load conversation history.'))
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const loadProfile = useCallback(async (contactId: string) => {
    setProfileLoading(true)
    setProfileError('')
    try {
      const result = await fetchCRMProfile(contactId)
      setProfile(result.profile)
    } catch (reason) {
      setProfile(null)
      setProfileError(String((reason as Error)?.message || 'Could not load full Telegram profile.'))
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setDraft('')
    setHistory([])
    setProfile(null)
    setNotesDraft(crmState[selectedId]?.notes || '')
    void loadHistory(selectedId)
    void loadProfile(selectedId)
  }, [selectedId, loadHistory, loadProfile])

  useEffect(() => {
    if (!selectedId) return
    const timer = window.setInterval(async () => {
      try {
        const page = await fetchCRMHistory(selectedId, null, 60)
        setHistory(current => mergeMessages([...current, ...page.messages]))
        setHistoryHasMore(current => current || page.hasMore)
        setHistoryTotal(page.total)
      } catch {}
    }, 12_000)
    return () => window.clearInterval(timer)
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return
    const current = crmState[selectedId]?.notes || ''
    if (notesDraft === current) return
    setNotesSaving(true)
    setNotesSaved(false)
    const timer = window.setTimeout(() => {
      patchContact(selectedId, { notes: notesDraft.trim() || undefined })
      setNotesSaving(false)
      setNotesSaved(true)
      window.setTimeout(() => setNotesSaved(false), 1400)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [notesDraft, selectedId])

  async function loadOlder() {
    if (!selected || !historyHasMore || !nextBeforeId || olderLoading) return
    setOlderLoading(true)
    const node = threadRef.current
    const previousHeight = node?.scrollHeight || 0
    try {
      const page = await fetchCRMHistory(selected.id, nextBeforeId, 100)
      setHistory(current => mergeMessages([...page.messages, ...current]))
      setHistoryHasMore(page.hasMore)
      setNextBeforeId(page.nextBeforeId)
      setHistoryTotal(page.total || historyTotal)
      requestAnimationFrame(() => {
        if (node) node.scrollTop = node.scrollHeight - previousHeight
      })
    } catch (reason) {
      notify(String((reason as Error)?.message || 'Could not load older messages.'), 'error')
    } finally {
      setOlderLoading(false)
    }
  }

  async function loadFullHistory() {
    if (!selected || fullHistoryLoading) return
    setFullHistoryLoading(true)
    let before = nextBeforeId
    let more = historyHasMore
    let pages = 0
    try {
      while (more && before && pages < 100) {
        const page = await fetchCRMHistory(selected.id, before, 100)
        setHistory(current => mergeMessages([...page.messages, ...current]))
        more = page.hasMore
        before = page.nextBeforeId
        setHistoryHasMore(more)
        setNextBeforeId(before)
        setHistoryTotal(page.total || historyTotal)
        pages += 1
      }
      notify(more ? 'Loaded 10,000 messages. Scroll upward to continue if needed.' : 'Full Telegram history loaded.')
    } catch (reason) {
      notify(String((reason as Error)?.message || 'Full history loading stopped.'), 'error')
    } finally {
      setFullHistoryLoading(false)
    }
  }

  async function sendMessage() {
    const text = draft.trim()
    if (!selected || !text || sending) return
    const optimistic: FeedItem = {
      id: `optimistic:${Date.now()}`,
      messageId: -Date.now(),
      channelId: selected.id,
      timestamp: Math.floor(Date.now() / 1000),
      text,
      unread: false,
      saved: false,
      outgoing: true,
      reactions: []
    }
    setDraft('')
    setSending(true)
    setHistory(current => mergeMessages([...current, optimistic]))
    requestAnimationFrame(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight })
    try {
      const result = await sendCRMMessage(selected.id, text)
      setHistory(current => mergeMessages(current.filter(row => row.id !== optimistic.id).concat(result.message)))
      notify('Message sent')
    } catch (reason) {
      setHistory(current => current.filter(row => row.id !== optimistic.id))
      setDraft(text)
      notify(String((reason as Error)?.message || 'Could not send message.'), 'error')
    } finally {
      setSending(false)
    }
  }

  async function runRelationshipAI() {
    if (!selected) return
    if (!keyConnected) { setView('settings'); notify('Add an OpenAI API key to use relationship briefs.', 'info'); return }
    const rows = history.filter(row => String(row.text || '').trim()).slice(-80)
    if (!rows.length) { setAIError('No message text is loaded for this relationship yet.'); return }
    setAIBusy(true)
    setAIError('')
    try {
      const text = rows.map(row => `${row.outgoing ? 'Me' : selected.name}: ${String(row.text || '').trim()}`).join('\n')
      const result = await summarizeWithUserOpenAI(text, { sourceType: 'person', sourceName: selected.name }, loadSettings())
      patchContact(selected.id, { brief: { headline: result.headline, summary: result.summary, actionItems: result.actionItems, decisions: result.decisions, confidence: result.confidence, updatedAt: Date.now() } })
      notify('Relationship brief updated')
    } catch (reason) {
      setAIError(String((reason as Error)?.message || 'Could not generate relationship brief.'))
    } finally {
      setAIBusy(false)
    }
  }

  function openContact(contact: Contact) {
    setSelectedId(contact.id)
    setView('inbox')
    setFilter('all')
    if (mobile) setMobileThreadOpen(true)
  }

  function openTaskDialog(task?: CRMTask, contact?: Contact) {
    setTaskDraft(task ? { ...task } : { contactId: contact?.id, username: contact?.username, dueAt: contact ? contact.meta.followUpAt : undefined })
    setTaskDialogOpen(true)
  }

  function saveTaskDraft() {
    const title = String(taskDraft.title || '').trim()
    if (!title) return
    let next: CRMTask[]
    if (taskDraft.id) {
      next = tasks.map(task => task.id === taskDraft.id ? { ...task, ...taskDraft, title, updatedAt: Date.now() } as CRMTask : task)
    } else {
      next = [...tasks, createTask({ title, contactId: taskDraft.contactId, username: taskDraft.username, dueAt: taskDraft.dueAt })]
    }
    setTasks(next)
    saveTasks(next)
    setTaskDialogOpen(false)
    notify(taskDraft.id ? 'Task updated' : 'Task added')
  }

  function toggleTask(task: CRMTask) {
    const next = tasks.map(row => row.id === task.id ? { ...row, completed: !row.completed, updatedAt: Date.now() } : row)
    setTasks(next)
    saveTasks(next)
    notify(task.completed ? 'Task reopened' : 'Task completed')
  }

  function openOpportunityDialog(row?: CRMOpportunity, stage: PipelineStage = 'Lead', contact?: Contact) {
    setOpportunityDraft(row ? { ...row } : { stage, contactId: contact?.id, username: contact?.username, company: contact?.meta.company })
    setOpportunityDialogOpen(true)
  }

  function saveOpportunityDraft() {
    const title = String(opportunityDraft.title || '').trim()
    if (!title) return
    let next: CRMOpportunity[]
    if (opportunityDraft.id) {
      next = opportunities.map(row => row.id === opportunityDraft.id ? { ...row, ...opportunityDraft, title, stage: (opportunityDraft.stage || row.stage) as PipelineStage, updatedAt: Date.now() } as CRMOpportunity : row)
    } else {
      next = [...opportunities, createOpportunity({ title, contactId: opportunityDraft.contactId, username: opportunityDraft.username, company: opportunityDraft.company, stage: opportunityDraft.stage as PipelineStage || 'Lead', value: opportunityDraft.value, notes: opportunityDraft.notes })]
    }
    setOpportunities(next)
    saveOpportunities(next)
    setOpportunityDialogOpen(false)
    notify(opportunityDraft.id ? 'Opportunity updated' : 'Opportunity added')
  }

  function moveOpportunity(id: string, stage: PipelineStage) {
    const next = opportunities.map(row => row.id === id ? { ...row, stage, updatedAt: Date.now() } : row)
    setOpportunities(next)
    saveOpportunities(next)
    notify(`Moved to ${stage}`)
  }

  function confirmDelete() {
    if (!confirmState) return
    if (confirmState.kind === 'task') {
      const next = tasks.filter(row => row.id !== confirmState.id)
      setTasks(next)
      saveTasks(next)
      notify('Task deleted')
    } else {
      const next = opportunities.filter(row => row.id !== confirmState.id)
      setOpportunities(next)
      saveOpportunities(next)
      notify('Opportunity deleted')
    }
    setConfirmState(null)
  }

  async function logout() {
    await logoutTelegram().catch(() => {})
    location.href = '/'
  }

  const tagOptions = useMemo(() => [...new Set([...defaultTags, ...contacts.flatMap(contact => contact.meta.tags || [])])].sort(), [contacts])
  const navItems = [
    { id: 'inbox' as View, label: 'Inbox', icon: <InboxRoundedIcon />, badge: attentionCount },
    { id: 'pipeline' as View, label: 'Pipeline', icon: <ViewKanbanRoundedIcon /> },
    { id: 'contacts' as View, label: 'Contacts', icon: <Groups2RoundedIcon /> },
    { id: 'tasks' as View, label: 'Tasks', icon: <TaskAltRoundedIcon /> }
  ]

  if (loading) return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Stack
      sx={{
        alignItems: "center",
        gap: 2
      }}><CircularProgress /><Typography>Loading Telegram relationships</Typography></Stack></Box>
  );

  const relationshipPanel = selected ? <Box sx={{ p: 2.25, height: '100%', overflow: 'auto' }}>
    <Stack
      direction="row"
      sx={{
        justifyContent: "space-between",
        alignItems: "center"
      }}>
      <Typography variant="h2">{selected.name}</Typography>
      {!wide ? <IconButton onClick={() => setProfileDrawerOpen(false)}><CloseRoundedIcon /></IconButton> : null}
    </Stack>
    <Typography
      variant="body2"
      sx={{
        color: "text.secondary",
        mt: .4
      }}>{selected.username ? `@${selected.username}` : 'Telegram contact'}</Typography>

    <Stack
      direction="row"
      sx={{
        gap: 1.2,
        alignItems: "center",
        mt: 2
      }}>
      <ContactAvatar contact={selected} size={56} />
      <Box sx={{ minWidth: 0 }}>
        {profileLoading ? <Stack sx={{
          gap: .6
        }}><LinearProgress sx={{ width: 140 }} /><Typography variant="caption" sx={{
          color: "text.secondary"
        }}>Loading full Telegram profile</Typography></Stack> : <>
          <Typography variant="body2" sx={{
            fontWeight: 700
          }}>{profile?.status?.label || 'Profile loaded from Telegram'}</Typography>
          {profile?.bio ? <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: .4
            }}>{profile.bio}</Typography> : null}
        </>}
      </Box>
    </Stack>

    {profileError ? <Alert severity="info" sx={{ mt: 2 }}>{profileError}</Alert> : null}

    <Divider sx={{ my: 2 }} />
    <Typography variant="h3">CRM details</Typography>
    <Stack
      sx={{
        gap: 1.4,
        mt: 1.5
      }}>
      <FormControl size="small" fullWidth><Select displayEmpty value={selected.meta.stage || ''} onChange={event => patchContact(selected.id, { stage: (event.target.value || undefined) as CRMStage | undefined })}><MenuItem value=""><em>Stage not set</em></MenuItem>{stages.map(stage => <MenuItem key={stage} value={stage}>{stage}</MenuItem>)}</Select></FormControl>
      <TextField label="Company" value={selected.meta.company || ''} onChange={event => patchContact(selected.id, { company: event.target.value || undefined })} />
      <TextField label="Owner" value={selected.meta.owner || ''} onChange={event => patchContact(selected.id, { owner: event.target.value || undefined })} />
      <TextField label="Next action" value={selected.meta.nextAction || ''} onChange={event => patchContact(selected.id, { nextAction: event.target.value || undefined })} />
      <TextField type="datetime-local" label="Follow up" value={selected.meta.followUpAt || ''} onChange={event => patchContact(selected.id, { followUpAt: event.target.value || undefined })} slotProps={{ inputLabel: { shrink: true } }} />
      <Autocomplete multiple freeSolo options={tagOptions} value={selected.meta.tags || []} onChange={(_, value) => { patchContact(selected.id, { tags: value as string[] }); notify('Tags saved') }} renderInput={params => <TextField {...params} label="Tags" placeholder="Add tags" />} />
      <Box>
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            mb: .7
          }}><Typography variant="body2" sx={{
          color: "text.secondary"
        }}>Notes</Typography><Stack
          direction="row"
          sx={{
            alignItems: "center",
            gap: .5
          }}>{notesSaving ? <><CircularProgress size={13} /><Typography variant="caption" sx={{
          color: "text.secondary"
        }}>Saving</Typography></> : null}<Zoom in={notesSaved}><CheckRoundedIcon color="primary" sx={{ fontSize: 17 }} /></Zoom></Stack></Stack>
        <TextField fullWidth multiline minRows={4} value={notesDraft} onChange={event => setNotesDraft(event.target.value)} placeholder="Private relationship notes" />
      </Box>
    </Stack>

    <Divider sx={{ my: 2 }} />
    <Stack
      direction="row"
      sx={{
        justifyContent: "space-between",
        alignItems: "center"
      }}><Typography variant="h3">AI relationship brief</Typography><Button size="small" startIcon={aiBusy ? <CircularProgress size={14} /> : <AutoAwesomeRoundedIcon />} onClick={() => void runRelationshipAI()} disabled={aiBusy}>{selected.meta.brief ? 'Refresh' : 'Generate'}</Button></Stack>
    {aiError ? <Alert severity="error" sx={{ mt: 1 }}>{aiError}</Alert> : null}
    <Collapse in={Boolean(selected.meta.brief)}><Box sx={{ mt: 1.3 }}>{selected.meta.brief ? <><Typography variant="body2" sx={{
      fontWeight: 750
    }}>{selected.meta.brief.headline}</Typography><Typography
      variant="body2"
      sx={{
        color: "text.secondary",
        mt: .6
      }}>{selected.meta.brief.summary}</Typography>{selected.meta.brief.actionItems[0] ? <Button size="small" sx={{ mt: 1 }} onClick={() => patchContact(selected.id, { nextAction: selected.meta.brief?.actionItems[0] })}>Use suggested next action</Button> : null}</> : null}</Box></Collapse>

    <Divider sx={{ my: 2 }} />
    <Typography variant="h3">Telegram profile</Typography>
    {profile ? <Stack
      sx={{
        gap: 1.1,
        mt: 1.4
      }}>
      {profile.phone ? <Typography variant="body2"><Box component="span" sx={{
        color: "text.secondary"
      }}>Phone: </Box>{profile.phone}</Typography> : null}
      {profile.birthday ? <Typography variant="body2"><Box component="span" sx={{
        color: "text.secondary"
      }}>Birthday: </Box>{profile.birthday}</Typography> : null}
      {profile.usernames.length > 1 ? <Typography variant="body2"><Box component="span" sx={{
        color: "text.secondary"
      }}>Usernames: </Box>{profile.usernames.map(row => `@${row}`).join(', ')}</Typography> : null}
      <Typography variant="body2"><Box component="span" sx={{
        color: "text.secondary"
      }}>Mutual groups: </Box>{profile.commonChatsCount}</Typography>
      {profile.mutualGroups.length ? <Stack
        sx={{
          gap: .8,
          mt: .4
        }}>{profile.mutualGroups.slice(0, 12).map(group => <Paper variant="outlined" key={group.id} sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}><Avatar src={group.avatar} sx={{ width: 28, height: 28, fontSize: 10 }}>{group.initials}</Avatar><Box sx={{ minWidth: 0 }}><Typography variant="body2" noWrap>{group.title}</Typography>{group.username ? <Typography variant="caption" sx={{
        color: "text.secondary"
      }}>@{group.username}</Typography> : null}</Box></Paper>)}</Stack> : <Typography variant="body2" sx={{
        color: "text.secondary"
      }}>No mutual groups returned by Telegram.</Typography>}
    </Stack> : null}

    <Divider sx={{ my: 2 }} />
    <Stack
      direction="row"
      sx={{
        justifyContent: "space-between",
        alignItems: "center"
      }}><Typography variant="h3">Work linked to this contact</Typography><Stack direction="row"><Tooltip title="Add task"><IconButton size="small" onClick={() => openTaskDialog(undefined, selected)}><TaskAltRoundedIcon /></IconButton></Tooltip><Tooltip title="Add opportunity"><IconButton size="small" onClick={() => openOpportunityDialog(undefined, 'Lead', selected)}><ViewKanbanRoundedIcon /></IconButton></Tooltip></Stack></Stack>
    <Typography
      variant="body2"
      sx={{
        color: "text.secondary",
        mt: 1
      }}>{selectedTasks.filter(task => !task.completed).length} open tasks · {selectedOpportunities.length} opportunities</Typography>
  </Box> : null

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: 'background.default' }}>
      <Drawer variant="permanent" sx={{ display: { xs: 'none', md: 'block' }, width: drawerWidth, flexShrink: 0, '& .MuiDrawer-paper': { width: drawerWidth, borderRightColor: 'divider', bgcolor: '#0A0C0B' } }}>
        <Toolbar sx={{ gap: 1.2, px: 2 }}><Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 13, fontWeight: 900 }}>CRM</Avatar><Typography sx={{
          fontWeight: 800
        }}>Telegram CRM</Typography></Toolbar>
        <List sx={{ px: 1.2 }}>{navItems.map(item => <ListItemButton key={item.id} selected={view === item.id} onClick={() => setView(item.id)} sx={{ borderRadius: 2, mb: .5 }}><Badge color="primary" badgeContent={item.badge || 0} max={99} sx={{ '& .MuiBadge-badge': { color: '#101310' } }}>{item.icon}</Badge><ListItemText primary={item.label} sx={{ ml: 1.4 }} /></ListItemButton>)}</List>
        <Box sx={{ flex: 1 }} />
        <List sx={{ px: 1.2 }}><ListItemButton selected={view === 'settings'} onClick={() => setView('settings')} sx={{ borderRadius: 2 }}><SettingsRoundedIcon /><ListItemText primary="Settings" sx={{ ml: 1.4 }} /></ListItemButton></List>
        <Divider />
        <Stack
          direction="row"
          sx={{
            gap: 1,
            alignItems: "center",
            p: 1.5
          }}><Avatar src={account?.avatar} sx={{ width: 34, height: 34 }}>{initials(account?.firstName || 'TG')}</Avatar><Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="body2" noWrap sx={{
          fontWeight: 700
        }}>{account?.firstName || 'Telegram'}</Typography><Typography variant="caption" noWrap sx={{
          color: "text.secondary"
        }}>{account?.username ? `@${account.username}` : 'Connected'}</Typography></Box><Tooltip title="Log out"><IconButton size="small" onClick={() => void logout()}><LogoutRoundedIcon fontSize="small" /></IconButton></Tooltip></Stack>
      </Drawer>

      <Box component="main" sx={{ minWidth: 0, flex: 1, pb: { xs: 8, md: 0 } }}>
        <AppBar position="sticky" color="transparent" elevation={0} sx={{ display: { xs: 'block', md: 'none' }, bgcolor: 'rgba(11,13,12,.92)', backdropFilter: 'blur(14px)', borderBottom: 1, borderColor: 'divider' }}><Toolbar><Typography
          sx={{
            fontWeight: 800,
            flex: 1
          }}>Telegram CRM</Typography><IconButton onClick={() => setView('settings')}><SettingsRoundedIcon /></IconButton></Toolbar>{refreshing ? <LinearProgress /> : null}</AppBar>
        {error ? <Alert severity="error" action={<IconButton size="small" onClick={() => setError('')}><CloseRoundedIcon fontSize="small" /></IconButton>} sx={{ borderRadius: 0 }}>{error}</Alert> : null}
        {view === 'inbox' ? <Box sx={{ height: { xs: 'calc(100vh - 120px)', md: '100vh' }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: wide ? '320px minmax(0,1fr) 340px' : '320px minmax(0,1fr)' }, minWidth: 0 }}>
          <Box sx={{ display: { xs: mobileThreadOpen ? 'none' : 'block', md: 'block' }, borderRight: 1, borderColor: 'divider', overflow: 'hidden', bgcolor: 'background.paper' }}>
            <Box sx={{ p: 2, pb: 1 }}><Stack
              direction="row"
              sx={{
                justifyContent: "space-between",
                alignItems: "center"
              }}><Typography variant="h2">Relationships</Typography><Tooltip title="Refresh"><IconButton size="small" onClick={() => void loadTelegram(false)} disabled={refreshing}><RefreshRoundedIcon className={refreshing ? 'spin' : ''} /></IconButton></Tooltip></Stack><TextField fullWidth sx={{ mt: 1.5 }} placeholder="Search people, companies, or tags" value={query} onChange={event => setQuery(event.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }} /></Box>
            <Tabs value={filter} onChange={(_, value) => setFilter(value)} variant="scrollable" scrollButtons={false} sx={{ px: 1, minHeight: 42, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 42, minWidth: 80, px: 1.2, fontSize: 12 } }}><Tab value="attention" label={`Attention ${attentionCount}`} /><Tab value="all" label="All" /><Tab value="unread" label={`Unread ${unreadCount}`} /><Tab value="followup" label={`Follow-up ${followUpCount}`} /></Tabs>
            <List disablePadding sx={{ height: 'calc(100% - 126px)', overflow: 'auto' }}>{filteredContacts.length ? filteredContacts.map(contact => <ListItemButton key={contact.id} selected={selectedId === contact.id} onClick={() => openContact(contact)} sx={{ py: 1.25, borderBottom: 1, borderColor: 'divider', alignItems: 'flex-start' }}><ListItemAvatar sx={{ minWidth: 50 }}><ContactAvatar contact={contact} /></ListItemAvatar><ListItemText primary={<Stack
              direction="row"
              sx={{
                gap: 1,
                alignItems: "center"
              }}><Typography variant="body2" noWrap sx={{
              fontWeight: 730
            }}>{contact.name}</Typography>{contact.meta.stage ? <Chip size="small" label={contact.meta.stage} variant="outlined" sx={{ height: 20, fontSize: 10 }} /> : null}</Stack>} secondary={<Typography
              variant="caption"
              noWrap
              sx={{
                color: "text.secondary",
                display: 'block',
                mt: .35
              }}>{preview(contact.latest)}</Typography>} /><Stack
              sx={{
                alignItems: "flex-end",
                gap: .7,
                ml: 1
              }}><Typography variant="caption" sx={{
              color: "text.secondary"
            }}>{formatActivity(contact.lastActivity)}</Typography>{contact.unread ? <Badge color="primary" badgeContent={contact.unread} max={99} sx={{ '& .MuiBadge-badge': { color: '#101310' } }} /> : isDue(contact.meta.followUpAt) ? <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'warning.main' }} /> : null}</Stack></ListItemButton>) : <Box sx={{ p: 3 }}><Typography sx={{
              fontWeight: 700
            }}>{filter === 'attention' ? 'Nothing needs attention.' : 'No relationships found.'}</Typography><Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mt: .6
              }}>{filter === 'attention' ? 'Unread conversations, due tasks, and next actions appear here.' : 'Try another search or filter.'}</Typography></Box>}</List>
          </Box>

          <Box sx={{ display: { xs: mobileThreadOpen ? 'flex' : 'none', md: 'flex' }, flexDirection: 'column', minWidth: 0, bgcolor: '#0B0D0C' }}>
            {selected ? <>
              <Toolbar variant="dense" sx={{ minHeight: 64, borderBottom: 1, borderColor: 'divider', px: 2, gap: 1 }}>
                {mobile ? <IconButton onClick={() => setMobileThreadOpen(false)}><ArrowBackRoundedIcon /></IconButton> : null}
                <ContactAvatar contact={selected} size={38} />
                <Box sx={{ minWidth: 0, flex: 1 }}><Typography noWrap sx={{
                  fontWeight: 750
                }}>{selected.name}</Typography><Typography variant="caption" noWrap sx={{
                  color: "text.secondary"
                }}>{selected.username ? `@${selected.username}` : 'Telegram contact'}{profile?.status?.label ? ` · ${profile.status.label}` : ''}</Typography></Box>
                <Tooltip title="Summarize relationship"><IconButton onClick={() => void runRelationshipAI()} disabled={aiBusy}>{aiBusy ? <CircularProgress size={20} /> : <AutoAwesomeRoundedIcon />}</IconButton></Tooltip>
                <Tooltip title="Load full history"><IconButton onClick={() => void loadFullHistory()} disabled={fullHistoryLoading || !historyHasMore}>{fullHistoryLoading ? <CircularProgress size={20} /> : <MoreHorizRoundedIcon />}</IconButton></Tooltip>
                {!wide ? <Tooltip title="Relationship details"><IconButton onClick={() => setProfileDrawerOpen(true)}><ChevronRightRoundedIcon /></IconButton></Tooltip> : null}
              </Toolbar>
              {fullHistoryLoading ? <Box><LinearProgress /><Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  px: 2,
                  py: .6,
                  display: 'block'
                }}>Loading full history · {history.length}{historyTotal ? ` of about ${historyTotal}` : ''} messages loaded</Typography></Box> : null}
              <Box ref={threadRef} onScroll={event => { if (event.currentTarget.scrollTop < 80) void loadOlder() }} sx={{ flex: 1, overflow: 'auto', p: 2, scrollBehavior: 'smooth' }}>
                {historyLoading ? <Stack
                  sx={{
                    alignItems: "center",
                    gap: 1.5,
                    pt: 6
                  }}><CircularProgress size={28} /><Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>Loading conversation history</Typography></Stack> : <>
                  {historyHasMore ? <Stack
                    sx={{
                      alignItems: "center",
                      pb: 2
                    }}><Button size="small" onClick={() => void loadOlder()} disabled={olderLoading} startIcon={olderLoading ? <CircularProgress size={14} /> : undefined}>{olderLoading ? 'Loading older messages' : 'Load older messages'}</Button></Stack> : history.length ? <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      display: 'block',
                      textAlign: 'center',
                      pb: 2
                    }}>Start of loaded Telegram history</Typography> : null}
                  <Stack sx={{
                    gap: 1
                  }}>{history.map(item => <Fade in key={item.id} timeout={180}><Paper variant="outlined" sx={{ p: 1.25, maxWidth: { xs: '88%', md: '74%' }, alignSelf: item.outgoing ? 'flex-end' : 'flex-start', ml: item.outgoing ? 'auto' : 0, bgcolor: item.outgoing ? 'rgba(208,255,79,.07)' : 'background.paper', borderColor: item.outgoing ? 'rgba(208,255,79,.2)' : 'divider', opacity: item.id.startsWith('optimistic:') ? .65 : 1, transition: 'opacity 180ms ease, transform 180ms ease' }}><Stack
                    direction="row"
                    sx={{
                      gap: 1,
                      justifyContent: "space-between"
                    }}><Typography variant="caption" sx={{
                    color: "text.secondary"
                  }}>{item.outgoing ? 'You' : selected.name}</Typography><Typography variant="caption" sx={{
                    color: "text.secondary"
                  }}>{formatActivity(item.timestamp)}</Typography></Stack>{item.text ? <Typography variant="body2" sx={{ mt: .45, whiteSpace: 'pre-wrap' }}>{item.text}</Typography> : null}{item.media ? <Chip size="small" label={item.media.kind} variant="outlined" sx={{ mt: .8 }} /> : null}{item.edited ? <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      display: 'block',
                      mt: .4
                    }}>edited</Typography> : null}</Paper></Fade>)}</Stack>
                </>}
              </Box>
              <Box sx={{ borderTop: 1, borderColor: 'divider', p: 1.25, bgcolor: 'background.paper' }}><Stack
                direction="row"
                sx={{
                  gap: 1,
                  alignItems: "flex-end"
                }}><TextField fullWidth multiline maxRows={5} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} placeholder={`Message ${selected.name}`} /><Zoom in><IconButton color="primary" onClick={() => void sendMessage()} disabled={!draft.trim() || sending} sx={{ width: 42, height: 42, bgcolor: draft.trim() ? 'rgba(208,255,79,.09)' : undefined }}>{sending ? <CircularProgress size={20} /> : <SendRoundedIcon />}</IconButton></Zoom></Stack></Box>
            </> : <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 3, textAlign: 'center' }}><Box><ForumRoundedIcon sx={{ fontSize: 42, color: 'text.secondary' }} /><Typography variant="h2" sx={{ mt: 1 }}>Open a relationship</Typography><Typography
              sx={{
                color: "text.secondary",
                mt: .7
              }}>Select a Telegram contact to load the full conversation and CRM context.</Typography></Box></Box>}
          </Box>

          {wide ? <Box sx={{ borderLeft: 1, borderColor: 'divider', bgcolor: 'background.paper', overflow: 'hidden' }}>{relationshipPanel}</Box> : null}
        </Box> : null}

        {view === 'pipeline' ? <Box sx={{ p: { xs: 2, md: 3 }, minHeight: '100vh' }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            sx={{
              justifyContent: "space-between",
              gap: 2,
              alignItems: { sm: 'flex-end' }
            }}><Box><Typography variant="h1">Pipeline</Typography><Typography
            sx={{
              color: "text.secondary",
              mt: .7
            }}>Drag opportunities between stages. Each card can map back to a Telegram username.</Typography></Box><Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => openOpportunityDialog()}>Add opportunity</Button></Stack>
          <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, minmax(240px, 1fr))`, gap: 1.2, overflowX: 'auto', alignItems: 'start', pb: 2 }}>
            {PIPELINE_STAGES.map(stage => {
              const rows = opportunities.filter(row => row.stage === stage)
              return (
                <Paper key={stage} variant="outlined" onDragOver={event => event.preventDefault()} onDrop={() => { if (dragId.current) moveOpportunity(dragId.current, stage); dragId.current = null }} sx={{ minHeight: 520, p: 1.2, bgcolor: '#0E110F' }}><Stack
                  direction="row"
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: .6,
                    pb: 1
                  }}><Typography sx={{
                  fontWeight: 760
                }}>{stage}</Typography><Stack
                  direction="row"
                  sx={{
                    alignItems: "center",
                    gap: .5
                  }}><Chip size="small" label={rows.length} /><IconButton size="small" onClick={() => openOpportunityDialog(undefined, stage)}><AddRoundedIcon fontSize="small" /></IconButton></Stack></Stack><Stack sx={{
                  gap: 1
                }}>{rows.map((row, index) => <Grow in timeout={220 + index * 50} key={row.id}><Paper draggable onDragStart={() => { dragId.current = row.id }} onDragEnd={() => { dragId.current = null }} variant="outlined" sx={{ p: 1.4, cursor: 'grab', bgcolor: 'background.paper', '&:active': { cursor: 'grabbing', transform: 'scale(.99)' }, transition: 'transform 120ms ease' }}><Stack
                  direction="row"
                  sx={{
                    justifyContent: "space-between",
                    gap: 1
                  }}><Typography variant="body2" sx={{
                  fontWeight: 760
                }}>{row.title}</Typography><IconButton size="small" onClick={() => openOpportunityDialog(row)}><EditRoundedIcon fontSize="small" /></IconButton></Stack>{row.username ? <Typography variant="caption" sx={{
                  color: "text.secondary"
                }}>@{row.username}</Typography> : null}{row.company ? <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    display: 'block'
                  }}>{row.company}</Typography> : null}{row.value !== undefined ? <Typography
                  sx={{
                    fontWeight: 780,
                    mt: 1
                  }}>{formatMoney(row.value)}</Typography> : null}{row.notes ? <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mt: .8
                  }}>{row.notes}</Typography> : null}</Paper></Grow>)}{!rows.length ? <Button onClick={() => openOpportunityDialog(undefined, stage)} sx={{ justifyContent: 'flex-start', color: 'text.secondary' }} startIcon={<AddRoundedIcon />}>Add card</Button> : null}</Stack></Paper>
              );
            })}
          </Box>
        </Box> : null}

        {view === 'contacts' ? <Box sx={{ p: { xs: 2, md: 3 } }}>
          <Typography variant="h1">Contacts</Typography><Typography
          sx={{
            color: "text.secondary",
            mt: .7
          }}>Telegram people with CRM context attached to their peer identity.</Typography>
          <TextField sx={{ mt: 2.5, maxWidth: 420 }} fullWidth placeholder="Search contacts" value={query} onChange={event => setQuery(event.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }} />
          <Paper variant="outlined" sx={{ mt: 2, overflow: 'hidden' }}>{filteredContacts.map((contact, index) => <Fade in timeout={180 + index * 30} key={contact.id}><ListItem disablePadding divider><ListItemButton onClick={() => openContact(contact)} sx={{ py: 1.25 }}><ListItemAvatar><ContactAvatar contact={contact} /></ListItemAvatar><ListItemText primary={contact.name} secondary={contact.username ? `@${contact.username}` : contact.meta.company || 'Telegram contact'} /><Box sx={{ display: { xs: 'none', sm: 'block' }, width: 130 }}><Typography variant="body2">{contact.meta.stage || 'Not set'}</Typography></Box><Box sx={{ display: { xs: 'none', md: 'block' }, width: 190 }}><Typography variant="body2" noWrap sx={{
            color: "text.secondary"
          }}>{contact.meta.nextAction || 'No next action'}</Typography></Box><Typography variant="caption" sx={{
            color: "text.secondary"
          }}>{formatActivity(contact.lastActivity)}</Typography><ChevronRightRoundedIcon sx={{ ml: 1, color: 'text.secondary' }} /></ListItemButton></ListItem></Fade>)}</Paper>
        </Box> : null}

        {view === 'tasks' ? <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            sx={{
              justifyContent: "space-between",
              gap: 2,
              alignItems: { sm: 'flex-end' }
            }}><Box><Typography variant="h1">Tasks</Typography><Typography
            sx={{
              color: "text.secondary",
              mt: .7
            }}>Create, edit, complete, or delete work and map each task to a Telegram username.</Typography></Box><Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => openTaskDialog()}>Add task</Button></Stack>
          <Stack
            sx={{
              gap: 1,
              mt: 3
            }}>{tasks.length ? [...tasks].sort((a, b) => Number(Boolean(a.completed)) - Number(Boolean(b.completed)) || String(a.dueAt || '').localeCompare(String(b.dueAt || ''))).map((task, index) => {
            const contact = contacts.find(row => row.id === task.contactId)
            return (
              <Grow in timeout={220 + index * 45} key={task.id}><Paper variant="outlined" sx={{ p: 1.4, display: 'flex', alignItems: 'center', gap: 1.2, opacity: task.completed ? .55 : 1 }}><Checkbox checked={Boolean(task.completed)} onChange={() => toggleTask(task)} icon={<Box sx={{ width: 20, height: 20, border: 1, borderColor: 'divider', borderRadius: 1 }} />} checkedIcon={<Zoom in><CheckRoundedIcon color="primary" /></Zoom>} /><Box sx={{ flex: 1, minWidth: 0 }}><Typography
                variant="body2"
                sx={{
                  fontWeight: 730,
                  textDecoration: task.completed ? 'line-through' : 'none'
                }}>{task.title}</Typography><Stack
                direction="row"
                sx={{
                  gap: 1,
                  flexWrap: "wrap",
                  mt: .35
                }}>{contact || task.username ? <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>{contact ? contact.name : ''}{task.username ? ` @${task.username}` : ''}</Typography> : null}{task.dueAt ? <Typography variant="caption" color={isDue(task.dueAt) && !task.completed ? 'warning.main' : 'text.secondary'}>{formatDateTime(task.dueAt)}</Typography> : null}</Stack></Box><Tooltip title="Edit"><IconButton onClick={() => openTaskDialog(task)}><EditRoundedIcon /></IconButton></Tooltip><Tooltip title="Delete"><IconButton onClick={() => setConfirmState({ kind: 'task', id: task.id })}><DeleteOutlineRoundedIcon /></IconButton></Tooltip></Paper></Grow>
            );
          }) : <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}><TaskAltRoundedIcon sx={{ fontSize: 38, color: 'text.secondary' }} /><Typography variant="h2" sx={{ mt: 1 }}>No tasks yet</Typography><Typography
            sx={{
              color: "text.secondary",
              mt: .6
            }}>Add a task and optionally map it to a Telegram contact.</Typography><Button sx={{ mt: 2 }} variant="contained" onClick={() => openTaskDialog()}>Add first task</Button></Paper>}</Stack>
        </Box> : null}

        {view === 'settings' ? <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 860 }}>
          <Typography variant="h1">Settings</Typography><Typography
          sx={{
            color: "text.secondary",
            mt: .7
          }}>Manage Telegram connection and optional AI features.</Typography>
          <Paper variant="outlined" sx={{ mt: 3, p: 2.5 }}><Typography variant="h2">Telegram account</Typography><Stack
            direction="row"
            sx={{
              alignItems: "center",
              gap: 1.5,
              mt: 2
            }}><Avatar src={account?.avatar}>{initials(account?.firstName || 'TG')}</Avatar><Box sx={{ flex: 1 }}><Typography sx={{
            fontWeight: 750
          }}>{[account?.firstName, account?.lastName].filter(Boolean).join(' ') || 'Telegram'}</Typography><Typography variant="body2" sx={{
            color: "text.secondary"
          }}>{account?.username ? `@${account.username}` : 'Connected'}</Typography></Box><Button color="error" startIcon={<LogoutRoundedIcon />} onClick={() => void logout()}>Log out</Button></Stack></Paper>
          <Paper variant="outlined" sx={{ mt: 1.5, p: 2.5 }}><Typography variant="h2">AI relationship briefs</Typography><Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: .8
            }}>AI is optional. Your key is stored only for the current browser tab session, and message context is sent only when you explicitly generate a brief.</Typography>{keyConnected ? <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
              mt: 2
            }}><Stack
            direction="row"
            sx={{
              gap: 1,
              alignItems: "center"
            }}><CheckRoundedIcon color="primary" /><Typography variant="body2">OpenAI key connected</Typography></Stack><Button onClick={() => { clearOpenAIKey(); setKeyConnected(false); notify('AI key removed') }}>Remove key</Button></Stack> : <Stack
            direction={{ xs: 'column', sm: 'row' }}
            sx={{
              gap: 1,
              mt: 2
            }}><TextField fullWidth type="password" label="OpenAI API key" value={apiKeyDraft} onChange={event => setApiKeyDraft(event.target.value)} /><Button variant="contained" disabled={!apiKeyDraft.trim()} onClick={() => { saveOpenAIKey(apiKeyDraft.trim()); setApiKeyDraft(''); setKeyConnected(true); notify('AI key saved for this tab') }}>Save key</Button></Stack>}</Paper>
          <Paper variant="outlined" sx={{ mt: 1.5, p: 2.5 }}><Typography variant="h2">CRM storage</Typography><Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: .8
            }}>Notes, tags, tasks, opportunities, and CRM metadata are currently stored in this browser. Telegram messages remain in Telegram and are loaded on demand.</Typography></Paper>
        </Box> : null}
      </Box>

      {!wide ? <Drawer anchor="right" open={profileDrawerOpen} onClose={() => setProfileDrawerOpen(false)} slotProps={{
        paper: { sx: { width: { xs: '92vw', sm: 380 }, bgcolor: 'background.paper' } }
      }}>{relationshipPanel}</Drawer> : null}

      <BottomNavigation showLabels value={view} onChange={(_, value) => setView(value)} sx={{ display: { xs: 'flex', md: 'none' }, position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: theme.zIndex.appBar, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>{navItems.map(item => <BottomNavigationAction key={item.id} value={item.id} label={item.label} icon={item.badge ? <Badge color="primary" badgeContent={item.badge} max={99}>{item.icon}</Badge> : item.icon} />)}</BottomNavigation>

      <Dialog open={taskDialogOpen} onClose={() => setTaskDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{taskDraft.id ? 'Edit task' : 'Add task'}</DialogTitle>
        <DialogContent><Stack
          sx={{
            gap: 1.6,
            pt: .5
          }}><TextField autoFocus label="Task" value={taskDraft.title || ''} onChange={event => setTaskDraft(current => ({ ...current, title: event.target.value }))} /><Autocomplete options={contacts} value={contacts.find(row => row.id === taskDraft.contactId) || null} getOptionLabel={option => option.username ? `${option.name} (@${option.username})` : option.name} onChange={(_, contact) => setTaskDraft(current => ({ ...current, contactId: contact?.id, username: contact?.username }))} renderInput={params => <TextField {...params} label="Telegram contact" placeholder="Optional" />} /><TextField label="Username mapping" value={taskDraft.username || ''} onChange={event => setTaskDraft(current => ({ ...current, username: event.target.value.replace(/^@/, '') }))} slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> } }} /><TextField type="datetime-local" label="Due" value={taskDraft.dueAt || ''} onChange={event => setTaskDraft(current => ({ ...current, dueAt: event.target.value || undefined }))} slotProps={{ inputLabel: { shrink: true } }} /></Stack></DialogContent>
        <DialogActions>{taskDraft.id ? <Button color="error" onClick={() => { setTaskDialogOpen(false); setConfirmState({ kind: 'task', id: taskDraft.id! }) }}>Delete</Button> : null}<Box sx={{ flex: 1 }} /><Button onClick={() => setTaskDialogOpen(false)}>Cancel</Button><Button variant="contained" onClick={saveTaskDraft} disabled={!String(taskDraft.title || '').trim()}>Save task</Button></DialogActions>
      </Dialog>

      <Dialog open={opportunityDialogOpen} onClose={() => setOpportunityDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{opportunityDraft.id ? 'Edit opportunity' : 'Add opportunity'}</DialogTitle>
        <DialogContent><Stack
          sx={{
            gap: 1.6,
            pt: .5
          }}><TextField autoFocus label="Opportunity" value={opportunityDraft.title || ''} onChange={event => setOpportunityDraft(current => ({ ...current, title: event.target.value }))} /><Autocomplete options={contacts} value={contacts.find(row => row.id === opportunityDraft.contactId) || null} getOptionLabel={option => option.username ? `${option.name} (@${option.username})` : option.name} onChange={(_, contact) => setOpportunityDraft(current => ({ ...current, contactId: contact?.id, username: contact?.username, company: current.company || contact?.meta.company }))} renderInput={params => <TextField {...params} label="Telegram contact" placeholder="Optional" />} /><TextField label="Username mapping" value={opportunityDraft.username || ''} onChange={event => setOpportunityDraft(current => ({ ...current, username: event.target.value.replace(/^@/, '') }))} slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> } }} /><TextField label="Company" value={opportunityDraft.company || ''} onChange={event => setOpportunityDraft(current => ({ ...current, company: event.target.value }))} /><FormControl size="small"><Select value={opportunityDraft.stage || 'Lead'} onChange={event => setOpportunityDraft(current => ({ ...current, stage: event.target.value as PipelineStage }))}>{PIPELINE_STAGES.map(stage => <MenuItem key={stage} value={stage}>{stage}</MenuItem>)}</Select></FormControl><TextField type="number" label="Value (USD)" value={opportunityDraft.value ?? ''} onChange={event => setOpportunityDraft(current => ({ ...current, value: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value) || 0) }))} /><TextField multiline minRows={3} label="Notes" value={opportunityDraft.notes || ''} onChange={event => setOpportunityDraft(current => ({ ...current, notes: event.target.value }))} /></Stack></DialogContent>
        <DialogActions>{opportunityDraft.id ? <Button color="error" onClick={() => { setOpportunityDialogOpen(false); setConfirmState({ kind: 'opportunity', id: opportunityDraft.id! }) }}>Delete</Button> : null}<Box sx={{ flex: 1 }} /><Button onClick={() => setOpportunityDialogOpen(false)}>Cancel</Button><Button variant="contained" onClick={saveOpportunityDraft} disabled={!String(opportunityDraft.title || '').trim()}>Save opportunity</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(confirmState)} onClose={() => setConfirmState(null)} maxWidth="xs" fullWidth><DialogTitle>Delete {confirmState?.kind === 'task' ? 'task' : 'opportunity'}?</DialogTitle><DialogContent><Typography sx={{
        color: "text.secondary"
      }}>This removes the CRM item from this browser. It does not change Telegram.</Typography></DialogContent><DialogActions><Button onClick={() => setConfirmState(null)}>Cancel</Button><Button color="error" variant="contained" onClick={confirmDelete}>Delete</Button></DialogActions></Dialog>

      <Snackbar open={toast.open} autoHideDuration={2600} onClose={() => setToast(current => ({ ...current, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert variant="filled" severity={toast.severity} onClose={() => setToast(current => ({ ...current, open: false }))}>{toast.message}</Alert></Snackbar>
    </Box>
  );
}
