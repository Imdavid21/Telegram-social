import { useEffect, useMemo, useState } from 'react'
import type { Channel, FeedItem, TelegramAccount } from './types'
import { authStatus, fetchFeed, logoutTelegram } from './lib/api'
import { BrandMark } from './components/BrandMark'
import './crm.css'

type Stage = 'Lead' | 'Contacted' | 'Qualified' | 'Proposal' | 'Won' | 'Lost'
type Contact = {
  id: string
  channelId: string
  name: string
  username?: string
  avatar?: string
  initials: string
  stage: Stage
  value: number
  lastActivity: number
  unread: number
  notes: string[]
  tags: string[]
}

const stages: Stage[] = ['Lead', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost']
const stageIndex: Record<Stage, number> = { Lead: 0, Contacted: 1, Qualified: 2, Proposal: 3, Won: 4, Lost: 5 }

function guessStage(index: number): Stage {
  return ['Lead', 'Contacted', 'Qualified', 'Proposal'][index % 4] as Stage
}

function formatDate(ts: number) {
  if (!ts) return 'No activity'
  const d = new Date(ts * 1000)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function money(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export default function CRMProduct() {
  const [account, setAccount] = useState<TelegramAccount | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [messages, setMessages] = useState<FeedItem[]>([])
  const [stagesById, setStagesById] = useState<Record<string, Stage>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'inbox' | 'pipeline' | 'contacts' | 'tasks'>('inbox')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const status = await authStatus()
        if (!status.connected) { location.href = '/'; return }
        const page = await fetchFeed(null, 120)
        if (!active) return
        setAccount(status.user || null)
        setChannels(page.channels)
        setMessages(page.feed)
        const people = page.channels.filter(row => row.type === 'person' || row.type === 'conversation')
        const initial: Record<string, Stage> = {}
        people.forEach((row, index) => { initial[row.id] = guessStage(index) })
        setStagesById(initial)
        setSelectedId(people[0]?.id || null)
      } catch (e) {
        setError(String((e as Error)?.message || 'Could not load Telegram CRM.'))
      } finally {
        setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const contacts = useMemo<Contact[]>(() => {
    const lastByChannel = new Map<string, FeedItem>()
    for (const item of messages) {
      const current = lastByChannel.get(item.channelId)
      if (!current || item.timestamp > current.timestamp) lastByChannel.set(item.channelId, item)
    }
    return channels
      .filter(row => row.type === 'person' || row.type === 'conversation')
      .map((row, index) => ({
        id: row.id,
        channelId: row.id,
        name: row.title,
        username: row.username,
        avatar: row.avatar,
        initials: row.initials || row.title.slice(0, 2).toUpperCase(),
        stage: stagesById[row.id] || guessStage(index),
        value: 1500 + ((index * 1750) % 18000),
        lastActivity: lastByChannel.get(row.id)?.timestamp || 0,
        unread: row.unread || 0,
        notes: [],
        tags: index % 3 === 0 ? ['priority'] : index % 3 === 1 ? ['follow-up'] : ['network']
      }))
      .sort((a, b) => b.lastActivity - a.lastActivity)
  }, [channels, messages, stagesById])

  const filtered = contacts.filter(row => `${row.name} ${row.username || ''}`.toLowerCase().includes(query.toLowerCase()))
  const selected = contacts.find(row => row.id === selectedId) || filtered[0] || null
  const selectedMessages = selected ? messages.filter(row => row.channelId === selected.channelId).sort((a, b) => a.timestamp - b.timestamp).slice(-16) : []
  const pipelineValue = contacts.filter(row => row.stage !== 'Lost').reduce((sum, row) => sum + row.value, 0)
  const unread = contacts.reduce((sum, row) => sum + row.unread, 0)
  const followups = contacts.filter(row => ['Contacted', 'Qualified', 'Proposal'].includes(row.stage)).length

  function moveStage(id: string, delta: number) {
    setStagesById(current => {
      const now = current[id] || 'Lead'
      const next = stages[Math.max(0, Math.min(stages.length - 1, stageIndex[now] + delta))]
      return { ...current, [id]: next }
    })
  }

  async function logout() {
    await logoutTelegram().catch(() => {})
    location.href = '/'
  }

  if (loading) return <main className="crm-loading"><BrandMark /><strong>Building your CRM from Telegram</strong></main>

  return <div className="crm-app">
    <aside className="crm-rail">
      <div className="crm-brand"><BrandMark /><strong>Telegram CRM</strong></div>
      <nav>
        {(['inbox','pipeline','contacts','tasks'] as const).map(item => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}{item === 'inbox' && unread > 0 ? <span>{unread > 99 ? '99+' : unread}</span> : null}</button>)}
      </nav>
      <div className="crm-account"><div>{account?.avatar ? <img src={account.avatar} alt="" /> : account?.firstName?.slice(0,1) || 'T'}</div><span><strong>{account?.firstName || 'Telegram'}</strong><small>@{account?.username || 'account'}</small></span></div>
      <button className="crm-logout" onClick={logout}>Log out</button>
    </aside>

    <main className="crm-main">
      <header className="crm-topbar">
        <div><h1>{view === 'pipeline' ? 'Pipeline' : view === 'contacts' ? 'Contacts' : view === 'tasks' ? 'Tasks' : 'Relationship inbox'}</h1><p>Telegram conversations turned into relationship context.</p></div>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search people" />
      </header>
      {error ? <div className="crm-error">{error}</div> : null}

      {view === 'pipeline' ? <section className="crm-pipeline">{stages.slice(0,5).map(stage => <div className="crm-column" key={stage}><header><strong>{stage}</strong><span>{filtered.filter(row => row.stage === stage).length}</span></header>{filtered.filter(row => row.stage === stage).map(row => <article key={row.id} onClick={() => setSelectedId(row.id)}><div className="crm-person"><span>{row.avatar ? <img src={row.avatar} alt="" /> : row.initials}</span><div><strong>{row.name}</strong><small>{row.username ? `@${row.username}` : 'Telegram contact'}</small></div></div><b>{money(row.value)}</b><small>Last activity {formatDate(row.lastActivity)}</small><div className="crm-card-actions"><button onClick={e => { e.stopPropagation(); moveStage(row.id,-1) }}>←</button><button onClick={e => { e.stopPropagation(); moveStage(row.id,1) }}>→</button></div></article>)}</div>)}</section> :
      <section className="crm-workspace">
        <div className="crm-list">
          <div className="crm-metrics"><div><small>Pipeline</small><strong>{money(pipelineValue)}</strong></div><div><small>Follow-ups</small><strong>{followups}</strong></div><div><small>Unread</small><strong>{unread}</strong></div></div>
          {filtered.map(row => <button key={row.id} className={selected?.id === row.id ? 'active' : ''} onClick={() => setSelectedId(row.id)}><span className="crm-avatar">{row.avatar ? <img src={row.avatar} alt="" /> : row.initials}</span><span className="crm-list-copy"><strong>{row.name}</strong><small>{row.stage} · {formatDate(row.lastActivity)}</small></span>{row.unread > 0 ? <b>{row.unread}</b> : null}</button>)}
        </div>

        <div className="crm-thread">
          {selected ? <><header><div className="crm-person"><span>{selected.avatar ? <img src={selected.avatar} alt="" /> : selected.initials}</span><div><h2>{selected.name}</h2><small>{selected.username ? `@${selected.username}` : 'Telegram contact'}</small></div></div><div className="crm-stage"><button onClick={() => moveStage(selected.id,-1)}>←</button><strong>{selected.stage}</strong><button onClick={() => moveStage(selected.id,1)}>→</button></div></header>
          <div className="crm-ai"><small>CRM context</small><strong>{selectedMessages.length ? `Recent conversation with ${selected.name}` : `No recent messages loaded for ${selected.name}`}</strong><p>{selectedMessages.slice(-5).map(row => row.text).filter(Boolean).join(' ').slice(0,360) || 'Use this space for AI summaries, relationship history, intent, objections, and next-best action.'}</p></div>
          <div className="crm-messages">{selectedMessages.map(item => <div key={item.id} className={item.outgoing ? 'outgoing' : ''}><small>{item.outgoing ? 'You' : selected.name} · {formatDate(item.timestamp)}</small><p>{item.text || '[media]'}</p></div>)}</div></> : <div className="crm-empty">Select a contact</div>}
        </div>

        <aside className="crm-detail">
          {selected ? <><div className="crm-detail-person"><span>{selected.avatar ? <img src={selected.avatar} alt="" /> : selected.initials}</span><h3>{selected.name}</h3><p>{selected.username ? `@${selected.username}` : 'Telegram contact'}</p></div><dl><div><dt>Stage</dt><dd>{selected.stage}</dd></div><div><dt>Value</dt><dd>{money(selected.value)}</dd></div><div><dt>Unread</dt><dd>{selected.unread}</dd></div><div><dt>Last activity</dt><dd>{formatDate(selected.lastActivity)}</dd></div></dl><section><small>Tags</small><div className="crm-tags">{selected.tags.map(tag => <span key={tag}>{tag}</span>)}</div></section><section><small>Next action</small><p>{selected.stage === 'Lead' ? 'Qualify the relationship and record intent.' : selected.stage === 'Contacted' ? 'Follow up with a concrete next step.' : selected.stage === 'Qualified' ? 'Move toward a proposal or commitment.' : selected.stage === 'Proposal' ? 'Resolve blockers and close.' : 'Maintain relationship context.'}</p></section></> : null}
        </aside>
      </section>}
    </main>
  </div>
}
