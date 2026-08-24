import { useEffect, useMemo, useState } from 'react'
import { demoChannels, demoFeed } from './data/demo'
import type { AuthPrompt, Channel, FeedFilter, FeedItem } from './types'
import { loadSet, saveSet } from './lib/storage'
import { authFlow, authStatus, beginAuth, fetchFeed, healthStatus, logoutTelegram, saveTelegramPost, submitAuth } from './lib/api'
import { PromptModal } from './components/AuthModal'
import { FeedCard } from './components/FeedCard'
import { SponsoredCard } from './components/SponsoredCard'
import { BellIcon, BookmarkIcon, HomeIcon, ImageIcon, LogOutIcon, RefreshIcon, SearchIcon, SettingsIcon } from './components/Icons'

const nav: Array<{ id: FeedFilter; label: string; icon: typeof HomeIcon }> = [
  { id: 'all', label: 'Home', icon: HomeIcon },
  { id: 'unread', label: 'Unread', icon: BellIcon },
  { id: 'saved', label: 'Saved', icon: BookmarkIcon },
  { id: 'media', label: 'Media', icon: ImageIcon }
]

type Flow = { step: string; error?: string | null; meta?: Record<string, unknown> }
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
function promptFromFlow(flow: Flow): AuthPrompt | null {
  if (flow.step === 'phone') return { type: 'phone', title: 'Your Telegram number', hint: 'Include country code, for example +91…' }
  if (flow.step === 'code') return { type: 'code', title: 'Enter the Telegram code', hint: flow.meta?.viaApp ? 'Check Telegram on another signed-in device.' : 'Enter the code Telegram sent you.' }
  if (flow.step === 'password') return { type: 'password', title: 'Two-step verification', hint: String(flow.meta?.hint || 'Enter your Telegram 2FA password.') }
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

  useEffect(() => {
    hydrateLocalState()
    authStatus().then(async status => {
      if (!status.connected) return
      setConnection('connected'); setMode('live')
      const data = await fetchFeed()
      hydrateLiveData(data.channels, data.feed)
    }).catch(() => {})
  }, [])

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
    setMode('live'); setConnection('connected'); setAuthPrompt(null); setError('')
  }

  async function connect() {
    setError(''); setConnection('connecting')
    try {
      const health = await healthStatus()
      if (!health.ok || !health.configured) {
        throw new Error(health.configured
          ? 'Telegram API server is unavailable on this deployment.'
          : 'Telegram server credentials are not configured. Check TELEGRAM_API_ID and TELEGRAM_API_HASH in Vercel.')
      }
      const flow = await settleFlow(await beginAuth())
      if (flow.error) setError(flow.error)
      if (flow.step === 'done') { await finishConnection(); return }
      const prompt = promptFromFlow(flow)
      if (!prompt) throw new Error(flow.error || 'Telegram login could not start.')
      setAuthPrompt(prompt)
    } catch (e) {
      setConnection('error'); setError(String((e as Error)?.message || e))
    }
  }

  async function submitPrompt(value: string) {
    setError('')
    try {
      const flow = await settleFlow(await submitAuth(value))
      if (flow.error) setError(flow.error)
      if (flow.step === 'done') { await finishConnection(); return }
      if (flow.step === 'error') throw new Error(flow.error || 'Telegram login failed.')
      const prompt = promptFromFlow(flow)
      if (prompt) setAuthPrompt(prompt)
    } catch (e) {
      setConnection('error'); setAuthPrompt(null); setError(String((e as Error)?.message || e))
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
      setConnection('error'); setError(String((e as Error)?.message || e))
    }
  }

  async function logout() {
    await logoutTelegram().catch(() => {})
    setMode('demo'); setConnection('idle'); setChannels(demoChannels); setFeed(demoFeed); hydrateLocalState()
  }

  async function toggleSave(item: FeedItem) {
    const willSave = !item.saved
    setFeed(current => current.map(x => x.id === item.id ? { ...x, saved: willSave } : x))
    const saved = loadSet('saved')
    if (willSave) saved.add(item.id); else saved.delete(item.id)
    saveSet('saved', saved)
    if (willSave && mode === 'live') {
      try { await saveTelegramPost(item) }
      catch (e) { setError(`Saved locally. Telegram forward failed: ${String((e as Error)?.message || e)}`) }
    }
  }

  function markRead(item: FeedItem) {
    setFeed(current => current.map(x => x.id === item.id ? { ...x, unread: false } : x))
    const read = loadSet('read'); read.add(item.id); saveSet('read', read)
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
  const savedTotal = feed.reduce((n, item) => n + (item.saved ? 1 : 0), 0)

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">T</div><span>Telegram.Social</span></div>
      <nav className="main-nav">
        {nav.map(entry => {
          const Icon = entry.icon
          const badge = entry.id === 'unread' ? unreadTotal : entry.id === 'saved' ? savedTotal : 0
          return <button key={entry.id} className={filter === entry.id ? 'active' : ''} onClick={() => setFilter(entry.id)}><Icon/><span>{entry.label}</span>{badge > 0 && <b>{badge}</b>}</button>
        })}
      </nav>
      <div className="sidebar-label">YOUR CHANNELS</div>
      <div className="channel-list">
        {channels.slice(0, 8).map(channel => <button key={channel.id} onClick={() => setQuery(channel.title)}>
          <span className="mini-avatar" style={{ background: channel.accent }}>{channel.initials}</span>
          <span className="channel-name">{channel.title}</span>
          {channel.unread > 0 && <b>{channel.unread}</b>}
        </button>)}
      </div>
      <div className="sidebar-footer"><button onClick={mode === 'live' ? logout : connect}>{mode === 'live' ? <LogOutIcon/> : <SettingsIcon/>}{mode === 'live' ? 'Disconnect' : 'Connect Telegram'}</button></div>
    </aside>

    <main className="feed-column">
      <header className="topbar">
        <div>
          <div className="mobile-brand">Telegram.Social</div>
          <h1>{filter === 'all' ? 'Your feed' : nav.find(x => x.id === filter)?.label}</h1>
          <p>{mode === 'live' ? `${channels.length} Telegram channels` : 'Demo feed · connect Telegram when ready'}</p>
        </div>
        <div className="topbar-actions">
          {mode === 'live' && <button className="round-button" onClick={refresh} title="Refresh"><RefreshIcon /></button>}
          <button className={`connection-pill ${connection}`} onClick={mode === 'live' ? undefined : connect} disabled={connection === 'connecting'}>
            <span className="status-dot" />{connection === 'connecting' ? 'Connecting…' : mode === 'live' ? 'Telegram connected' : 'Connect Telegram'}
          </button>
        </div>
      </header>

      <div className="mobile-nav">{nav.map(entry => { const Icon = entry.icon; return <button key={entry.id} className={filter === entry.id ? 'active' : ''} onClick={() => setFilter(entry.id)}><Icon/><span>{entry.label}</span></button> })}</div>
      <div className="search-wrap"><SearchIcon/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search across every channel" />{query && <button onClick={() => setQuery('')}>Clear</button>}</div>
      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div>}

      <div className="feed-list">
        {visibleFeed.length ? visibleFeed.map(item => {
          const channel = channels.find(c => c.id === item.channelId)
          if (!channel) return null
          return item.sponsored ? <SponsoredCard key={item.id} item={item} channel={channel} /> : <FeedCard key={item.id} item={item} channel={channel} live={mode === 'live'} onSave={toggleSave} onRead={markRead} />
        }) : <div className="empty-state"><strong>Nothing here yet.</strong><span>Try another filter or clear the search.</span></div>}
      </div>
    </main>

    <aside className="right-rail">
      <div className="rail-card intro-card">
        <span className="eyebrow">THE SIGNAL LAYER</span>
        <h2>Telegram is the inbox.<br/>This is the feed.</h2>
        <p>One timeline for every channel you follow. No groups. No DMs. No channel hopping.</p>
        {mode === 'demo' ? <button className="primary-button" onClick={connect}>Connect Telegram</button> : <button className="secondary-button" onClick={logout}><LogOutIcon/>Disconnect</button>}
      </div>
      <div className="rail-card stats-card"><div><span>Channels</span><strong>{channels.length}</strong></div><div><span>Unread</span><strong>{unreadTotal}</strong></div><div><span>Saved</span><strong>{savedTotal}</strong></div></div>
      <div className="rail-card privacy-card"><span className="eyebrow">SESSION DESIGN</span><p>The live Telegram session is encrypted into an HttpOnly browser cookie. The server holds the Telegram application credentials, not your frontend.</p></div>
      <div className="rail-links"><span>V0.1</span><span>Telegram MTProto</span></div>
    </aside>

    <PromptModal prompt={authPrompt} onSubmit={submitPrompt} onCancel={() => { setAuthPrompt(null); setConnection('idle') }} />
  </div>
}
