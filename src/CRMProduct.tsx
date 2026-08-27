import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Briefcase,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Inbox,
  ListTodo,
  LogOut,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Users,
  X
} from 'lucide-react'
import type { Channel, FeedItem, TelegramAccount } from './types'
import { authStatus, fetchFeed, logoutTelegram, replyToTelegramPost } from './lib/api'
import { hasOpenAIKey, saveOpenAIKey, clearOpenAIKey, summarizeWithUserOpenAI } from './lib/userOpenAI'
import { loadSettings } from './lib/storage'
import { BrandMark } from './components/BrandMark'
import { loadCRMState, updateCRMContact, type CRMContactState, type CRMStage, type CRMState } from './crm/store'
import './crm.css'

type View = 'inbox' | 'pipeline' | 'contacts' | 'tasks' | 'settings'
type InboxFilter = 'attention' | 'all' | 'unread' | 'followup'

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
const stageIndex: Record<CRMStage, number> = { Lead: 0, Contacted: 1, Qualified: 2, Proposal: 3, Won: 4, Lost: 5 }

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'TG'
}

function formatActivity(ts: number) {
  if (!ts) return 'No recent activity'
  const date = new Date(ts * 1000)
  const diff = Date.now() - date.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return 'Just now'
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m`
  if (diff < day) return `${Math.floor(diff / hour)}h`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatMoney(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return ''
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function isDue(value?: string) {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && timestamp <= Date.now()
}

function formatFollowUp(value?: string) {
  if (!value) return 'Not scheduled'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not scheduled'
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function preview(item?: FeedItem) {
  if (!item) return 'No recent message loaded'
  const text = String(item.text || '').replace(/\s+/g, ' ').trim()
  if (text) return text.length > 92 ? `${text.slice(0, 89)}…` : text
  return item.media ? '[Media]' : 'Message'
}

function stageLabel(stage?: CRMStage) {
  return stage || 'Not set'
}

export default function CRMProduct() {
  const [account, setAccount] = useState<TelegramAccount | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [messages, setMessages] = useState<FeedItem[]>([])
  const [crmState, setCRMState] = useState<CRMState>(() => loadCRMState())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>('inbox')
  const [filter, setFilter] = useState<InboxFilter>('attention')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending] = useState(false)
  const [aiBusy, setAIBusy] = useState(false)
  const [aiError, setAIError] = useState('')
  const [error, setError] = useState('')
  const [keyConnected, setKeyConnected] = useState(() => hasOpenAIKey())
  const [apiKeyDraft, setApiKeyDraft] = useState('')

  const loadTelegram = useCallback(async (initial = false) => {
    if (!initial) setRefreshing(true)
    try {
      const page = await fetchFeed(null, 180)
      setChannels(page.channels)
      setMessages(page.feed)
      if (initial) {
        const people = page.channels.filter(row => row.type === 'person' || row.type === 'conversation')
        setSelectedId(current => current || people[0]?.id || null)
      }
      setError('')
    } catch (e) {
      setError(String((e as Error)?.message || 'Could not refresh Telegram.'))
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const status = await authStatus()
        if (!status.connected) { location.href = '/'; return }
        if (!active) return
        setAccount(status.user || null)
        await loadTelegram(true)
      } catch (e) {
        if (active) setError(String((e as Error)?.message || 'Could not load Telegram CRM.'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    const interval = window.setInterval(() => { void loadTelegram(false) }, 15_000)
    return () => { active = false; window.clearInterval(interval) }
  }, [loadTelegram])

  useEffect(() => {
    const handler = () => setKeyConnected(hasOpenAIKey())
    window.addEventListener('supergram:openai-key-changed', handler)
    return () => window.removeEventListener('supergram:openai-key-changed', handler)
  }, [])

  const contacts = useMemo<Contact[]>(() => {
    const lastByChannel = new Map<string, FeedItem>()
    for (const item of messages) {
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
  }, [channels, messages, crmState])

  const attentionCount = useMemo(() => contacts.filter(row => row.unread > 0 || Boolean(row.meta.nextAction) || isDue(row.meta.followUpAt)).length, [contacts])
  const unreadCount = useMemo(() => contacts.reduce((sum, row) => sum + row.unread, 0), [contacts])
  const followUpCount = useMemo(() => contacts.filter(row => Boolean(row.meta.followUpAt)).length, [contacts])
  const trackedValue = useMemo(() => contacts.reduce((sum, row) => sum + (row.meta.stage && row.meta.stage !== 'Lost' && row.meta.value !== undefined ? row.meta.value : 0), 0), [contacts])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = contacts.filter(row => {
      if (needle && !`${row.name} ${row.username || ''} ${row.meta.company || ''}`.toLowerCase().includes(needle)) return false
      if (view !== 'inbox') return true
      if (filter === 'unread') return row.unread > 0
      if (filter === 'followup') return Boolean(row.meta.followUpAt)
      if (filter === 'attention') return row.unread > 0 || Boolean(row.meta.nextAction) || isDue(row.meta.followUpAt)
      return true
    })
    if (view === 'inbox' && filter === 'attention') {
      return [...rows].sort((a, b) => {
        const score = (row: Contact) => (isDue(row.meta.followUpAt) ? 100 : 0) + (row.unread > 0 ? 50 : 0) + (row.meta.nextAction ? 20 : 0)
        return score(b) - score(a) || b.lastActivity - a.lastActivity
      })
    }
    return rows
  }, [contacts, query, view, filter])

  useEffect(() => {
    if (view !== 'inbox' || filtered.length === 0) return
    if (!selectedId || !filtered.some(row => row.id === selectedId)) setSelectedId(filtered[0].id)
  }, [filtered, selectedId, view])

  const selected = contacts.find(row => row.id === selectedId) || null
  const selectedMessages = selected
    ? messages.filter(row => row.channelId === selected.channelId).sort((a, b) => a.timestamp - b.timestamp).slice(-50)
    : []

  function patchContact(id: string, patch: Partial<CRMContactState>) {
    setCRMState(current => updateCRMContact(current, id, patch))
  }

  function moveStage(id: string, delta: number) {
    const current = crmState[id]?.stage
    const nextIndex = current === undefined ? (delta >= 0 ? 0 : stages.length - 1) : Math.max(0, Math.min(stages.length - 1, stageIndex[current] + delta))
    patchContact(id, { stage: stages[nextIndex] })
  }

  async function runRelationshipAI() {
    if (!selected) return
    if (!keyConnected) { setAIError('Add an OpenAI API key in Settings to generate a relationship brief.'); return }
    const rows = selectedMessages.filter(row => String(row.text || '').trim()).slice(-40)
    if (!rows.length) { setAIError('No message text is loaded for this relationship yet.'); return }
    setAIBusy(true)
    setAIError('')
    try {
      const text = rows.map(row => `${row.outgoing ? 'Me' : selected.name}: ${String(row.text || '').trim()}`).join('\n')
      const result = await summarizeWithUserOpenAI(text, { sourceType: 'person', sourceName: selected.name }, loadSettings())
      patchContact(selected.id, {
        brief: {
          headline: result.headline,
          summary: result.summary,
          actionItems: result.actionItems,
          decisions: result.decisions,
          confidence: result.confidence,
          updatedAt: Date.now()
        }
      })
    } catch (e) {
      setAIError(String((e as Error)?.message || 'Could not generate the relationship brief.'))
    } finally {
      setAIBusy(false)
    }
  }

  async function sendReply() {
    const value = draft.trim()
    if (!selected || !value || sending) return
    const incoming = selectedMessages.filter(row => !row.outgoing)
    const target = incoming[incoming.length - 1] || selectedMessages[selectedMessages.length - 1]
    if (!target) { setError('A Telegram message must be loaded before sending from this conversation.'); return }
    setSending(true)
    try {
      await replyToTelegramPost(target, value)
      setDraft('')
      await loadTelegram(false)
    } catch (e) {
      setError(String((e as Error)?.message || 'Could not send the Telegram reply.'))
    } finally {
      setSending(false)
    }
  }

  async function logout() {
    await logoutTelegram().catch(() => {})
    location.href = '/'
  }

  function openContact(id: string) {
    setSelectedId(id)
    setView('inbox')
    setFilter('all')
  }

  function saveAPIKey() {
    const value = apiKeyDraft.trim()
    if (!value) return
    saveOpenAIKey(value)
    setApiKeyDraft('')
    setKeyConnected(true)
  }

  if (loading) return <main className="crm-loading"><BrandMark /><strong>Loading Telegram relationships</strong><span>Restoring conversations and CRM context</span></main>

  return <div className="crm-app">
    <aside className="crm-rail">
      <a className="crm-brand" href="/" aria-label="Telegram CRM"><BrandMark /><strong>CRM</strong></a>
      <nav aria-label="Primary navigation">
        <button className={view === 'inbox' ? 'active' : ''} onClick={() => setView('inbox')}><Inbox /><span>Inbox</span>{attentionCount > 0 ? <b>{attentionCount}</b> : null}</button>
        <button className={view === 'pipeline' ? 'active' : ''} onClick={() => setView('pipeline')}><Briefcase /><span>Pipeline</span></button>
        <button className={view === 'contacts' ? 'active' : ''} onClick={() => setView('contacts')}><Users /><span>Contacts</span></button>
        <button className={view === 'tasks' ? 'active' : ''} onClick={() => setView('tasks')}><ListTodo /><span>Tasks</span></button>
      </nav>
      <div className="crm-rail-spacer" />
      <button className={`crm-settings-link ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}><Settings /><span>Settings</span></button>
      <div className="crm-account">
        <span className="crm-account-avatar">{account?.avatar ? <img src={account.avatar} alt="" /> : initials(account?.firstName || 'Telegram')}</span>
        <span><strong>{account?.firstName || 'Telegram'}</strong><small>{account?.username ? `@${account.username}` : 'Connected'}</small></span>
        <button onClick={logout} aria-label="Log out"><LogOut /></button>
      </div>
    </aside>

    <main className="crm-main">
      {error ? <div className="crm-error"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X /></button></div> : null}

      {view === 'inbox' ? <section className="crm-inbox">
        <aside className="crm-inbox-list">
          <header className="crm-list-header">
            <div><small>Telegram CRM</small><h1>Relationships</h1></div>
            <button className="crm-icon-button" onClick={() => void loadTelegram(false)} aria-label="Refresh Telegram" disabled={refreshing}><RefreshCw className={refreshing ? 'spin' : ''} /></button>
          </header>
          <label className="crm-search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search people or companies" /></label>
          <div className="crm-filters" role="tablist" aria-label="Inbox filters">
            <button className={filter === 'attention' ? 'active' : ''} onClick={() => setFilter('attention')}>Needs attention <span>{attentionCount}</span></button>
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
            <button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>Unread <span>{unreadCount}</span></button>
            <button className={filter === 'followup' ? 'active' : ''} onClick={() => setFilter('followup')}>Follow-up <span>{followUpCount}</span></button>
          </div>
          <div className="crm-contact-list">
            {filtered.length ? filtered.map(row => <button key={row.id} className={selected?.id === row.id ? 'active' : ''} onClick={() => setSelectedId(row.id)}>
              <span className="crm-avatar">{row.avatar ? <img src={row.avatar} alt="" /> : row.initials}</span>
              <span className="crm-contact-copy"><span className="crm-contact-name"><strong>{row.name}</strong>{row.meta.stage ? <em>{row.meta.stage}</em> : null}</span><small>{preview(row.latest)}</small></span>
              <span className="crm-contact-meta"><time>{formatActivity(row.lastActivity)}</time>{row.unread > 0 ? <b>{row.unread > 99 ? '99+' : row.unread}</b> : isDue(row.meta.followUpAt) ? <i /> : null}</span>
            </button>) : <div className="crm-list-empty"><strong>{filter === 'attention' ? 'Nothing needs attention.' : 'No relationships found.'}</strong><p>{filter === 'attention' ? 'Unread messages, due follow-ups, and explicit next actions will appear here.' : 'Try another search or filter.'}</p>{filter === 'attention' ? <button onClick={() => setFilter('all')}>Show all relationships</button> : null}</div>}
          </div>
        </aside>

        <section className="crm-thread">
          {selected ? <>
            <header className="crm-thread-header">
              <div className="crm-person"><span className="crm-avatar crm-avatar-lg">{selected.avatar ? <img src={selected.avatar} alt="" /> : selected.initials}</span><span><h2>{selected.name}</h2><small>{selected.username ? `@${selected.username}` : 'Telegram contact'}{selected.meta.company ? ` · ${selected.meta.company}` : ''}</small></span></div>
              <div className="crm-thread-actions">
                <button onClick={() => void runRelationshipAI()} disabled={aiBusy}><Sparkles />{aiBusy ? 'Working…' : 'Summarize'}</button>
                <button onClick={() => patchContact(selected.id, { followUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16) })}><CalendarClock />Follow up</button>
              </div>
            </header>
            {selected.meta.nextAction ? <div className="crm-next-strip"><span><small>Next action</small><strong>{selected.meta.nextAction}</strong></span><button onClick={() => patchContact(selected.id, { nextAction: undefined, followUpAt: undefined })}><Check />Done</button></div> : null}
            <div className="crm-messages">
              {selectedMessages.length ? selectedMessages.map(item => <div key={item.id} className={item.outgoing ? 'outgoing' : ''}><small>{item.outgoing ? 'You' : selected.name} · {formatActivity(item.timestamp)}</small><p>{item.text || (item.media ? '[Media]' : '')}</p></div>) : <div className="crm-thread-empty"><MessageCircle /><strong>No messages loaded yet</strong><p>Recent Telegram history will appear here when available from the connected account.</p></div>}
            </div>
            <div className="crm-composer"><textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendReply() } }} placeholder={`Message ${selected.name}`} rows={1} /><button onClick={() => void sendReply()} disabled={!draft.trim() || sending} aria-label="Send Telegram reply"><Send /></button></div>
          </> : <div className="crm-thread-empty"><Inbox /><strong>Select a relationship</strong><p>Open a Telegram conversation to see messages and CRM context.</p></div>}
        </section>

        <aside className="crm-detail">
          {selected ? <>
            <div className="crm-detail-head"><span className="crm-avatar crm-avatar-xl">{selected.avatar ? <img src={selected.avatar} alt="" /> : selected.initials}</span><h3>{selected.name}</h3><p>{selected.username ? `@${selected.username}` : 'Telegram contact'}</p></div>
            <section className="crm-detail-section crm-next-action">
              <header><small>Next action</small>{selected.meta.nextAction ? <button onClick={() => patchContact(selected.id, { nextAction: undefined, followUpAt: undefined })}>Clear</button> : null}</header>
              <input key={`${selected.id}-next-${selected.meta.nextAction || ''}`} defaultValue={selected.meta.nextAction || ''} onBlur={e => patchContact(selected.id, { nextAction: e.target.value.trim() || undefined })} placeholder="Add the next concrete action" />
              <label><CalendarClock /><input type="datetime-local" key={`${selected.id}-follow-${selected.meta.followUpAt || ''}`} defaultValue={selected.meta.followUpAt || ''} onChange={e => patchContact(selected.id, { followUpAt: e.target.value || undefined })} /></label>
            </section>
            <section className="crm-detail-section">
              <h4>CRM</h4>
              <label className="crm-field"><span>Stage</span><select value={selected.meta.stage || ''} onChange={e => patchContact(selected.id, { stage: (e.target.value || undefined) as CRMStage | undefined })}><option value="">Not set</option>{stages.map(stage => <option key={stage} value={stage}>{stage}</option>)}</select></label>
              <label className="crm-field"><span>Company</span><input key={`${selected.id}-company-${selected.meta.company || ''}`} defaultValue={selected.meta.company || ''} onBlur={e => patchContact(selected.id, { company: e.target.value.trim() || undefined })} placeholder="Not set" /></label>
              <label className="crm-field"><span>Opportunity value</span><input type="number" min="0" step="1" key={`${selected.id}-value-${selected.meta.value ?? ''}`} defaultValue={selected.meta.value ?? ''} onBlur={e => patchContact(selected.id, { value: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} placeholder="Not set" /></label>
              <label className="crm-field"><span>Owner</span><input key={`${selected.id}-owner-${selected.meta.owner || ''}`} defaultValue={selected.meta.owner || ''} onBlur={e => patchContact(selected.id, { owner: e.target.value.trim() || undefined })} placeholder="Not set" /></label>
            </section>
            <section className="crm-detail-section">
              <header><h4>AI relationship brief</h4><button className="crm-text-button" onClick={() => void runRelationshipAI()} disabled={aiBusy}><Sparkles />{selected.meta.brief ? 'Refresh' : 'Generate'}</button></header>
              {aiError ? <p className="crm-inline-error">{aiError}</p> : null}
              {selected.meta.brief ? <div className="crm-brief"><strong>{selected.meta.brief.headline}</strong><p>{selected.meta.brief.summary}</p>{selected.meta.brief.actionItems[0] ? <div className="crm-ai-suggestion"><small>Suggested next action</small><p>{selected.meta.brief.actionItems[0]}</p><button onClick={() => patchContact(selected.id, { nextAction: selected.meta.brief?.actionItems[0] })}>Use suggestion</button></div> : null}<small className="crm-confidence">Grounded in loaded conversation · {Math.round(selected.meta.brief.confidence * 100)}% model confidence</small></div> : <div className="crm-quiet-empty"><p>Generate a brief from the loaded Telegram conversation. Suggestions are never applied automatically.</p>{!keyConnected ? <button onClick={() => setView('settings')}>Set up AI</button> : null}</div>}
            </section>
            <details className="crm-detail-section crm-more-fields">
              <summary>Notes and tags</summary>
              <label className="crm-field"><span>Tags</span><input key={`${selected.id}-tags-${(selected.meta.tags || []).join(',')}`} defaultValue={(selected.meta.tags || []).join(', ')} onBlur={e => patchContact(selected.id, { tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })} placeholder="partner, investor, community" /></label>
              <label className="crm-field"><span>Notes</span><textarea key={`${selected.id}-notes-${selected.meta.notes || ''}`} defaultValue={selected.meta.notes || ''} onBlur={e => patchContact(selected.id, { notes: e.target.value.trim() || undefined })} placeholder="Private CRM notes" rows={5} /></label>
            </details>
          </> : null}
        </aside>
      </section> : null}

      {view === 'pipeline' ? <section className="crm-page">
        <header className="crm-page-header"><div><small>Pipeline</small><h1>Relationships by stage</h1><p>Only stages and values you set are shown. Telegram activity remains the source context.</p></div><div className="crm-page-stat"><small>Tracked open value</small><strong>{trackedValue ? formatMoney(trackedValue) : 'No value set'}</strong></div></header>
        <div className="crm-pipeline">{stages.map(stage => {
          const rows = contacts.filter(row => row.meta.stage === stage && `${row.name} ${row.meta.company || ''}`.toLowerCase().includes(query.toLowerCase()))
          return <div className="crm-column" key={stage}><header><strong>{stage}</strong><span>{rows.length}</span></header>{rows.map(row => <article key={row.id} onClick={() => openContact(row.id)}><div className="crm-person"><span className="crm-avatar">{row.avatar ? <img src={row.avatar} alt="" /> : row.initials}</span><span><strong>{row.name}</strong><small>{row.meta.company || row.username ? row.meta.company || `@${row.username}` : 'Telegram contact'}</small></span></div>{row.meta.value !== undefined ? <b>{formatMoney(row.meta.value)}</b> : null}{row.meta.nextAction ? <p>{row.meta.nextAction}</p> : null}<footer><small>{formatActivity(row.lastActivity)}</small><span><button onClick={e => { e.stopPropagation(); moveStage(row.id, -1) }} disabled={stage === 'Lead'} aria-label="Move backward"><ChevronLeft /></button><button onClick={e => { e.stopPropagation(); moveStage(row.id, 1) }} disabled={stage === 'Lost'} aria-label="Move forward"><ChevronRight /></button></span></footer></article>)}{rows.length === 0 ? <div className="crm-column-empty">No relationships</div> : null}</div>
        })}</div>
      </section> : null}

      {view === 'contacts' ? <section className="crm-page crm-contacts-page">
        <header className="crm-page-header"><div><small>Contacts</small><h1>{contacts.length} Telegram relationships</h1><p>CRM metadata stays attached to the Telegram peer rather than creating a duplicate address book.</p></div><label className="crm-search crm-page-search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search contacts" /></label></header>
        <div className="crm-table"><div className="crm-table-row crm-table-head"><span>Contact</span><span>Stage</span><span>Company</span><span>Next action</span><span>Last activity</span><span>Value</span></div>{filtered.map(row => <button className="crm-table-row" key={row.id} onClick={() => openContact(row.id)}><span className="crm-person"><span className="crm-avatar">{row.avatar ? <img src={row.avatar} alt="" /> : row.initials}</span><span><strong>{row.name}</strong><small>{row.username ? `@${row.username}` : 'Telegram'}</small></span></span><span>{stageLabel(row.meta.stage)}</span><span>{row.meta.company || '—'}</span><span>{row.meta.nextAction || '—'}</span><span>{formatActivity(row.lastActivity)}</span><span>{row.meta.value !== undefined ? formatMoney(row.meta.value) : '—'}</span></button>)}</div>
      </section> : null}

      {view === 'tasks' ? <section className="crm-page crm-tasks-page">
        <header className="crm-page-header"><div><small>Tasks</small><h1>Follow-up queue</h1><p>Built from explicit next actions, scheduled follow-ups, and unread Telegram conversations.</p></div><div className="crm-page-stat"><small>Needs attention</small><strong>{attentionCount}</strong></div></header>
        <div className="crm-task-list">{contacts.filter(row => row.unread > 0 || row.meta.nextAction || row.meta.followUpAt).sort((a, b) => Number(isDue(b.meta.followUpAt)) - Number(isDue(a.meta.followUpAt)) || b.unread - a.unread || b.lastActivity - a.lastActivity).map(row => <article key={row.id}><button className="crm-task-check" onClick={() => patchContact(row.id, { nextAction: undefined, followUpAt: undefined })} aria-label="Clear follow-up"><Check /></button><span className="crm-avatar">{row.avatar ? <img src={row.avatar} alt="" /> : row.initials}</span><div><strong>{row.meta.nextAction || (row.unread ? `Reply to ${row.unread} unread message${row.unread === 1 ? '' : 's'}` : 'Follow up')}</strong><p>{row.name}{row.meta.company ? ` · ${row.meta.company}` : ''}</p></div><span className={`crm-task-due ${isDue(row.meta.followUpAt) ? 'due' : ''}`}><CalendarClock />{row.meta.followUpAt ? formatFollowUp(row.meta.followUpAt) : row.unread ? 'Unread' : 'No date'}</span><button className="crm-secondary-button" onClick={() => openContact(row.id)}>Open</button></article>)}{attentionCount === 0 ? <div className="crm-page-empty"><Check /><strong>Nothing needs attention.</strong><p>Add a next action or follow-up from any Telegram relationship.</p></div> : null}</div>
      </section> : null}

      {view === 'settings' ? <section className="crm-page crm-settings-page">
        <header className="crm-page-header"><div><small>Settings</small><h1>CRM intelligence</h1><p>Keep configuration out of the normal relationship workflow.</p></div></header>
        <div className="crm-settings-group"><header><Sparkles /><span><strong>OpenAI relationship briefs</strong><small>{keyConnected ? 'Connected for this browser session' : 'Not connected'}</small></span></header><p>AI reads only the Telegram message text you explicitly summarize. It can produce a grounded brief and suggested next action, but never changes CRM fields automatically.</p>{keyConnected ? <button className="crm-danger-link" onClick={() => { clearOpenAIKey(); setKeyConnected(false) }}>Remove API key</button> : <div className="crm-key-row"><input type="password" value={apiKeyDraft} onChange={e => setApiKeyDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveAPIKey() }} placeholder="OpenAI API key" autoComplete="off" /><button onClick={saveAPIKey} disabled={!apiKeyDraft.trim()}>Connect</button></div>}</div>
        <div className="crm-settings-group"><header><Settings /><span><strong>CRM data</strong><small>Current MVP storage</small></span></header><p>Stages, values, notes, tags, follow-ups, and AI briefs are currently stored locally in this browser. Telegram remains the conversation source of truth.</p></div>
      </section> : null}
    </main>
  </div>
}
