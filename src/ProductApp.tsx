import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AlbumMedia, AuthPrompt, Channel, FeedDiagnostics, FeedFilter, FeedItem, FeedPage, FeedUpdate, MediaAsset } from './types'
import { loadSet, saveSet } from './lib/storage'
import { ApiError, authFlow, authStatus, beginAuth, fetchFeed, fetchFeedUpdates, healthStatus, logoutTelegram, saveTelegramPost, submitAuth } from './lib/api'
import { PromptModal } from './components/AuthModal'
import { FeedCard } from './components/FeedCard'
import { SponsoredCard } from './components/SponsoredCard'
import { VirtualFeed } from './components/VirtualFeed'
import { BellIcon, BookmarkIcon, CloseIcon, HomeIcon, ImageIcon, MoonIcon, RefreshIcon, SearchIcon, SettingsIcon, SunIcon } from './components/Icons'

const APP_NAME = 'Supergram'
const API_PAGE_SIZE = 40
const nav: Array<{ id: FeedFilter; label: string; icon: typeof HomeIcon }> = [
  { id: 'all', label: 'Home', icon: HomeIcon },
  { id: 'unread', label: 'Unread', icon: BellIcon },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'saved', label: 'Saved', icon: BookmarkIcon }
]

type Flow = { step: string; error?: string | null; meta?: Record<string, unknown> }
type Me = { id: string; firstName: string; username?: string }
type Theme = 'dark' | 'light'
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

function normalizeItem(item: FeedItem, existing?: FeedItem): FeedItem {
  const saved = loadSet('saved')
  const read = loadSet('read')
  return {
    ...existing,
    ...item,
    text: String(item?.text || ''),
    reactions: Array.isArray(item?.reactions) ? item.reactions : [],
    saved: existing?.saved ?? (saved.has(item.id) || Boolean(item.saved)),
    unread: existing?.unread === false || read.has(item.id) ? false : Boolean(item.unread)
  }
}

function mergeChannels(current: Channel[], incoming: Channel[]) {
  const map = new Map<string, Channel>()
  for (const channel of current) if (channel?.id) map.set(channel.id, channel)
  for (const channel of incoming) if (channel?.id) map.set(channel.id, { ...map.get(channel.id), ...channel })
  return [...map.values()]
}

function mergeFeed(current: FeedItem[], incoming: FeedItem[]) {
  const map = new Map<string, FeedItem>()
  for (const item of current) if (item?.id) map.set(item.id, item)
  for (const item of incoming) {
    if (!item?.id) continue
    map.set(item.id, normalizeItem(item, map.get(item.id)))
  }
  return [...map.values()].sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))
}

function collapseAlbums(feed: FeedItem[]) {
  const groups = new Map<string, FeedItem[]>()
  for (const item of feed) {
    if (!item.groupId || !item.media || item.sponsored || item.media.kind === 'album') continue
    const key = `${item.channelId}:${item.groupId}`
    const group = groups.get(key) || []
    group.push(item)
    groups.set(key, group)
  }

  const emitted = new Set<string>()
  const output: FeedItem[] = []
  for (const item of feed) {
    if (!item.groupId || !item.media || item.sponsored || item.media.kind === 'album') {
      output.push(item)
      continue
    }
    const key = `${item.channelId}:${item.groupId}`
    if (emitted.has(key)) continue
    emitted.add(key)
    const members = groups.get(key) || [item]
    if (members.length < 2) {
      output.push(item)
      continue
    }

    const first = members[0]
    const assets = members
      .map(member => member.media && member.media.kind !== 'album' ? { ...member.media, messageId: member.messageId } as MediaAsset : null)
      .filter((asset): asset is MediaAsset => Boolean(asset))
    const album: AlbumMedia = { kind: 'album', groupId: item.groupId, items: assets }
    output.push({
      ...first,
      id: `album:${item.channelId}:${item.groupId}`,
      timestamp: Math.max(...members.map(member => member.timestamp)),
      text: members.find(member => String(member.text || '').trim())?.text || '',
      unread: members.some(member => member.unread),
      saved: members.some(member => member.saved),
      noForwards: members.some(member => member.noForwards),
      media: album
    })
  }
  return output
}

function SourceBubble({ channel, active, onClick }: { channel: Channel; active: boolean; onClick: () => void }) {
  const [failed, setFailed] = useState(false)
  return <button type="button" className={`sg-source-bubble ${active ? 'is-active' : ''}`} onClick={onClick} title={channel.title}>
    <span className="sg-source-ring">
      <span className="sg-source-avatar" style={{ background: channel.accent || '#2AABEE' }}>
        {channel.avatar && !failed ? <img src={channel.avatar} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : channel.initials || initials(channel.title)}
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
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [queuedPosts, setQueuedPosts] = useState<FeedItem[]>([])
  const [lastRefresh, setLastRefresh] = useState<number | null>(null)
  const [diagnostics, setDiagnostics] = useState<FeedDiagnostics | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const scrollPositions = useRef<Record<FeedFilter, number>>({ all: 0, unread: 0, saved: 0, media: 0 })
  const keyboardIndex = useRef(0)
  const syncTokenRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const feedRef = useRef<FeedItem[]>([])

  const safeChannels = Array.isArray(channels) ? channels : []
  const safeFeed = Array.isArray(feed) ? feed : []
  const newCount = queuedPosts.length

  useEffect(() => { feedRef.current = safeFeed }, [safeFeed])
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

  function applyPage(page: FeedPage, replace = false) {
    const normalized = page.feed.map(item => normalizeItem(item))
    setChannels(current => replace ? mergeChannels([], page.channels) : mergeChannels(current, page.channels))
    setFeed(current => replace ? mergeFeed([], normalized) : mergeFeed(current, normalized))
    setNextCursor(page.nextCursor)
    setHasMore(page.hasMore)
    syncTokenRef.current = Math.max(syncTokenRef.current, page.syncToken)
    if (page.diagnostics) setDiagnostics(page.diagnostics)
    setLastRefresh(Date.now())
  }

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

      const page = await fetchFeed(null, API_PAGE_SIZE)
      applyPage(page, true)
      setConnection('connected')
      setMode('live')
    } catch (e) {
      setConnection('error')
      setError(String((e as Error)?.message || 'Could not load Supergram.'))
    } finally {
      setBooting(false)
    }
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
    const page = await fetchFeed(null, API_PAGE_SIZE)
    applyPage(page, true)
    setMe(status.user || null)
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

  async function refresh(quiet = false) {
    if (mode !== 'live') return
    if (!quiet) setConnection('connecting')
    try {
      const page = await fetchFeed(null, API_PAGE_SIZE)
      setChannels(current => mergeChannels(current, page.channels))
      const currentIds = new Set(feedRef.current.map(item => item.id))
      const newRows = page.feed.filter(item => !currentIds.has(item.id)).map(item => normalizeItem(item))
      const existingRows = page.feed.filter(item => currentIds.has(item.id)).map(item => normalizeItem(item))
      setFeed(current => mergeFeed(current, existingRows))

      if (newRows.length && window.scrollY > 420) {
        setQueuedPosts(current => mergeFeed(current, newRows))
      } else if (newRows.length) {
        setFeed(current => mergeFeed(current, newRows))
      }

      setNextCursor(page.nextCursor)
      setHasMore(page.hasMore)
      syncTokenRef.current = Math.max(syncTokenRef.current, page.syncToken)
      if (page.diagnostics) setDiagnostics(page.diagnostics)
      setLastRefresh(Date.now())
      setConnection('connected')
    } catch (e) {
      setConnection('error')
      if (!quiet) setError(String((e as Error)?.message || e))
    }
  }

  const loadMore = useCallback(async () => {
    if (mode !== 'live' || !hasMore || !nextCursor || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const page = await fetchFeed(nextCursor, API_PAGE_SIZE)
      applyPage(page, false)
    } catch (e) {
      if (e instanceof ApiError && (e.status === 410 || e.code === 'CURSOR_EXPIRED')) {
        try {
          const fresh = await fetchFeed(null, API_PAGE_SIZE)
          applyPage(fresh, false)
        } catch (restartError) {
          setError(`Could not restore infinite scroll: ${String((restartError as Error)?.message || restartError)}`)
        }
      } else {
        setError(`Could not load older posts: ${String((e as Error)?.message || e)}`)
      }
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [mode, hasMore, nextCursor])

  useEffect(() => {
    const el = endRef.current
    if (!el || mode !== 'live' || !hasMore || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadMore()
    }, { rootMargin: '1800px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, mode, hasMore])

  function applyIncrementalUpdates(updates: FeedUpdate[]) {
    const sourceUpdates = updates.flatMap(update => update.type === 'source' ? [update.source] : update.type === 'upsert' && update.source ? [update.source] : [])
    if (sourceUpdates.length) setChannels(current => mergeChannels(current, sourceUpdates))

    const upserts = updates.filter((update): update is Extract<FeedUpdate, { type: 'upsert' }> => update.type === 'upsert')
    const deletions = updates.filter((update): update is Extract<FeedUpdate, { type: 'delete' }> => update.type === 'delete')

    if (deletions.length) {
      setFeed(current => current.filter(item => !deletions.some(update => {
        if (!update.messageIds.includes(item.messageId)) return false
        return update.sourceId ? item.channelId === update.sourceId : true
      })))
      setQueuedPosts(current => current.filter(item => !deletions.some(update => {
        if (!update.messageIds.includes(item.messageId)) return false
        return update.sourceId ? item.channelId === update.sourceId : true
      })))
    }

    if (!upserts.length) return
    const existingIds = new Set(feedRef.current.map(item => item.id))
    const changedExisting = upserts.filter(update => existingIds.has(update.post.id)).map(update => normalizeItem(update.post))
    const brandNew = upserts.filter(update => !existingIds.has(update.post.id)).map(update => normalizeItem(update.post))
    if (changedExisting.length) setFeed(current => mergeFeed(current, changedExisting))
    if (brandNew.length) {
      if (window.scrollY > 420) setQueuedPosts(current => mergeFeed(current, brandNew))
      else setFeed(current => mergeFeed(current, brandNew))
    }
    setLastRefresh(Date.now())
  }

  useEffect(() => {
    if (mode !== 'live') return
    const controller = new AbortController()
    let active = true

    const loop = async () => {
      while (active && !controller.signal.aborted) {
        try {
          const result = await fetchFeedUpdates(syncTokenRef.current, controller.signal)
          if (!active) break
          if (Array.isArray(result.updates) && result.updates.length) applyIncrementalUpdates(result.updates)
          syncTokenRef.current = Math.max(syncTokenRef.current, Number(result.syncToken || 0))
          setConnection('connected')
        } catch {
          if (controller.signal.aborted || !active) break
          setConnection('error')
          await delay(2500)
        }
      }
    }
    void loop()
    return () => { active = false; controller.abort() }
  }, [mode])

  function applyQueuedFeed() {
    if (!queuedPosts.length) return
    setFeed(current => mergeFeed(current, queuedPosts))
    setQueuedPosts([])
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
    setQueuedPosts([])
    setNextCursor(null)
    setHasMore(false)
    setDiagnostics(null)
    syncTokenRef.current = 0
  }

  function groupMembers(item: FeedItem, rows: FeedItem[]) {
    if (!item.groupId) return rows.filter(row => row.id === item.id)
    return rows.filter(row => row.channelId === item.channelId && row.groupId === item.groupId)
  }

  async function toggleSave(item: FeedItem) {
    const willSave = !item.saved
    setFeed(current => current.map(row => {
      const match = row.id === item.id || Boolean(item.groupId && row.channelId === item.channelId && row.groupId === item.groupId)
      return match ? { ...row, saved: willSave } : row
    }))
    const saved = loadSet('saved')
    const members = groupMembers(item, feedRef.current)
    for (const member of members.length ? members : [item]) {
      if (willSave) saved.add(member.id); else saved.delete(member.id)
    }
    saveSet('saved', saved)
    if (willSave && mode === 'live') {
      try { await saveTelegramPost(item) }
      catch (e) { setError(`Saved in Supergram. Telegram forward failed: ${String((e as Error)?.message || e)}`) }
    }
  }

  function markRead(item: FeedItem) {
    setFeed(current => current.map(row => {
      const match = row.id === item.id || Boolean(item.groupId && row.channelId === item.channelId && row.groupId === item.groupId)
      return match ? { ...row, unread: false } : row
    }))
    const read = loadSet('read')
    const members = groupMembers(item, feedRef.current)
    for (const member of members.length ? members : [item]) read.add(member.id)
    saveSet('read', read)
  }

  function changeFilter(next: FeedFilter) {
    scrollPositions.current[filter] = window.scrollY
    setFilter(next)
    setSourceFilter(null)
    keyboardIndex.current = 0
    requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[next] || 0 }))
  }

  function selectSource(id: string | null) {
    setSourceFilter(current => current === id ? null : id)
    setFilter('all')
    keyboardIndex.current = 0
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const collapsedFeed = useMemo(() => collapseAlbums(safeFeed), [safeFeed])
  const visibleFeed = useMemo(() => {
    const q = query.trim().toLowerCase()
    return collapsedFeed.filter(item => {
      const channel = safeChannels.find(source => source.id === item.channelId)
      if (!channel) return false
      if (sourceFilter && channel.id !== sourceFilter) return false
      if (filter === 'unread' && !item.unread) return false
      if (filter === 'saved' && !item.saved) return false
      if (filter === 'media' && !item.media) return false
      if (q && !`${item.text || ''} ${channel.title || ''} ${channel.username || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [collapsedFeed, safeChannels, filter, query, sourceFilter])

  const unreadTotal = safeFeed.reduce((total, item) => total + (item.unread ? 1 : 0), 0)
  const topSources = useMemo(() => [...safeChannels].sort((a, b) => Number(b.unread || 0) - Number(a.unread || 0)).slice(0, 12), [safeChannels])
  const searchSources = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (q ? safeChannels.filter(channel => `${channel.title} ${channel.username || ''}`.toLowerCase().includes(q)) : topSources).slice(0, 8)
  }, [query, safeChannels, topSources])

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
      if (!visibleFeed.length) return
      if (event.key.toLowerCase() === 'j' || event.key.toLowerCase() === 'k') {
        event.preventDefault()
        const delta = event.key.toLowerCase() === 'j' ? 1 : -1
        keyboardIndex.current = Math.max(0, Math.min(visibleFeed.length - 1, keyboardIndex.current + delta))
        document.querySelector(`[data-feed-index="${keyboardIndex.current}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      if (event.key.toLowerCase() === 's') {
        const item = visibleFeed[keyboardIndex.current]
        if (item) void toggleSave(item)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visibleFeed])

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
          {visibleFeed.length ? <VirtualFeed items={visibleFeed} renderItem={(item, index) => {
            const channel = safeChannels.find(source => source.id === item.channelId)
            if (!channel) return null
            return item.sponsored
              ? <SponsoredCard item={item} channel={channel} index={index} />
              : <FeedCard item={item} channel={channel} live onSave={toggleSave} onRead={markRead} index={index} />
          }} /> : <div className="sg-empty">
            <div className="sg-empty-icon">S</div>
            <strong>{query ? 'Nothing matched your search' : filter === 'unread' ? 'You’re caught up' : 'No posts here yet'}</strong>
            <span>{query ? 'Try a source name, username, or message text.' : hasMore ? 'Loading older Telegram history…' : 'Refresh the feed or switch sources.'}</span>
            <button type="button" onClick={() => void refresh()}>Refresh</button>
          </div>}
          <div ref={endRef} className="sg-feed-sentinel" aria-hidden="true" />
          {loadingMore && <div className="sg-feed-loading"><span /></div>}
          {!hasMore && safeFeed.length > API_PAGE_SIZE && <div className="sg-feed-end">You reached the beginning of this Telegram history.</div>}
        </section>
      </div>

      <aside className="sg-right-rail">
        <div className="sg-profile-row">
          <span className="sg-account-avatar sg-account-avatar-large">{initials(me?.firstName)}</span>
          <div><strong>{me?.username ? `@${me.username}` : me?.firstName || 'Telegram account'}</strong><span>{me?.firstName || 'Connected to Telegram'}</span></div>
          <button type="button" onClick={logout}>Switch</button>
        </div>

        <section className="sg-side-section">
          <div className="sg-side-title"><strong>Sources for you</strong><span>{diagnostics?.telegramTotal ?? safeChannels.length}</span></div>
          <div className="sg-suggestions">
            {topSources.slice(0, 5).map(channel => <button type="button" key={channel.id} onClick={() => selectSource(channel.id)}>
              <span className="sg-mini-avatar" style={{ background: channel.accent || '#2AABEE' }}>{channel.initials || initials(channel.title)}</span>
              <span><strong>{channel.title}</strong><small>{channel.username ? `@${channel.username}` : channel.type === 'person' ? 'Private chat' : channel.type === 'group' ? 'Group' : 'Telegram'}</small></span>
              {channel.unread > 0 && <b>{channel.unread}</b>}
            </button>)}
          </div>
        </section>

        <section className="sg-side-section sg-scroll-notes">
          <strong>Scroll status</strong>
          <p>{safeFeed.length} messages loaded · {diagnostics?.archivedTotal ?? 0} archived sources</p>
          <p><kbd>J</kbd> next <kbd>K</kbd> previous <kbd>S</kbd> save <kbd>/</kbd> search</p>
          {lastRefresh && <span>Live sync {connection === 'connected' ? 'active' : 'reconnecting'} · {new Date(lastRefresh).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        </section>

        <footer className="sg-footer-copy">Unofficial client using the Telegram API. Not affiliated with Telegram.<div><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div></footer>
      </aside>
    </main>

    {searchOpen && <div className="sg-search-layer" role="dialog" aria-label="Search Supergram">
      <button type="button" className="sg-search-scrim" aria-label="Close search" onClick={() => setSearchOpen(false)} />
      <section className="sg-search-panel">
        <div className="sg-search-head"><strong>Search</strong><button type="button" className="sg-icon-button" onClick={() => setSearchOpen(false)}><CloseIcon /></button></div>
        <label className="sg-search-field"><SearchIcon /><input ref={searchInput} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search loaded sources and messages" /><kbd>Esc</kbd></label>
        <div className="sg-search-results">
          <span>{query ? 'Sources' : 'Recent sources'}</span>
          {searchSources.map(channel => <button type="button" key={channel.id} onClick={() => { selectSource(channel.id); setSearchOpen(false) }}>
            <span className="sg-mini-avatar" style={{ background: channel.accent || '#2AABEE' }}>{channel.initials || initials(channel.title)}</span>
            <span><strong>{channel.title}</strong><small>{channel.username ? `@${channel.username}` : channel.type || 'Telegram'}</small></span>
          </button>)}
          {query && visibleFeed.length > 0 && <div className="sg-search-count">{visibleFeed.length} matching {visibleFeed.length === 1 ? 'post' : 'posts'} currently loaded</div>}
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
