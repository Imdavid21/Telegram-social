import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Skeleton } from '@mui/material'
import type { AlbumMedia, Channel, FeedDiagnostics, FeedFilter, FeedItem, FeedPage, FeedUpdate, MediaAsset, UserSettings } from './types'
import {
  loadFavorites,
  loadHiddenPosts,
  loadHiddenSources,
  loadSet,
  loadSettings,
  recordViewerAction,
  resetViewerPersonalization,
  saveFavorites,
  saveHiddenPosts,
  saveHiddenSources,
  saveSet,
  saveSettings
} from './lib/storage'
import { ApiError, authStatus, fetchFeed, fetchFeedUpdates, healthStatus, logoutTelegram, saveTelegramPost } from './lib/api'
import { FeedCard } from './components/FeedCard'
import { SponsoredCard } from './components/SponsoredCard'
import { VirtualFeed } from './components/VirtualFeed'
import { SettingsDialog } from './components/SettingsDialog'
import { SourceBrowser } from './components/SourceBrowser'
import { BrandMark } from './components/BrandMark'
import { BellIcon, BookmarkIcon, CloseIcon, HomeIcon, ImageIcon, SearchIcon, SettingsIcon } from './components/Icons'

const APP_NAME = 'Supergram'
const API_PAGE_SIZE = 40
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const nav: Array<{ id: FeedFilter; label: string; icon: typeof HomeIcon }> = [
  { id: 'all', label: 'Home', icon: HomeIcon },
  { id: 'unread', label: 'Unread', icon: BellIcon },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'saved', label: 'Saved', icon: BookmarkIcon }
]

type Me = { id: string; firstName: string; username?: string }

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

function SourceBubble({ channel, active, favorite, onClick }: { channel: Channel; active: boolean; favorite: boolean; onClick: () => void }) {
  const [failed, setFailed] = useState(false)
  return <button type="button" className={`sg-source-bubble ${active ? 'is-active' : ''} ${favorite ? 'is-favorite' : ''}`} onClick={onClick} title={channel.title}>
    <span className="sg-source-ring">
      <span className="sg-source-avatar" style={{ background: channel.accent || '#242426' }}>
        {channel.avatar && !failed ? <img src={channel.avatar} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : channel.initials || initials(channel.title)}
      </span>
    </span>
    <span>{channel.title}</span>
  </button>
}

function resolvedTheme(settings: UserSettings) {
  if (settings.themeMode === 'light' || settings.themeMode === 'dark') return settings.themeMode
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export default function ProductApp() {
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [error, setError] = useState('')
  const [booting, setBooting] = useState(true)
  const [me, setMe] = useState<Me | null>(null)
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings())
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites())
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(() => loadHiddenSources())
  const [hiddenPosts, setHiddenPosts] = useState<Set<string>>(() => loadHiddenPosts())
  const [rankingRevision, setRankingRevision] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sourceBrowserOpen, setSourceBrowserOpen] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [queuedPosts, setQueuedPosts] = useState<FeedItem[]>([])
  const [diagnostics, setDiagnostics] = useState<FeedDiagnostics | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const scrollPositions = useRef<Record<string, number>>({})
  const keyboardIndex = useRef(0)
  const syncTokenRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const feedRef = useRef<FeedItem[]>([])

  const safeChannels = Array.isArray(channels) ? channels : []
  const safeFeed = Array.isArray(feed) ? feed : []
  const newCount = queuedPosts.length
  const savedMessagesSourceId = me?.id ? `user:${me.id}` : null
  const channelMap = useMemo(() => new Map(safeChannels.map(channel => [channel.id, channel])), [safeChannels])

  useEffect(() => { feedRef.current = safeFeed }, [safeFeed])
  useEffect(() => { void bootstrap() }, [])

  useEffect(() => {
    const apply = () => {
      const theme = resolvedTheme(settings)
      document.documentElement.dataset.theme = theme
      document.documentElement.style.colorScheme = theme
    }
    apply()
    if (settings.themeMode !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    media.addEventListener?.('change', apply)
    return () => media.removeEventListener?.('change', apply)
  }, [settings])

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
  }

  async function bootstrap() {
    setBooting(true)
    setConnection('connecting')
    try {
      const health = await healthStatus()
      if (!health.ok || !health.configured) throw new Error('Can’t connect to Telegram right now.')
      const status = await authStatus()
      if (!status.connected) {
        window.location.href = '/'
        return
      }
      setMe(status.user || null)
      const page = await fetchFeed(null, API_PAGE_SIZE)
      applyPage(page, true)
      setConnection('connected')
    } catch (e) {
      setConnection('error')
      setError(String((e as Error)?.message || 'Could not load Supergram.'))
    } finally {
      setBooting(false)
    }
  }

  async function refresh(quiet = false) {
    if (!quiet) setConnection('connecting')
    try {
      const page = await fetchFeed(null, API_PAGE_SIZE)
      setChannels(current => mergeChannels(current, page.channels))
      const currentIds = new Set(feedRef.current.map(item => item.id))
      const newRows = page.feed.filter(item => !currentIds.has(item.id)).map(item => normalizeItem(item))
      const existingRows = page.feed.filter(item => currentIds.has(item.id)).map(item => normalizeItem(item))
      setFeed(current => mergeFeed(current, existingRows))
      if (newRows.length && window.scrollY > 420) setQueuedPosts(current => mergeFeed(current, newRows))
      else if (newRows.length) setFeed(current => mergeFeed(current, newRows))
      setNextCursor(page.nextCursor)
      setHasMore(page.hasMore)
      syncTokenRef.current = Math.max(syncTokenRef.current, page.syncToken)
      if (page.diagnostics) setDiagnostics(page.diagnostics)
      setConnection('connected')
    } catch (e) {
      setConnection('error')
      if (!quiet) setError(String((e as Error)?.message || 'Could not refresh the feed.'))
    }
  }

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMoreRef.current) return
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
        } catch {
          setError('Couldn’t restore older posts. Try again.')
        }
      } else {
        setError('Couldn’t load older posts. Try again.')
      }
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [hasMore, nextCursor])

  useEffect(() => {
    const el = endRef.current
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadMore()
    }, { rootMargin: '1800px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, hasMore])

  function applyIncrementalUpdates(updates: FeedUpdate[]) {
    const sourceUpdates = updates.flatMap(update => update.type === 'source' ? [update.source] : update.type === 'upsert' && update.source ? [update.source] : [])
    if (sourceUpdates.length) setChannels(current => mergeChannels(current, sourceUpdates))
    const upserts = updates.filter((update): update is Extract<FeedUpdate, { type: 'upsert' }> => update.type === 'upsert')
    const deletions = updates.filter((update): update is Extract<FeedUpdate, { type: 'delete' }> => update.type === 'delete')
    if (deletions.length) {
      const deleted = (row: FeedItem) => deletions.some(update => update.messageIds.includes(row.messageId) && (!update.sourceId || row.channelId === update.sourceId))
      setFeed(current => current.filter(row => !deleted(row)))
      setQueuedPosts(current => current.filter(row => !deleted(row)))
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
  }

  useEffect(() => {
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
  }, [])

  function applyQueuedFeed() {
    if (!queuedPosts.length) return
    setFeed(current => mergeFeed(current, queuedPosts))
    setQueuedPosts([])
    setRankingRevision(value => value + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function logout() {
    await logoutTelegram().catch(() => {})
    window.location.href = '/'
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
    if (willSave) {
      try { await saveTelegramPost(item) }
      catch { setError('Saved in Supergram. Couldn’t copy it to Telegram Saved Messages.') }
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

  function scrollKey(nextFilter = filter, nextMode = settings.feedMode) {
    return `${nextMode}:${nextFilter}:${sourceFilter || 'all'}`
  }

  function changeFilter(next: FeedFilter) {
    scrollPositions.current[scrollKey()] = window.scrollY
    setFilter(next)
    keyboardIndex.current = 0
    requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[scrollKey(next, settings.feedMode)] || 0 }))
  }

  function changeFeedMode(next: UserSettings['feedMode']) {
    if (next === settings.feedMode) return
    scrollPositions.current[scrollKey()] = window.scrollY
    const nextSettings = { ...settings, feedMode: next }
    setSettings(nextSettings)
    saveSettings(nextSettings)
    keyboardIndex.current = 0
    requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[scrollKey(filter, next)] || 0 }))
  }

  function selectSource(id: string | null) {
    scrollPositions.current[scrollKey()] = window.scrollY
    setSourceFilter(id)
    keyboardIndex.current = 0
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleFavorite(channel: Channel) {
    setFavorites(current => {
      const next = new Set(current)
      const removing = next.has(channel.id)
      if (removing) next.delete(channel.id); else next.add(channel.id)
      saveFavorites(next)
      recordViewerAction({ type: removing ? 'unfavorite_source' : 'favorite_source', itemId: `source:${channel.id}`, channelId: channel.id, timestamp: Date.now() })
      return next
    })
  }

  function hideSource(channel: Channel) {
    setHiddenSources(current => {
      const next = new Set(current)
      next.add(channel.id)
      saveHiddenSources(next)
      return next
    })
    recordViewerAction({ type: 'hide_source', itemId: `source:${channel.id}`, channelId: channel.id, timestamp: Date.now() })
  }

  function hidePost(item: FeedItem) {
    setHiddenPosts(current => {
      const next = new Set(current)
      next.add(item.id)
      saveHiddenPosts(next)
      return next
    })
    recordViewerAction({ type: 'hide_post', itemId: item.id, channelId: item.channelId, timestamp: Date.now(), media: Boolean(item.media) })
  }

  function feedback(item: FeedItem, type: 'more_like_this' | 'less_like_this') {
    recordViewerAction({ type, itemId: item.id, channelId: item.channelId, timestamp: Date.now(), media: Boolean(item.media) })
  }

  function updateSettings(next: UserSettings) {
    setSettings(next)
    saveSettings(next)
    setRankingRevision(value => value + 1)
  }

  function resetPersonalization() {
    resetViewerPersonalization()
    setHiddenSources(new Set())
    setHiddenPosts(new Set())
    saveHiddenSources(new Set())
    saveHiddenPosts(new Set())
    setRankingRevision(value => value + 1)
  }

  const collapsedFeed = useMemo(() => collapseAlbums(safeFeed), [safeFeed])
  const visibleFeed = useMemo(() => {
    const q = query.trim().toLowerCase()
    return collapsedFeed.filter(item => {
      const channel = channelMap.get(item.channelId)
      if (!channel || hiddenPosts.has(item.id)) return false
      if (sourceFilter && channel.id !== sourceFilter) return false
      if (!sourceFilter && settings.feedMode === 'for-you') {
        if (hiddenSources.has(channel.id)) return false
        if (!settings.includePrivateChatsInForYou && channel.type === 'person') return false
      }
      if (filter === 'unread' && !item.unread) return false
      if (filter === 'saved') {
        const isTelegramSavedMessage = Boolean(savedMessagesSourceId && item.channelId === savedMessagesSourceId)
        if (!item.saved && !isTelegramSavedMessage) return false
      }
      if (filter === 'media' && !item.media) return false
      if (q && !`${item.text || ''} ${channel.title || ''} ${channel.username || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [channelMap, collapsedFeed, filter, hiddenPosts, hiddenSources, query, savedMessagesSourceId, settings.feedMode, settings.includePrivateChatsInForYou, sourceFilter])

  const unreadTotal = safeFeed.reduce((total, item) => total + (item.unread ? 1 : 0), 0)
  const topSources = useMemo(() => [...safeChannels].sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)) || Number(b.unread || 0) - Number(a.unread || 0) || a.title.localeCompare(b.title)).slice(0, 10), [favorites, safeChannels])
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

  if (booting) return <div className="sg-app sg-app-loading" aria-busy="true" aria-label="Loading your Telegram feed">
    <aside className="sg-left-rail sg-skeleton-rail"><Skeleton variant="rounded" width={132} height={34} /><div className="sg-skeleton-nav">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="rounded" height={46} />)}</div></aside>
    <main className="sg-main"><div className="sg-feed-column"><section className="sg-source-strip sg-skeleton-sources">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="circular" width={54} height={54} />)}</section><section className="sg-feed sg-feed-skeleton">{Array.from({ length: 3 }).map((_, i) => <article className="sg-post sg-skeleton-post" key={i}><div className="sg-skeleton-head"><Skeleton variant="circular" width={38} height={38} /><div><Skeleton width={120} /><Skeleton width={76} height={16} /></div></div><Skeleton variant="rounded" width="100%" height={i === 0 ? 320 : 180} /><Skeleton width="88%" /><Skeleton width="62%" /></article>)}</section></div></main>
  </div>

  return <div className="sg-app">
    <aside className="sg-left-rail">
      <a className="sg-brand" href="/" aria-label={APP_NAME}><span className="sg-brand-svg"><BrandMark /></span><strong>Supergram</strong></a>
      <nav className="sg-primary-nav" aria-label="Primary">
        {nav.map(entry => {
          const Icon = entry.icon
          const count = entry.id === 'unread' ? unreadTotal : 0
          return <button type="button" key={entry.id} className={filter === entry.id ? 'is-active' : ''} onClick={() => changeFilter(entry.id)}><span className="sg-nav-icon"><Icon />{count > 0 && <b>{count > 99 ? '99+' : count}</b>}</span><span>{entry.label}</span></button>
        })}
        <button type="button" className={searchOpen || query ? 'is-active' : ''} onClick={() => setSearchOpen(true)}><span className="sg-nav-icon"><SearchIcon /></span><span>Search</span></button>
      </nav>
      <div className="sg-rail-bottom">
        <button type="button" onClick={() => setSourceBrowserOpen(true)}><span className="sg-nav-icon"><HomeIcon /></span><span>All sources</span></button>
        <button type="button" onClick={() => setSettingsOpen(true)}><span className="sg-nav-icon"><SettingsIcon /></span><span>Settings</span></button>
        <button type="button" className="sg-account-button" onClick={() => setSettingsOpen(true)} title={me?.username ? `@${me.username}` : me?.firstName || 'Account'}><span className="sg-account-avatar">{initials(me?.firstName)}</span><span>{me?.firstName || 'You'}</span></button>
      </div>
    </aside>

    <main className="sg-main">
      <div className="sg-feed-column">
        <header className="sg-mobile-header">
          <a className="sg-brand" href="/"><span className="sg-brand-svg"><BrandMark /></span><strong>Supergram</strong></a>
          <div><button type="button" className="sg-icon-button" onClick={() => setSearchOpen(true)} aria-label="Search"><SearchIcon /></button><button type="button" className="sg-account-button-mobile" onClick={() => setSettingsOpen(true)} aria-label="Account and settings"><span className="sg-account-avatar">{initials(me?.firstName)}</span></button></div>
        </header>

        <section className="sg-feed-toolbar" aria-label="Feed controls">
          <div className="sg-feed-mode" role="group" aria-label="Feed order">
            <button type="button" className={settings.feedMode === 'for-you' ? 'is-active' : ''} onClick={() => changeFeedMode('for-you')}>For You</button>
            <button type="button" className={settings.feedMode === 'latest' ? 'is-active' : ''} onClick={() => changeFeedMode('latest')}>Latest</button>
          </div>
          <button type="button" className="sg-all-sources-button" onClick={() => setSourceBrowserOpen(true)}>{sourceFilter ? channelMap.get(sourceFilter)?.title || 'Source' : 'All sources'}</button>
        </section>

        <section className="sg-source-strip" aria-label="Telegram sources">
          <button type="button" className={`sg-source-bubble sg-all-source ${sourceFilter === null ? 'is-active' : ''}`} onClick={() => selectSource(null)}><span className="sg-source-ring"><span className="sg-source-avatar sg-all-avatar">∞</span></span><span>All</span></button>
          {topSources.map(channel => <SourceBubble key={channel.id} channel={channel} favorite={favorites.has(channel.id)} active={sourceFilter === channel.id} onClick={() => selectSource(channel.id)} />)}
          {safeChannels.length > topSources.length && <button type="button" className="sg-source-bubble sg-more-sources" onClick={() => setSourceBrowserOpen(true)}><span className="sg-source-ring"><span className="sg-source-avatar sg-all-avatar">+</span></span><span>See all</span></button>}
        </section>

        {connection === 'error' && !error && <div className="sg-connection-banner" role="status">Reconnecting…</div>}
        {newCount > 0 && <button type="button" className="sg-new-posts" onClick={applyQueuedFeed}>↑ {newCount} new {newCount === 1 ? 'post' : 'posts'}</button>}
        {error && <div className="sg-feed-error" role="alert"><span>{error}</span><div><button type="button" onClick={() => void refresh()} className="sg-error-retry">Retry</button><button type="button" onClick={() => setError('')} aria-label="Dismiss error"><CloseIcon /></button></div></div>}

        <section className="sg-feed">
          {visibleFeed.length ? <VirtualFeed items={visibleFeed} mode={settings.feedMode} favoriteSources={favorites} rankingRevision={rankingRevision} renderItem={(item, index) => {
            const channel = channelMap.get(item.channelId)
            if (!channel) return null
            const displayChannel = savedMessagesSourceId && channel.id === savedMessagesSourceId ? { ...channel, title: 'Saved Messages', initials: 'SM' } : channel
            const storyEntries = (item.storyMembers || []).flatMap(member => {
              const storyChannel = channelMap.get(member.channelId)
              return storyChannel ? [{ member, channel: storyChannel }] : []
            })
            return item.sponsored
              ? <SponsoredCard item={item} channel={displayChannel} index={index} />
              : <FeedCard
                  item={item}
                  channel={displayChannel}
                  feedMode={settings.feedMode}
                  favoriteSource={favorites.has(channel.id)}
                  summarizePrivateChats={settings.summarizePrivateChats}
                  storyEntries={storyEntries}
                  onSave={toggleSave}
                  onRead={markRead}
                  onFavoriteSource={toggleFavorite}
                  onHideSource={hideSource}
                  onHidePost={hidePost}
                  onFeedback={feedback}
                  onSourceOpen={source => { setSourceFilter(source.id); setSourceBrowserOpen(true) }}
                  index={index}
                />
          }} /> : <div className="sg-empty">
            <div className="sg-empty-icon">∞</div>
            <strong>{query ? 'No results in the loaded feed' : filter === 'unread' ? 'You’re caught up' : filter === 'saved' ? 'No saved posts yet' : filter === 'media' ? 'No media found' : 'No posts here yet'}</strong>
            <span>{query ? 'Search currently loaded posts and sources, or clear the query.' : sourceFilter || filter !== 'all' ? 'Clear the active filter or choose another source.' : 'Refresh the feed to try again.'}</span>
            {(query || sourceFilter || filter !== 'all') ? <button type="button" onClick={() => { setQuery(''); setSourceFilter(null); setFilter('all') }}>Clear filters</button> : <button type="button" onClick={() => void refresh()}>Refresh</button>}
          </div>}
          <div ref={endRef} className="sg-feed-sentinel" aria-hidden="true" />
          {loadingMore && <div className="sg-feed-loading" role="status"><span />Loading older posts…</div>}
          {!hasMore && safeFeed.length > API_PAGE_SIZE && <div className="sg-feed-end">You’ve reached the beginning of this Telegram history.</div>}
        </section>
      </div>
    </main>

    {searchOpen && <div className="sg-search-layer" role="dialog" aria-modal="true" aria-label="Search Supergram">
      <button type="button" className="sg-search-scrim" aria-label="Close search" onClick={() => setSearchOpen(false)} />
      <section className="sg-search-panel">
        <div className="sg-search-head"><strong>Search loaded Telegram</strong><button type="button" className="sg-icon-button" onClick={() => setSearchOpen(false)} aria-label="Close search"><CloseIcon /></button></div>
        <label className="sg-search-field"><SearchIcon /><input ref={searchInput} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search loaded sources and messages" /><kbd>Esc</kbd></label>
        <div className="sg-search-results"><span>{query ? 'Sources' : 'Recent sources'}</span>{searchSources.map(channel => <button type="button" key={channel.id} onClick={() => { selectSource(channel.id); setSearchOpen(false) }}><span className="sg-mini-avatar" style={{ background: channel.accent || '#242426' }}>{channel.initials || initials(channel.title)}</span><span><strong>{channel.title}</strong><small>{channel.username ? `@${channel.username}` : channel.type || 'Telegram'}</small></span></button>)}{query && visibleFeed.length > 0 && <div className="sg-search-count">{visibleFeed.length} matching {visibleFeed.length === 1 ? 'post' : 'posts'} currently loaded</div>}<button type="button" className="sg-search-all" disabled title="Full Telegram search is the next backend-backed search pass">Full-history Telegram search coming next</button></div>
      </section>
    </div>}

    <nav className="sg-mobile-nav" aria-label="Primary mobile navigation">
      {nav.map(entry => { const Icon = entry.icon; return <button type="button" key={entry.id} className={filter === entry.id ? 'is-active' : ''} onClick={() => changeFilter(entry.id)} aria-label={entry.label}><Icon />{entry.id === 'unread' && unreadTotal > 0 && <b>{unreadTotal > 99 ? '99+' : unreadTotal}</b>}<span>{filter === entry.id ? entry.label : ''}</span></button> })}
      <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search"><SearchIcon /><span>{searchOpen ? 'Search' : ''}</span></button>
    </nav>

    <SourceBrowser open={sourceBrowserOpen} channels={safeChannels} favorites={favorites} selectedSource={sourceFilter} onClose={() => setSourceBrowserOpen(false)} onSelect={selectSource} onFavorite={toggleFavorite} />
    <SettingsDialog open={settingsOpen} settings={settings} account={me} favoriteCount={favorites.size} hiddenSourceCount={hiddenSources.size} onClose={() => setSettingsOpen(false)} onChange={updateSettings} onResetPersonalization={resetPersonalization} onLogout={() => void logout()} />

    {diagnostics && <span className="sg-sr-only" aria-hidden="true">{diagnostics.telegramTotal ?? safeChannels.length} Telegram sources available</span>}
  </div>
}
