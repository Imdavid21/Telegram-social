import { useEffect, useMemo, useRef, useState } from 'react'
import type { AuthPrompt, Channel, FeedFilter, FeedItem } from './types'
import { loadSet, saveSet } from './lib/storage'
import { authFlow, authStatus, beginAuth, fetchFeed, healthStatus, logoutTelegram, saveTelegramPost, submitAuth } from './lib/api'
import { PromptModal } from './components/AuthModal'
import { FeedCard } from './components/FeedCard'
import { SponsoredCard } from './components/SponsoredCard'
import { BellIcon, BookmarkIcon, CloseIcon, HomeIcon, ImageIcon, LogOutIcon, MoonIcon, RefreshIcon, SearchIcon, SettingsIcon, SunIcon } from './components/Icons'

const APP_NAME = 'Supergram'
const PAGE_SIZE = 24
const nav: Array<{ id: FeedFilter; label: string; icon: typeof HomeIcon }> = [
  { id: 'all', label: 'Home', icon: HomeIcon },
  { id: 'unread', label: 'Unread', icon: BellIcon },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'saved', label: 'Saved', icon: BookmarkIcon }
]

type Flow = { step: string; error?: string | null; meta?: Record<string, unknown> }
type Me = { id: string; firstName: string; username?: string }
type Theme = 'dark' | 'light'
type QueuedFeed = { channels: Channel[]; feed: FeedItem[] } | null
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function promptFromFlow(flow: Flow): AuthPrompt | null {
  if (flow.step === 'phone') return { type: 'phone', title: 'Your phone number', hint: 'Enter your Telegram number with country code.' }
  if (flow.step === 'code') return { type: 'code', title: 'Verification code', hint: flow.meta?.viaApp ? 'We sent the code to Telegram on your other device.' : 'Enter the code Telegram sent you.' }
  if (flow.step === 'password') return { type: 'password', title: 'Two-step verification', hint: String(flow.meta?.hint || 'Enter your Telegram password.') }
  return null
}

function safeTheme(): Theme {
  try {
    const stored = localStorage.getItem('supergram-theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function initials(value?: string) {
  return String(value || 'SG').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'SG'
}

function SourceBubble({ channel, active, onClick }: { channel: Channel; active: boolean; onClick: () => void }) {
  const [failed, setFailed] = useState(false)
  return <button type="button" className={`sg-source-bubble ${active ? 'is-active' : ''}`} onClick={onClick} title={channel.title}>
    <span className="sg-source-ring">
      <span className="sg-source-avatar" style={{ background: channel.accent || '#2AABEE' }}>
        {channel.avatar && !failed ? <img src={channel.avatar} alt="" onError={() => setFailed(true)} /> : channel.initials || initials(channel.title)}
      </span>
    </span>
    <span>{channel.title}</span>
  </button>
}

export default function App() {
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [mode, setMode] = useState<'demo' | 'live'>('demo')
  const [connection, setConnection] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [error, setError] = useState('')
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | null>(null)
  const [backendReady, setBackendReady] = useState(false)
  const [booting, setBooting] = useState(true)
  const [me, setMe] = useState<Me | null>(null)
  const [theme, setTheme] = useState<Theme>(() => safeTheme())
  const [searchOpen, setSearchOpen] = useState(false)
  const [renderLimit, setRenderLimit] = useState(PAGE_SIZE)
  const [queuedFeed, setQueuedFeed] = useState<QueuedFeed>(null)
  const [newCount, setNewCount] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const scrollPositions = useRef<Record<FeedFilter, number>>({ all: 0, unread: 0, saved: 0, media: 0 })
  const keyboardIndex = useRef(0)

  const safeChannels = Array.isArray(channels) ? channels : []
  const safeFeed = Array.isArray(feed) ? feed : []

  useEffect(() => { void bootstrap() }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try { localStorage.setItem('supergram-theme', theme) } catch {}
  }, [theme])

  useEffect(() => {
    if (!searchOpen) return
    const timer = window.setTimeout(() => searchInput.current?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [searchOpen])

  async function bootstrap() {
    setBooting(true)
    try {
      const health = await healthStatus()
      if (!health.ok || !health.configured) {
        setBackendReady(false)
        setError('Telegram backend is online but not fully configured.')
        return
      }
      setBackendReady(true)
      const status = await authStatus()
      setMe(status.user || null)
      if (!status.connected) return

      const data = await fetchFeed()
      hydrateLiveData(data.channels, data.feed)
      setConnection('connected')
      setMode('live')
      setLastRefresh(Date.now())
    } catch (e) {
      setConnection('error')
      setError(String((e as Error)?.message || 'Could not load Supergram.'))
    } finally {
      setBooting(false)
    }
  }

  function hydrateLiveData(nextChannels?: Channel[], nextFeed?: FeedItem[]) {
    const saved = loadSet('saved')
    const read = loadSet('read')
    const safeNextChannels = Array.isArray(nextChannels) ? nextChannels.filter(Boolean) : []
    const safeNextFeed = Array.isArray(nextFeed) ? nextFeed.filter(Boolean) : []

    setChannels(safeNextChannels)
    setFeed(safeNextFeed.map(item => ({
      ...item,
      text: String(item?.text || ''),
      reactions: Array.isArray(item?.reactions) ? item.reactions : [],
      saved: saved.has(item.id) || Boolean(item.saved),
      unread: read.has(item.id) ? false : Boolean(item.unread)
    })))
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
    setMe(status.user || null)
    setMode('live')
    setConnection('connected')
    setAuthPrompt(null)
    setError('')
    setLastRefresh(Date.now())
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

  async function refresh(quiet = false) {
    if (mode !== 'live') return
    if (!quiet) setConnection('connecting')
    try {
      const data = await fetchFeed()
      const nextChannels = Array.isArray(data.channels) ? data.channels : []
      const nextFeed = Array.isArray(data.feed) ? data.feed : []
      const currentIds = new Set(safeFeed.map(item => item.id))
      const incoming = nextFeed.filter(item => !currentIds.has(item.id)).length

      if (incoming > 0 && window.scrollY > 420) {
        setQueuedFeed({ channels: nextChannels, feed: nextFeed })
        setNewCount(incoming)
      } else {
        hydrateLiveData(nextChannels, nextFeed)
        setQueuedFeed(null)
        setNewCount(0)
      }
      setLastRefresh(Date.now())
      setConnection('connected')
    } catch (e) {
      setConnection('error')
      if (!quiet) setError(String((e as Error)?.message || e))
    }
  }

  function applyQueuedFeed() {
    if (!queuedFeed) return
    hydrateLiveData(queuedFeed.channels, queuedFeed.feed)
    setQueuedFeed(null)
    setNewCount(0)
    setRenderLimit(PAGE_SIZE)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function logout() {
    await logoutTelegram().catch(() => {})
    setMode('demo')
    setConnection('idle')
    setChannels([])
    setFeed([])
    setMe(null)
    setSourceFilter(null)
    setQuery('')
    setQueuedFeed(null)
    setNewCount(0)
  }

  async function toggleSave(item: FeedItem) {
    const willSave = !item.saved
    setFeed(current => (Array.isArray(current) ? current : []).map(row => row.id === item.id ? { ...row, saved: willSave } : row))
    const saved = loadSet('saved')
    if (willSave) saved.add(item.id); else saved.delete(item.id)
    saveSet('saved', saved)
    if (willSave && mode === 'live') {
      try { await saveTelegramPost(item) }
      catch (e) { setError(`Saved in Supergram. Telegram forward failed: ${String((e as Error)?.message || e)}`) }
    }
  }

  function markRead(item: FeedItem) {
    setFeed(current => (Array.isArray(current) ? current : []).map(row => row.id === item.id ? { ...row, unread: false } : row))
    const read = loadSet('read')
    read.add(item.id)
    saveSet('read', read)
  }

  function changeFilter(next: FeedFilter) {
    scrollPositions.current[filter] = window.scrollY
    setFilter(next)
    setSourceFilter(null)
    setRenderLimit(PAGE_SIZE)
    keyboardIndex.current = 0
    requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[next] || 0 }))
  }

  function selectSource(id: string | null) {
    setSourceFilter(current => current === id ? null : id)
    setFilter('all')
    setRenderLimit(PAGE_SIZE)
    keyboardIndex.current = 0
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const visibleFeed = useMemo(() => {
    const q = query.trim().toLowerCase()
    return safeFeed.filter(item => {
      const channel = safeChannels.find(source => source.id === item.channelId)
      if (!channel) return false
      if (sourceFilter && channel.id !== sourceFilter) return false
      if (filter === 'unread' && !item.unread) return false
      if (filter === 'saved' && !item.saved) return false
      if (filter === 'media' && !item.media) return false
      if (q && !`${item.text || ''} ${channel.title || ''} ${channel.username || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [safeFeed, safeChannels, filter, query, sourceFilter])

  const renderedFeed = visibleFeed.slice(0, renderLimit)
  const unreadTotal = safeFeed.reduce((total, item) => total + (item.unread ? 1 : 0), 0)
  const topSources = useMemo(() => [...safeChannels].sort((a, b) => Number(b.unread || 0) - Number(a.unread || 0)).slice(0, 12), [safeChannels])
  const searchSources = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (q ? safeChannels.filter(channel => `${channel.title} ${channel.username || ''}`.toLowerCase().includes(q)) : topSources).slice(0, 8)
  }, [query, safeChannels, topSources])

  useEffect(() => {
    setRenderLimit(PAGE_SIZE)
  }, [filter, query, sourceFilter])

  useEffect(() => {
    const el = endRef.current
    if (!el || renderLimit >= visibleFeed.length || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setRenderLimit(current => Math.min(current + PAGE_SIZE, visibleFeed.length))
    }, { rootMargin: '1000px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [renderLimit, visibleFeed.length])

  useEffect(() => {
    if (mode !== 'live') return
    const interval = window.setInterval(() => { void refresh(true) }, 60_000)
    return () => window.clearInterval(interval)
  }, [mode, safeFeed.length])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        if (event.key === 'Escape') setSearchOpen(false)
        return
      }
      if (event.key === '/') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
        return
      }
      if (!renderedFeed.length) return
      if (event.key.toLowerCase() === 'j' || event.key.toLowerCase() === 'k') {
        event.preventDefault()
        const delta = event.key.toLowerCase() === 'j' ? 1 : -1
        keyboardIndex.current = Math.max(0, Math.min(renderedFeed.length - 1, keyboardIndex.current + delta))
        const selector = `[data-feed-index="${keyboardIndex.current}"]`
        document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      if (event.key.toLowerCase() === 's') {
        const item = renderedFeed[keyboardIndex.current]
        if (item) void toggleSave(item)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [renderedFeed])

  if (mode !== 'live') {
    return <div className="sg-auth-shell">
      <div className="sg-auth-card">
        <div className="sg-mark sg-mark-large" aria-hidden="true"><span>S</span></div>
        <h1>Supergram</h1>
        <p className="sg-auth-lead">Your Telegram. One endless feed.</p>
        <p className="sg-auth-copy">Turn the conversations, groups, and channels you already follow into a media-first scroll.</p>
        {error && <div className="sg-inline-error">{error}</div>}
        <button type="button" className="sg-connect-button" onClick={connect} disabled={booting || connection === 'connecting' || !backendReady}>
          {booting ? 'Checking backend…' : connection === 'connecting' ? 'Connecting…' : 'Continue with Telegram'}
        </button>
        <div className="sg-auth-status"><span className={backendReady ? 'is-online' : ''} />{backendReady ? 'Telegram API ready' : booting ? 'Checking connection' : 'Backend unavailable'}</div>
        <small>Supergram is an unofficial client using the Telegram API and is not affiliated with Telegram.</small>
        <div className="sg-auth-links"><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div>
      </div>
      <PromptModal prompt={authPrompt} onSubmit={submitPrompt} onCancel={() => { setAuthPrompt(null); setConnection('idle') }} />
    </div>
  }

  return <div className="sg-app">
    <aside className="sg-left-rail">
      <a className="sg-brand" href="/" aria-label={APP_NAME}><span className="sg-mark"><span>S</span></span><strong>Supergram</strong></a>
      <nav className="sg-primary-nav">
        {nav.map(entry => {
          const Icon = entry.icon
          const count = entry.id === 'unread' ? unreadTotal : 0
          return <button type="button" key={entry.id} className={filter === entry.id && !sourceFilter ? 'is-active' : ''} onClick={() => changeFilter(entry.id)}>
            <span className="sg-nav-icon"><Icon />{count > 0 && <b>{count > 99 ? '99+' : count}</b>}</span><span>{entry.label}</span>
          </button>
        })}
        <button type="button" className={searchOpen || query ? 'is-active' : ''} onClick={() => setSearchOpen(true)}><span className="sg-nav-icon"><SearchIcon /></span><span>Search</span></button>
      </nav>

      <div className="sg-rail-bottom">
        <button type="button" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}><span className="sg-nav-icon">{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</span><span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span></button>
        <button type="button"><span className="sg-nav-icon"><SettingsIcon /></span><span>Settings</span></button>
        <button type="button" className="sg-account-button" title={me?.username ? `@${me.username}` : me?.firstName || 'Account'}>
          <span className="sg-account-avatar">{initials(me?.firstName)}</span><span>{me?.firstName || 'You'}</span>
        </button>
      </div>
    </aside>

    <main className="sg-main">
      <div className="sg-feed-column">
        <header className="sg-mobile-header">
          <a className="sg-brand" href="/"><span className="sg-mark"><span>S</span></span><strong>Supergram</strong></a>
          <div><button type="button" className="sg-icon-button" onClick={() => setSearchOpen(true)} aria-label="Search"><SearchIcon /></button><button type="button" className="sg-icon-button" onClick={() => void refresh()} aria-label="Refresh"><RefreshIcon /></button></div>
        </header>

        <section className="sg-source-strip" aria-label="Telegram sources">
          <button type="button" className={`sg-source-bubble sg-all-source ${sourceFilter === null ? 'is-active' : ''}`} onClick={() => selectSource(null)}>
            <span className="sg-source-ring"><span className="sg-source-avatar sg-all-avatar">∞</span></span><span>All</span>
          </button>
          {topSources.map(channel => <SourceBubble key={channel.id} channel={channel} active={sourceFilter === channel.id} onClick={() => selectSource(channel.id)} />)}
        </section>

        {newCount > 0 && <button type="button" className="sg-new-posts" onClick={applyQueuedFeed}>↑ {newCount} new {newCount === 1 ? 'post' : 'posts'}</button>}
        {error && <div className="sg-feed-error"><span>{error}</span><button type="button" onClick={() => setError('')}><CloseIcon /></button></div>}

        <section className="sg-feed" aria-live="polite">
          {renderedFeed.length ? renderedFeed.map((item, index) => {
            const channel = safeChannels.find(source => source.id === item.channelId)
            if (!channel) return null
            return item.sponsored
              ? <SponsoredCard key={item.id} item={item} channel={channel} index={index} />
              : <FeedCard key={item.id} item={item} channel={channel} live onSave={toggleSave} onRead={markRead} index={index} />
          }) : <div className="sg-empty">
            <div className="sg-empty-icon">S</div>
            <strong>{query ? 'Nothing matched your search' : filter === 'unread' ? 'You’re caught up' : 'No posts here yet'}</strong>
            <span>{query ? 'Try a source name, username, or message text.' : 'Refresh the feed or switch sources.'}</span>
            <button type="button" onClick={() => void refresh()}>Refresh</button>
          </div>}
          <div ref={endRef} className="sg-feed-sentinel" aria-hidden="true" />
          {renderLimit < visibleFeed.length && <div className="sg-feed-loading"><span /></div>}
        </section>
      </div>

      <aside className="sg-right-rail">
        <div className="sg-profile-row">
          <span className="sg-account-avatar sg-account-avatar-large">{initials(me?.firstName)}</span>
          <div><strong>{me?.username ? `@${me.username}` : me?.firstName || 'Telegram account'}</strong><span>{me?.firstName || 'Connected to Telegram'}</span></div>
          <button type="button" onClick={logout}>Switch</button>
        </div>

        <section className="sg-side-section">
          <div className="sg-side-title"><strong>Sources for you</strong><span>{safeChannels.length}</span></div>
          <div className="sg-suggestions">
            {topSources.slice(0, 5).map(channel => <button type="button" key={channel.id} onClick={() => selectSource(channel.id)}>
              <span className="sg-mini-avatar" style={{ background: channel.accent || '#2AABEE' }}>{channel.initials || initials(channel.title)}</span>
              <span><strong>{channel.title}</strong><small>{channel.username ? `@${channel.username}` : channel.type === 'person' ? 'Private chat' : channel.type === 'group' ? 'Group' : 'Telegram'}</small></span>
              {channel.unread > 0 && <b>{channel.unread}</b>}
            </button>)}
          </div>
        </section>

        <section className="sg-side-section sg-scroll-notes">
          <strong>Scroll shortcuts</strong>
          <p><kbd>J</kbd> next <kbd>K</kbd> previous <kbd>S</kbd> save <kbd>/</kbd> search</p>
          {lastRefresh && <span>Last synced {new Date(lastRefresh).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        </section>

        <footer className="sg-footer-copy">Unofficial client using the Telegram API. Not affiliated with Telegram.<div><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div></footer>
      </aside>
    </main>

    {searchOpen && <div className="sg-search-layer" role="dialog" aria-label="Search Supergram">
      <button type="button" className="sg-search-scrim" aria-label="Close search" onClick={() => setSearchOpen(false)} />
      <section className="sg-search-panel">
        <div className="sg-search-head"><strong>Search</strong><button type="button" className="sg-icon-button" onClick={() => setSearchOpen(false)}><CloseIcon /></button></div>
        <label className="sg-search-field"><SearchIcon /><input ref={searchInput} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search sources and messages" /><kbd>Esc</kbd></label>
        <div className="sg-search-results">
          <span>{query ? 'Sources' : 'Recent sources'}</span>
          {searchSources.map(channel => <button type="button" key={channel.id} onClick={() => { selectSource(channel.id); setSearchOpen(false) }}>
            <span className="sg-mini-avatar" style={{ background: channel.accent || '#2AABEE' }}>{channel.initials || initials(channel.title)}</span>
            <span><strong>{channel.title}</strong><small>{channel.username ? `@${channel.username}` : channel.type || 'Telegram'}</small></span>
          </button>)}
          {query && visibleFeed.length > 0 && <div className="sg-search-count">{visibleFeed.length} matching {visibleFeed.length === 1 ? 'post' : 'posts'} in the feed</div>}
        </div>
      </section>
    </div>}

    <nav className="sg-mobile-nav">
      {nav.map(entry => { const Icon = entry.icon; return <button type="button" key={entry.id} className={filter === entry.id ? 'is-active' : ''} onClick={() => changeFilter(entry.id)} aria-label={entry.label}><Icon />{entry.id === 'unread' && unreadTotal > 0 && <b>{unreadTotal > 99 ? '99+' : unreadTotal}</b>}</button> })}
      <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search"><SearchIcon /></button>
    </nav>

    <PromptModal prompt={authPrompt} onSubmit={submitPrompt} onCancel={() => { setAuthPrompt(null); setConnection('idle') }} />
  </div>
}
