import { useEffect, useMemo, useState } from 'react'
import { demoChannels, demoFeed } from './data/demo'
import type { AuthPrompt, Channel, FeedFilter, FeedItem } from './types'
import { loadSet, saveSet } from './lib/storage'
import { authFlow, authStatus, beginAuth, fetchFeed, healthStatus, logoutTelegram, saveTelegramPost, submitAuth } from './lib/api'
import { PromptModal } from './components/AuthModal'
import { FeedCard } from './components/FeedCard'
import { SponsoredCard } from './components/SponsoredCard'
import { BellIcon, BookmarkIcon, HomeIcon, ImageIcon, LogOutIcon, RefreshIcon, SearchIcon, SendIcon } from './components/Icons'

const APP_NAME = 'Unofficial Telegram.Social'

const nav: Array<{ id: FeedFilter; label: string; icon: typeof HomeIcon }> = [
  { id: 'all', label: 'All', icon: HomeIcon },
  { id: 'unread', label: 'Unread', icon: BellIcon },
  { id: 'saved', label: 'Saved', icon: BookmarkIcon },
  { id: 'media', label: 'Media', icon: ImageIcon }
]

type Flow = { step: string; error?: string | null; meta?: Record<string, unknown> }
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
function promptFromFlow(flow: Flow): AuthPrompt | null {
  if (flow.step === 'phone') return { type: 'phone', title: 'Your phone number', hint: 'Enter your Telegram number with country code.' }
  if (flow.step === 'code') return { type: 'code', title: 'Verification code', hint: flow.meta?.viaApp ? 'We sent the code to Telegram on your other device.' : 'Enter the code Telegram sent you.' }
  if (flow.step === 'password') return { type: 'password', title: 'Two-step verification', hint: String(flow.meta?.hint || 'Enter your Telegram password.') }
  return null
}

export default function App() {
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [query, setQuery] = useState('')
  const [channels, setChannels] = useState<Channel[]>(demoChannels)
  const [feed, setFeed] = useState<FeedItem[]>(demoFeed)
  const [mode, setMode] = useState<'demo' | 'live'>('demo')
  const [connection, setConnection] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [error, setError] = useState('')
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | null>(null)
  const [backendReady, setBackendReady] = useState(false)

  useEffect(() => {
    hydrateLocalState()
    void bootstrap()
  }, [])

  async function bootstrap() {
    try {
      const health = await healthStatus()
      if (!health.ok || !health.configured) {
        setBackendReady(false)
        setError('Telegram backend is online but not fully configured.')
        return
      }
      setBackendReady(true)
      const status = await authStatus()
      if (!status.connected) return
      setConnection('connected')
      setMode('live')
      const data = await fetchFeed()
      hydrateLiveData(data.channels, data.feed)
    } catch {
      setBackendReady(false)
      setError('Telegram backend is unavailable. Check the production backend deployment.')
    }
  }

  function hydrateLocalState() {
    const saved = loadSet('saved')
    const read = loadSet('read')
    setFeed(current => current.map(item => ({ ...item, saved: saved.has(item.id) || item.saved, unread: read.has(item.id) ? false : item.unread })))
  }

  function hydrateLiveData(nextChannels: Channel[], nextFeed: FeedItem[]) {
    const saved = loadSet('saved')
    const read = loadSet('read')
    setChannels(nextChannels)
    setFeed(nextFeed.map(item => ({ ...item, saved: saved.has(item.id), unread: read.has(item.id) ? false : item.unread })))
  }

  async function settleFlow(initial: Flow): Promise<Flow> {
    let flow = initial
    for (let i = 0; i < 25 && (flow.step === 'starting' || flow.step === 'processing'); i++) {
      await delay(400)
      flow = await authFlow()
    }
    return flow
  }

  async function finishConnection() {
    const status = await authStatus()
    if (!status.connected) throw new Error('Telegram authorization did not complete.')
    const data = await fetchFeed()
    hydrateLiveData(data.channels, data.feed)
    setMode('live')
    setConnection('connected')
    setAuthPrompt(null)
    setError('')
  }

  async function connect() {
    setError('')
    setConnection('connecting')
    try {
      const health = await healthStatus()
      if (!health.ok || !health.configured) throw new Error('Telegram backend is not fully configured yet.')
      setBackendReady(true)

      const flow = await settleFlow(await beginAuth())
      if (flow.error) setError(flow.error)
      if (flow.step === 'done') {
        await finishConnection()
        return
      }
      const prompt = promptFromFlow(flow)
      if (!prompt) throw new Error(flow.error || 'Telegram login could not start.')
      setAuthPrompt(prompt)
    } catch (e) {
      setConnection('error')
      setError(String((e as Error)?.message || e))
    }
  }

  async function submitPrompt(value: string) {
    setError('')
    try {
      const flow = await settleFlow(await submitAuth(value))
      if (flow.error) setError(flow.error)
      if (flow.step === 'done') {
        await finishConnection()
        return
      }
      if (flow.step === 'error') throw new Error(flow.error || 'Telegram login failed.')
      const prompt = promptFromFlow(flow)
      if (prompt) setAuthPrompt(prompt)
    } catch (e) {
      setConnection('error')
      setAuthPrompt(null)
      setError(String((e as Error)?.message || e))
    }
  }

  async function refresh() {
    if (mode !== 'live') return
    setConnection('connecting')
    try {
      const data = await fetchFeed()
      hydrateLiveData(data.channels, data.feed)
      setConnection('connected')
    } catch (e) {
      setConnection('error')
      setError(String((e as Error)?.message || e))
    }
  }

  async function logout() {
    await logoutTelegram().catch(() => {})
    setMode('demo')
    setConnection('idle')
    setChannels(demoChannels)
    setFeed(demoFeed)
    hydrateLocalState()
  }

  async function toggleSave(item: FeedItem) {
    const willSave = !item.saved
    setFeed(current => current.map(x => x.id === item.id ? { ...x, saved: willSave } : x))
    const saved = loadSet('saved')
    if (willSave) saved.add(item.id)
    else saved.delete(item.id)
    saveSet('saved', saved)
    if (willSave && mode === 'live') {
      try {
        await saveTelegramPost(item)
      } catch (e) {
        setError(`Saved locally. Telegram forward failed: ${String((e as Error)?.message || e)}`)
      }
    }
  }

  function markRead(item: FeedItem) {
    setFeed(current => current.map(x => x.id === item.id ? { ...x, unread: false } : x))
    const read = loadSet('read')
    read.add(item.id)
    saveSet('read', read)
  }

  const visibleFeed = useMemo(() => {
    const q = query.trim().toLowerCase()
    return feed.filter(item => {
      const channel = channels.find(c => c.id === item.channelId)
      if (filter === 'unread' && !item.unread) return false
      if (filter === 'saved' && !item.saved) return false
      if (filter === 'media' && !item.media) return false
      if (q && !`${item.text} ${channel?.title || ''} ${channel?.username || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [feed, channels, filter, query])

  const unreadTotal = feed.reduce((n, item) => n + (item.unread ? 1 : 0), 0)

  return <div className="telegram-shell">
    <aside className="chat-sidebar">
      <div className="sidebar-top">
        <button className="telegram-logo" aria-label={APP_NAME}><span className="brand-glyph">T</span></button>
        <div className="sidebar-search"><SearchIcon/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" /></div>
      </div>

      <div className="folder-tabs">
        {nav.map(entry => <button key={entry.id} className={filter === entry.id ? 'active' : ''} onClick={() => setFilter(entry.id)}>
          {entry.label}{entry.id === 'unread' && unreadTotal > 0 && <span>{unreadTotal}</span>}
        </button>)}
      </div>

      <div className="channel-list">
        {channels.map(channel => <button key={channel.id} className="channel-row" onClick={() => setQuery(channel.title)}>
          <span className="channel-avatar" style={{ background: channel.accent }}>{channel.initials}</span>
          <span className="channel-copy"><strong>{channel.title}</strong><small>{channel.username ? `@${channel.username}` : 'Telegram channel'}</small></span>
          {channel.unread > 0 && <b>{channel.unread}</b>}
        </button>)}
      </div>

      <div className="sidebar-account">
        <button onClick={mode === 'live' ? logout : connect} disabled={connection === 'connecting'}>
          {mode === 'live' ? <LogOutIcon/> : <SendIcon/>}
          <span>{connection === 'connecting' ? 'Connecting…' : mode === 'live' ? 'Disconnect' : 'Connect Telegram'}</span>
        </button>
      </div>
    </aside>

    <main className="conversation-pane">
      <header className="conversation-header">
        <div className="conversation-title">
          <span className="header-avatar"><span className="brand-glyph">T</span></span>
          <div><strong>{APP_NAME}</strong><small>{mode === 'live' ? `${channels.length} channels connected` : backendReady ? 'Ready to connect Telegram' : 'Demo mode'}</small></div>
        </div>
        <div className="conversation-actions">
          {mode === 'live' && <button className="header-icon" onClick={refresh} title="Refresh"><RefreshIcon /></button>}
          {mode === 'demo' && <button className="connect-button" onClick={connect} disabled={connection === 'connecting'}>{connection === 'connecting' ? 'Connecting…' : 'Connect'}</button>}
        </div>
      </header>

      <div className="feed-tabs">
        {nav.map(entry => { const Icon = entry.icon; return <button key={entry.id} className={filter === entry.id ? 'active' : ''} onClick={() => setFilter(entry.id)}><Icon/>{entry.label}</button> })}
      </div>

      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div>}

      <div className="message-stream">
        {visibleFeed.length ? visibleFeed.map(item => {
          const channel = channels.find(c => c.id === item.channelId)
          if (!channel) return null
          return item.sponsored ? <SponsoredCard key={item.id} item={item} channel={channel} /> : <FeedCard key={item.id} item={item} channel={channel} live={mode === 'live'} onSave={toggleSave} onRead={markRead} />
        }) : <div className="empty-state"><strong>No posts here</strong><span>Try another filter or search.</span></div>}
      </div>
    </main>

    <aside className="info-rail">
      <div className="profile-panel">
        <div className="profile-avatar"><span className="brand-glyph profile-glyph">T</span></div>
        <strong>{APP_NAME}</strong>
        <span>{mode === 'live' ? 'Connected to Telegram' : backendReady ? 'Backend ready' : 'Demo mode'}</span>
      </div>
      <div className="info-list">
        <div><span>Channels</span><strong>{channels.length}</strong></div>
        <div><span>Unread</span><strong>{unreadTotal}</strong></div>
      </div>
      <div className="info-note">A unified timeline for Telegram broadcast channels. This is an unofficial client using the Telegram API and is not affiliated with Telegram.</div>
      {mode === 'demo' ? <button className="rail-connect" onClick={connect}>Connect Telegram</button> : <button className="rail-connect secondary" onClick={logout}>Disconnect</button>}
      <div className="legal-links"><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div>
    </aside>

    <PromptModal prompt={authPrompt} onSubmit={submitPrompt} onCancel={() => { setAuthPrompt(null); setConnection('idle') }} />
  </div>
}
