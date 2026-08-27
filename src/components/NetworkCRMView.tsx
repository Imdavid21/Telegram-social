import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import SyncRoundedIcon from '@mui/icons-material/SyncRounded'
import { motion } from 'motion/react'
import { ApiError, fetchCRMHistory, fetchNetworkGroupMembers, fetchNetworkIndex } from '../lib/api'
import {
  analyzeNetworkContact,
  classifyNetworkContact,
  type NetworkAnalysisRow
} from '../crm/networkAnalysis'
import {
  clearNetworkCache,
  getAllNetworkMessages,
  getNetworkContacts,
  getNetworkExcluded,
  getNetworkMeta,
  getNetworkMessages,
  markNetworkContactFailed,
  patchNetworkContact,
  saveNetworkExcluded,
  saveNetworkIndex,
  saveNetworkMessagePage,
  setNetworkMeta,
  type NetworkContactRecord,
  type NetworkExcludedRecord
} from '../crm/networkCache'
import { exportNetworkWorkbook, type NetworkCoverageSummary } from '../crm/networkExport'

type SyncPhase = 'idle' | 'index' | 'seed' | 'history' | 'groups' | 'analyze' | 'done' | 'stopped'
type SyncProgress = {
  running: boolean
  phase: SyncPhase
  current: number
  total: number
  label: string
  detail?: string
}

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

async function withFloodBackoff<T>(action: () => Promise<T>, onWait: (ms: number) => void): Promise<T> {
  for (;;) {
    try { return await action() }
    catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        const delay = Math.max(1500, Number(error.retryAfterMs || 5000)) + 350
        onWait(delay)
        await wait(delay)
        continue
      }
      throw error
    }
  }
}

function formatRelative(date?: Date) {
  if (!date) return 'No messages'
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'Now'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

function phaseLabel(phase: SyncPhase) {
  if (phase === 'index') return 'Reading private chats'
  if (phase === 'seed') return 'Measuring threads'
  if (phase === 'history') return 'Pulling message history'
  if (phase === 'groups') return 'Checking group-only contacts'
  if (phase === 'analyze') return 'Classifying relationships'
  if (phase === 'done') return 'Network is current'
  if (phase === 'stopped') return 'Sync stopped'
  return 'Ready to sync'
}

export function NetworkCRMView({ onOpenContact }: { onOpenContact?: (sourceId: string) => void }) {
  const [rows, setRows] = useState<NetworkAnalysisRow[]>([])
  const [excluded, setExcluded] = useState<NetworkExcludedRecord[]>([])
  const [coverage, setCoverage] = useState<NetworkCoverageSummary>({ failedContacts: [], failedGroups: [], partialContacts: 0 })
  const [progress, setProgress] = useState<SyncProgress>({ running: false, phase: 'idle', current: 0, total: 0, label: phaseLabel('idle') })
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [exporting, setExporting] = useState(false)

  const refreshLocal = useCallback(async () => {
    const [contacts, messages, excludedRows, storedCoverage] = await Promise.all([
      getNetworkContacts(),
      getAllNetworkMessages(),
      getNetworkExcluded(),
      getNetworkMeta<NetworkCoverageSummary>('coverage', { failedContacts: [], failedGroups: [], partialContacts: 0 })
    ])
    const byContact = new Map<string, typeof messages>()
    for (const message of messages) {
      const list = byContact.get(message.telegramUserId) || []
      list.push(message)
      byContact.set(message.telegramUserId, list)
    }
    const nextRows = contacts.map(contact => analyzeNetworkContact(contact, byContact.get(contact.telegramUserId) || []))
      .filter(row => row.totalMessages > 0)
      .sort((a, b) => Number(b.lastMessageAt?.getTime() || 0) - Number(a.lastMessageAt?.getTime() || 0))
    setRows(nextRows)
    setExcluded(excludedRows)
    setCoverage(storedCoverage)
  }, [])

  useEffect(() => { void refreshLocal() }, [refreshLocal])

  const setPhase = useCallback((phase: SyncPhase, current: number, total: number, detail?: string) => {
    setProgress({ running: !['done', 'stopped', 'idle'].includes(phase), phase, current, total, label: phaseLabel(phase), detail })
  }, [])

  async function syncNetwork() {
    if (progress.running) return
    const startedAt = new Date().toISOString()
    const failedContacts: Array<{ name: string; error: string }> = []
    const failedGroups: Array<{ name: string; error: string }> = []
    setError('')
    setPhase('index', 0, 1)
    await setNetworkMeta('syncStartedAt', startedAt)

    let activeName = 'Telegram index'
    let activePhase: SyncPhase = 'index'
    try {
      const index = await withFloodBackoff(() => fetchNetworkIndex(), ms => setPhase('index', 0, 1, `Telegram asked us to wait ${Math.ceil(ms / 1000)}s`))
      await saveNetworkIndex(index.contacts, index.excluded, index.indexedAt)
      await setNetworkMeta('groups', index.groups)

      let contacts = await getNetworkContacts()
      const unseeded = contacts.filter(contact => !contact.sync.seeded)
      activePhase = 'seed'
      for (let i = 0; i < unseeded.length; i++) {
        const contact = unseeded[i]
        activeName = contact.name
        setPhase('seed', i + 1, unseeded.length, contact.name)
        try {
          const page = await withFloodBackoff(() => fetchCRMHistory(contact.sourceId, null, 100), ms => setPhase('seed', i + 1, unseeded.length, `${contact.name} · waiting ${Math.ceil(ms / 1000)}s`))
          await saveNetworkMessagePage(contact, page.messages, page)
        } catch (reason) {
          if (reason instanceof ApiError && reason.status === 401) throw reason
          const message = String((reason as Error)?.message || reason)
          failedContacts.push({ name: contact.name, error: message })
          await markNetworkContactFailed(contact.telegramUserId, message)
        }
        await wait(160)
      }

      contacts = await getNetworkContacts()
      contacts.sort((a, b) => Number(b.sync.total || 0) - Number(a.sync.total || 0))
      activePhase = 'history'
      for (let i = 0; i < contacts.length; i++) {
        let contact = contacts[i]
        if (contact.sync.failed || contact.sync.complete || !contact.sync.seeded) continue
        activeName = contact.name
        let before = contact.sync.nextBeforeId
        let hasMore = contact.sync.hasMore
        while (hasMore && before) {
          setPhase('history', i + 1, contacts.length, `${contact.name} · ${contact.sync.cachedMessages || 0}/${contact.sync.total || '?'} cached`)
          try {
            const page = await withFloodBackoff(() => fetchCRMHistory(contact.sourceId, before, 100), ms => setPhase('history', i + 1, contacts.length, `${contact.name} · rate limit ${Math.ceil(ms / 1000)}s`))
            await saveNetworkMessagePage(contact, page.messages, page)
            contact = { ...contact, sync: { ...contact.sync, seeded: true, complete: !page.hasMore, hasMore: page.hasMore, nextBeforeId: page.nextBeforeId, total: Math.max(page.total, contact.sync.total), cachedMessages: contact.sync.cachedMessages + page.messages.length } }
            before = page.nextBeforeId
            hasMore = page.hasMore
          } catch (reason) {
            if (reason instanceof ApiError && reason.status === 401) throw reason
            const message = String((reason as Error)?.message || reason)
            failedContacts.push({ name: contact.name, error: message })
            await markNetworkContactFailed(contact.telegramUserId, message)
            break
          }
          await wait(190)
        }
      }

      const privateIds = new Set((await getNetworkContacts()).map(contact => contact.telegramUserId))
      const groups = await getNetworkMeta<Array<{ sourceId?: string; name: string }>>('groups', [])
      activePhase = 'groups'
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i]
        if (!group.sourceId) continue
        activeName = group.name
        const checkpoint = await getNetworkMeta<{ offset: number; complete: boolean; error?: string }>(`group:${group.sourceId}`, { offset: 0, complete: false })
        if (checkpoint.complete) continue
        let offset = checkpoint.offset || 0
        let more = true
        try {
          while (more) {
            setPhase('groups', i + 1, groups.length, `${group.name} · ${offset} members checked`)
            const page = await withFloodBackoff(() => fetchNetworkGroupMembers(group.sourceId!, offset, 100), ms => setPhase('groups', i + 1, groups.length, `${group.name} · rate limit ${Math.ceil(ms / 1000)}s`))
            const groupOnly = page.members.filter(member => !privateIds.has(member.telegramUserId)).map(member => ({
              key: `${member.bot ? 'group-bot' : 'group-only'}:${member.telegramUserId}`,
              telegramUserId: member.telegramUserId,
              sourceId: member.sourceId,
              name: member.deleted ? `Deleted Account (ID: ${member.telegramUserId})` : member.name,
              username: member.username,
              type: member.bot ? 'bot' : 'group-only',
              reason: member.bot ? 'Bot account found only in a group' : 'Group-only contact',
              groupSourceId: group.sourceId,
              groupName: group.name
            }))
            await saveNetworkExcluded(groupOnly)
            offset = page.nextOffset
            more = page.hasMore
            await setNetworkMeta(`group:${group.sourceId}`, { offset, complete: !more })
            await wait(230)
          }
        } catch (reason) {
          if (reason instanceof ApiError && reason.status === 401) throw reason
          const message = String((reason as Error)?.message || reason)
          failedGroups.push({ name: group.name, error: message })
          await setNetworkMeta(`group:${group.sourceId}`, { offset, complete: false, error: message })
        }
      }

      activePhase = 'analyze'
      contacts = await getNetworkContacts()
      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i]
        activeName = contact.name
        setPhase('analyze', i + 1, contacts.length, contact.name)
        const messages = await getNetworkMessages(contact.telegramUserId)
        if (!messages.length) {
          if (!contact.sync.failed) await saveNetworkExcluded([{ key: `empty:${contact.telegramUserId}`, telegramUserId: contact.telegramUserId, sourceId: contact.sourceId, name: contact.name, username: contact.username, type: 'empty', reason: 'Empty private thread' }])
          continue
        }
        const classification = classifyNetworkContact(contact, messages)
        await patchNetworkContact(contact.telegramUserId, { classification })
      }

      const allContacts = await getNetworkContacts()
      const allMessages = await getAllNetworkMessages()
      const timestamps = allMessages.map(row => Number(row.timestamp || 0)).filter(Boolean).sort((a, b) => a - b)
      const partialContacts = allContacts.filter(contact => contact.sync.failed || !contact.sync.complete).length
      const nextCoverage: NetworkCoverageSummary = {
        startedAt,
        completedAt: new Date().toISOString(),
        firstMessageAt: timestamps[0] ? new Date(timestamps[0] * 1000).toISOString() : undefined,
        lastMessageAt: timestamps.at(-1) ? new Date(timestamps.at(-1)! * 1000).toISOString() : undefined,
        failedContacts,
        failedGroups,
        partialContacts,
        note: partialContacts || failedGroups.length ? 'Coverage is partial where Telegram stopped returning history, a chat failed, or group membership could not be enumerated.' : 'The workbook reflects the full history returned by the authenticated Telegram MTProto session. Telegram remains the source of truth.'
      }
      await setNetworkMeta('coverage', nextCoverage)
      setCoverage(nextCoverage)
      setPhase('done', 1, 1)
      await refreshLocal()
    } catch (reason) {
      const message = String((reason as Error)?.message || reason)
      const stopped = { phase: activePhase, contact: activeName, message, stoppedAt: new Date().toISOString() }
      await setNetworkMeta('stopped', stopped)
      setError(`Stopped during ${phaseLabel(activePhase).toLowerCase()} at ${activeName}: ${message}`)
      setPhase('stopped', 0, 1, activeName)
      await refreshLocal()
    }
  }

  async function resetCache() {
    setMenuAnchor(null)
    await clearNetworkCache()
    setRows([])
    setExcluded([])
    setCoverage({ failedContacts: [], failedGroups: [], partialContacts: 0 })
    setProgress({ running: false, phase: 'idle', current: 0, total: 0, label: phaseLabel('idle') })
    setError('')
  }

  async function exportExcel() {
    if (!rows.length || exporting) return
    setExporting(true)
    try { await exportNetworkWorkbook(rows, excluded, coverage) }
    catch (reason) { setError(String((reason as Error)?.message || 'Could not create the Excel workbook.')) }
    finally { setExporting(false) }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter(row => !needle || `${row.name} ${row.username} ${row.company} ${row.role} ${row.category} ${row.relationshipNote}`.toLowerCase().includes(needle))
  }, [rows, query])

  const active30 = rows.filter(row => row.lastMessageAt && Date.now() - row.lastMessageAt.getTime() <= 30 * 86_400_000).length
  const unansweredMe = rows.filter(row => row.flag === 'you never replied').length
  const unansweredThem = rows.filter(row => row.flag === 'no reply from them').length
  const pct = progress.total > 0 ? Math.min(100, Math.round(progress.current / progress.total * 100)) : 0

  return <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1320, mx: 'auto' }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: 2, alignItems: { sm: 'flex-end' } }}>
      <Box><Typography variant="h1">Network</Typography><Typography sx={{ color: 'text.secondary', mt: .6 }}>Your private Telegram relationships, classified from the conversations themselves.</Typography></Box>
      <Stack direction="row" sx={{ gap: 1 }}>
        <Button variant="outlined" startIcon={exporting ? <CircularProgress size={15} /> : <DownloadRoundedIcon />} onClick={() => void exportExcel()} disabled={!rows.length || exporting}>Export Excel</Button>
        <Button variant="contained" startIcon={progress.running ? <CircularProgress size={15} color="inherit" /> : <SyncRoundedIcon />} onClick={() => void syncNetwork()} disabled={progress.running}>{rows.length ? 'Sync' : 'Build network'}</Button>
        <IconButton onClick={event => setMenuAnchor(event.currentTarget)}><MoreHorizRoundedIcon /></IconButton>
        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}><MenuItem onClick={() => void refreshLocal()}><RefreshRoundedIcon fontSize="small" sx={{ mr: 1 }} />Refresh local view</MenuItem><MenuItem onClick={() => void resetCache()}>Reset local cache</MenuItem></Menu>
      </Stack>
    </Stack>

    {progress.phase !== 'idle' ? <Box sx={{ mt: 2.5 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2, mb: .8 }}><Typography variant="body2" sx={{ fontWeight: 650 }}>{progress.label}</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>{progress.detail || (progress.total ? `${progress.current}/${progress.total}` : '')}</Typography></Stack>
      <LinearProgress variant={progress.running && !progress.total ? 'indeterminate' : 'determinate'} value={progress.phase === 'done' ? 100 : pct} sx={{ height: 4, borderRadius: 99 }} />
    </Box> : null}
    {error ? <Alert severity="warning" sx={{ mt: 2 }}>{error}</Alert> : null}

    <Stack direction="row" sx={{ mt: 3, gap: { xs: 2.5, md: 5 }, flexWrap: 'wrap' }}>
      {[['Contacts', rows.length], ['Active · 30d', active30], ['You owe replies', unansweredMe], ['Waiting on replies', unansweredThem]].map(([label, value]) => <Box key={String(label)} sx={{ minWidth: 110 }}><Typography variant="h2">{value}</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>{label}</Typography></Box>)}
    </Stack>

    <Divider sx={{ my: 2.5 }} />
    <TextField value={query} onChange={event => setQuery(event.target.value)} placeholder="Search network" sx={{ width: { xs: '100%', sm: 360 } }} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }} />

    <TableContainer component={Paper} elevation={0} sx={{ mt: 1.5, border: 1, borderColor: 'divider', overflow: 'auto' }}>
      <Table size="small" stickyHeader sx={{ minWidth: 980 }}>
        <TableHead><TableRow><TableCell>Person</TableCell><TableCell>Category</TableCell><TableCell>Company / role</TableCell><TableCell>Messages</TableCell><TableCell>Last contact</TableCell><TableCell>Flag</TableCell><TableCell>Confidence</TableCell></TableRow></TableHead>
        <TableBody>{filtered.map((row, index) => <TableRow component={motion.tr as any} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(index * .012, .18) }} hover key={row.telegramUserId} onClick={() => onOpenContact?.(row.sourceId)} sx={{ cursor: onOpenContact ? 'pointer' : 'default' }}>
          <TableCell><Typography variant="body2" sx={{ fontWeight: 650 }}>{row.name}</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>{row.username ? `@${row.username}` : `ID ${row.telegramUserId}`}</Typography></TableCell>
          <TableCell><Typography variant="body2">{row.category}</Typography>{row.secondaryCategory ? <Typography variant="caption" sx={{ color: 'text.secondary' }}>{row.secondaryCategory}</Typography> : null}</TableCell>
          <TableCell><Typography variant="body2">{row.company || 'Not set'}</Typography><Typography variant="caption" sx={{ color: 'text.secondary' }}>{row.role || 'Not set'}</Typography></TableCell>
          <TableCell>{row.totalMessages.toLocaleString()}</TableCell>
          <TableCell>{formatRelative(row.lastMessageAt)}</TableCell>
          <TableCell>{row.flag ? <Chip size="small" variant="outlined" label={row.flag} color={row.flag === 'you never replied' ? 'warning' : 'default'} /> : <Typography variant="caption" sx={{ color: 'text.disabled' }}>None</Typography>}</TableCell>
          <TableCell>{row.confidence}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>

    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.2 }}>
      Raw Telegram messages are cached in this browser before classification. {coverage.partialContacts ? `${coverage.partialContacts} private thread(s) currently have partial coverage.` : rows.length ? 'Completed threads reached the oldest messages Telegram returned.' : 'Run a sync to build the network.'}
    </Typography>
  </Box>
}
