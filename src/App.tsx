import { useEffect, useMemo, useState } from 'react'
import { demoChannels, demoFeed } from './data/demo'
import type { AuthPrompt, Channel, FeedFilter, FeedItem } from './types'
import { loadSet, saveSet } from './lib/storage'
import { authFlow, authStatus, beginAuth, fetchFeed, healthStatus, logoutTelegram, saveTelegramPost, submitAuth } from './lib/api'
import { PromptModal } from './components/AuthModal'
import { FeedCard } from './components/FeedCard'
import { SponsoredCard } from './components/SponsoredCard'
import { BellIcon, BookmarkIcon, HomeIcon, ImageIcon, LogOutIcon, RefreshIcon, SearchIcon } from './components/Icons'

const APP_NAME = 'Unofficial Telegram.Social'
const nav: Array<{ id: FeedFilter; label: string; icon: typeof HomeIcon }> = [
  { id: 'all', label: 'For you', icon: HomeIcon },
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

  useEffect(() => { hydrateLocalState(); void bootstrap() }, [])

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

      const data = await fetchFeed()
      hydrateLiveData(data.channels, data.feed)
      setConnection('connected')
      setMode('live')
    } catch (e) {
      setBackendReady(false)
      setConnection('error')
      setError(String((e as Error)?.message || 'Telegram backend is unavailable. Check the production backend deployment.'))
    }
  }

  function hydrateLocalState() {
    const saved = loadSet('saved')
    const read = loadSet('read')
    setFeed(current => (Array.isArray(current) ? current : []).map(item => ({ ...item, saved: saved.has(item.id) || item.saved, unread: read.has(item.id) ? false : item.unread })))
  }

  function hydrateLiveData(nextChannels?: Channel[], nextFeed?: FeedItem[]) {
    const saved = loadSet('saved')
    const read = loadSet('read')
    const safeChannels = Array.isArray(nextChannels) ? nextChannels : []
    const safeFeed = Array.isArray(nextFeed) ? nextFeed : []

    setChannels(safeChannels)
    setFeed(safeFeed.map(item => ({ ...item, saved: saved.has(item.id), unread: read.has(item.id) ? false : item.unread })))
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
      if (flow.step === 'done') return void await finishConnection()
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
      if (flow.step === 'done') return void await finishConnection()
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
    setFeed(current => (Array.isArray(current) ? current : []).map(x => x.id === item.id ? { ...x, saved: willSave } : x))
    const saved = loadSet('saved')
    if (willSave) saved.add(item.id); else saved.delete(item.id)
    saveSet('saved', saved)
    if (willSave && mode === 'live') {
      try { await saveTelegramPost(item) }
      catch (e) { setError(`Saved locally. Telegram forward failed: ${String((e as Error)?.message || e)}`) }
    }
  }

  function markRead(item: FeedItem) {
    setFeed(current => (Array.isArray(current) ? current : []).map(x => x.id === item.id ? { ...x, unread: false } : x))
    const read = loadSet('read'); read.add(item.id); saveSet('read', read)
  }

  const safeChannels = Array.isArray(channels) ? channels : []
  const safeFeed = Array.isArray(feed) ? feed : []

  const visibleFeed = useMemo(() => {
    const q = query.trim().toLowerCase()
    return safeFeed.filter(item => {
      const channel = safeChannels.find(c => c.id === item.channelId)
      if (filter === 'unread' && !item.unread) return false
      if (filter === 'saved' && !item.saved) return false
      if (filter === 'media' && !item.media) return false
      if (q && !`${item.text || ''} ${channel?.title || ''} ${channel?.username || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [safeFeed, safeChannels, filter, query])

  const unreadTotal = safeFeed.reduce((n, item) => n + (item.unread ? 1 : 0), 0)

  return <div className="social-app">
    <header className="social-topbar">
      <div className="social-topbar-inner">
        <a className="social-brand" href="/" aria-label={APP_NAME}><span className="brand-mark">T</span><span>Telegram.Social</span></a>
        <div className="social-search"><SearchIcon/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Telegram activity" /></div>
        <div className="social-top-actions">
          {mode === 'live' && <button className="icon-button" onClick={refresh} title="Refresh"><RefreshIcon/></button>}
          <button className="primary-connect" onClick={mode === 'live' ? logout : connect} disabled={connection === 'connecting'}>
            {mode === 'live' ? <><LogOutIcon/> Disconnect</> : connection === 'connecting' ? 'Connecting…' : 'Connect Telegram'}
          </button>
        </div>
      </div>
    </header>

    <div className="social-layout">
      <aside className="social-left">
        <nav className="feed-nav">
          {nav.map(entry => { const Icon = entry.icon; return <button key={entry.id} className={filter === entry.id ? 'active' : ''} onClick={() => setFilter(entry.id)}><Icon/><span>{entry.label}</span>{entry.id === 'unread' && unreadTotal > 0 && <b>{unreadTotal}</b>}</button> })}
        </nav>
        <div className="left-note"><strong>Telegram, without the inbox.</strong><span>One calm feed built from the conversations, groups, and channels already in your account.</span></div>
        <div className="legal-links"><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div>
      </aside>

      <main className="social-feed-column">
        <section className="feed-intro">
          <div><span className="feed-kicker">YOUR TELEGRAM FEED</span><h1>What’s happening</h1><p>{mode === 'live' ? `${safeChannels.length} sources connected` : backendReady ? 'Connect Telegram to turn your activity into one feed.' : 'Previewing the feed in demo mode.'}</p></div>
          <span className={`connection-dot ${backendReady ? 'online' : ''}`}></span>
        </section>

        <div className="mobile-feed-tabs">
          {nav.map(entry => <button key={entry.id} className={filter === entry.id ? 'active' : ''} onClick={() => setFilter(entry.id)}>{entry.label}</button>)}
        </div>

        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div>}

        <div className="message-stream social-stream">
          {visibleFeed.length ? visibleFeed.map(item => {
            const channel = safeChannels.find(c => c.id === item.channelId)
            if (!channel) return null
            return item.sponsored ? <SponsoredCard key={item.id} item={item} channel={channel} /> : <FeedCard key={item.id} item={item} channel={channel} live={mode === 'live'} onSave={toggleSave} onRead={markRead} />
          }) : <div className="empty-state"><strong>No activity here</strong><span>Try another feed or search.</span></div>}
        </div>
      </main>

      <aside className="social-right">
        <section className="side-card">
          <div className="side-card-heading"><strong>Sources</strong><span>{safeChannels.length}</span></div>
          <div className="channel-stack">
            {safeChannels.slice(0, 7).map(channel => <button key={channel.id} onClick={() => setQuery(channel.title)}>
              <span className="channel-avatar small" style={{ background: channel.accent }}>{channel.initials}</span>
              <span><strong>{channel.title}</strong><small>{channel.username ? `@${channel.username}` : 'Telegram'}</small></span>
              {channel.unread > 0 && <b>{channel.unread}</b>}
            </button>)}
          </div>
        </section>
        <section className="side-card compact-card">
          <strong>{mode === 'live' ? 'Telegram connected' : 'Bring your Telegram here'}</strong>
          <p>{mode === 'live' ? 'Your feed combines recent activity across Telegram. Refresh to pull the latest messages.' : 'Sign in with your Telegram account and turn recent activity into one scrollable feed.'}</p>
          {mode === 'demo' && <button className="side-connect" onClick={connect}>Connect Telegram</button>}
        </section>
        <p className="unofficial-note">Unofficial client using the Telegram API. Not affiliated with Telegram.</p>
      </aside>
    </div>

    <PromptModal prompt={authPrompt} onSubmit={submitPrompt} onCancel={() => { setAuthPrompt(null); setConnection('idle') }} />
  </div>
}
