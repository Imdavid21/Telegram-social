from pathlib import Path

p = Path('src/ProductApp.tsx')
s = p.read_text()
s = s.replace(
    "import type { AlbumMedia, Channel, FeedDiagnostics, FeedFilter, FeedItem, FeedPage, FeedUpdate, MediaAsset, TelegramAccount, UserSettings } from './types'",
    "import type { AlbumMedia, Channel, FeedDiagnostics, FeedFilter, FeedItem, FeedPage, FeedUpdate, MediaAsset, TelegramAccount, TelegramSearchResponse, UserSettings } from './types'",
    1,
)
s = s.replace(
    "import { ApiError, authStatus, fetchFeed, fetchFeedUpdates, healthStatus, logoutTelegram, saveTelegramPost } from './lib/api'",
    "import { ApiError, authStatus, fetchFeed, fetchFeedUpdates, healthStatus, logoutTelegram, saveTelegramPost, searchTelegram } from './lib/api'",
    1,
)
helper_anchor = '''function resolvedTheme(settings: UserSettings) {
  if (settings.themeMode === 'light' || settings.themeMode === 'dark') return settings.themeMode
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}
'''
helpers = helper_anchor + '''
function searchExcerpt(value: string) {
  const text = String(value || '').replace(/\\s+/g, ' ').trim()
  if (text.length <= 170) return text
  return `${text.slice(0, 167).trimEnd()}…`
}

function searchDate(timestamp: number) {
  const date = new Date(Number(timestamp || 0))
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

function telegramPostUrl(item: FeedItem, channel?: Channel) {
  if (!channel?.username || !item.messageId) return null
  return `https://t.me/${encodeURIComponent(channel.username)}/${Number(item.messageId)}`
}
'''
if 'function searchExcerpt' not in s:
    if helper_anchor not in s: raise SystemExit('theme helper anchor missing')
    s = s.replace(helper_anchor, helpers, 1)

state_anchor = "  const [channels, setChannels] = useState<Channel[]>([])\n"
state_insert = "  const [remoteSearch, setRemoteSearch] = useState<TelegramSearchResponse | null>(null)\n  const [remoteSearchLoading, setRemoteSearchLoading] = useState(false)\n  const [remoteSearchError, setRemoteSearchError] = useState('')\n" + state_anchor
if 'remoteSearchLoading' not in s:
    if state_anchor not in s: raise SystemExit('channels state anchor missing')
    s = s.replace(state_anchor, state_insert, 1)

ref_anchor = "  const searchInput = useRef<HTMLInputElement>(null)\n"
ref_insert = ref_anchor + "  const searchController = useRef<AbortController | null>(null)\n"
if 'searchController = useRef' not in s:
    if ref_anchor not in s: raise SystemExit('search ref anchor missing')
    s = s.replace(ref_anchor, ref_insert, 1)

map_anchor = "  const channelMap = useMemo(() => new Map(safeChannels.map(channel => [channel.id, channel])), [safeChannels])\n"
map_insert = map_anchor + "  const remoteChannelMap = useMemo(() => new Map((remoteSearch?.channels || []).map(channel => [channel.id, channel])), [remoteSearch])\n"
if 'remoteChannelMap' not in s:
    if map_anchor not in s: raise SystemExit('channel map anchor missing')
    s = s.replace(map_anchor, map_insert, 1)

old_focus = '''  useEffect(() => {
    if (!searchOpen) return
    const timer = window.setTimeout(() => searchInput.current?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [searchOpen])'''
new_focus = '''  useEffect(() => {
    if (!searchOpen) {
      searchController.current?.abort()
      searchController.current = null
      setRemoteSearchLoading(false)
      return
    }
    const timer = window.setTimeout(() => searchInput.current?.focus(), 50)
    return () => window.clearTimeout(timer)
  }, [searchOpen])'''
if old_focus in s:
    s = s.replace(old_focus, new_focus, 1)
elif new_focus not in s:
    raise SystemExit('search focus anchor missing')

logout_anchor = '''  async function logout() {
    await logoutTelegram().catch(() => {})
    window.location.href = '/'
  }
'''
search_functions = logout_anchor + '''
  async function runTelegramSearch() {
    const value = query.trim()
    if (value.length < 2) {
      setRemoteSearch(null)
      setRemoteSearchError('Enter at least 2 characters to search Telegram history.')
      return
    }
    searchController.current?.abort()
    const controller = new AbortController()
    searchController.current = controller
    setRemoteSearchLoading(true)
    setRemoteSearchError('')
    try {
      const result = await searchTelegram(value, { sourceId: sourceFilter || undefined, limit: 50 }, controller.signal)
      if (controller.signal.aborted) return
      setRemoteSearch(result)
      setChannels(current => mergeChannels(current, result.channels))
    } catch (searchError) {
      if (controller.signal.aborted) return
      setRemoteSearch(null)
      setRemoteSearchError(String((searchError as Error)?.message || 'Could not search Telegram history.'))
    } finally {
      if (searchController.current === controller) {
        searchController.current = null
        setRemoteSearchLoading(false)
      }
    }
  }

  function openSearchSource(sourceId: string) {
    setQuery('')
    setRemoteSearch(null)
    setRemoteSearchError('')
    setSourceFilter(sourceId)
    setFilter('all')
    setSearchOpen(false)
    keyboardIndex.current = 0
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }
'''
if 'async function runTelegramSearch' not in s:
    if logout_anchor not in s: raise SystemExit('logout anchor missing')
    s = s.replace(logout_anchor, search_functions, 1)

s = s.replace("Search currently loaded posts and sources, or clear the query.", "Search Telegram history for older matches, or clear the query.")
s = s.replace("onClick={() => { setQuery(''); setSourceFilter(null); setFilter('all') }}", "onClick={() => { setQuery(''); setRemoteSearch(null); setSourceFilter(null); setFilter('all') }}")

start = s.find('    {searchOpen && <div className="sg-search-layer"')
end = s.find('\n\n    <nav className="sg-mobile-nav"', start)
if start < 0 or end < 0: raise SystemExit('search UI block not found')
new_search = '''    {searchOpen && <div className="sg-search-layer" role="dialog" aria-modal="true" aria-label="Search Telegram">
      <button type="button" className="sg-search-scrim" aria-label="Close search" onClick={() => setSearchOpen(false)} />
      <section className="sg-search-panel">
        <div className="sg-search-head"><strong>Search Telegram</strong><button type="button" className="sg-icon-button" onClick={() => setSearchOpen(false)} aria-label="Close search"><CloseIcon /></button></div>
        <label className="sg-search-field"><SearchIcon /><input ref={searchInput} value={query} onChange={event => { setQuery(event.target.value); setRemoteSearch(null); setRemoteSearchError('') }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void runTelegramSearch() } }} placeholder={sourceFilter ? `Search ${channelMap.get(sourceFilter)?.title || 'this source'}` : 'Search sources and messages'} /><kbd>Esc</kbd></label>
        <div className="sg-search-results">
          <span>{query ? 'Loaded results' : 'Recent sources'}</span>
          {searchSources.map(channel => <button type="button" key={channel.id} onClick={() => { setQuery(''); setRemoteSearch(null); selectSource(channel.id); setSearchOpen(false) }}><span className="sg-mini-avatar" style={{ background: channel.accent || '#242426' }}>{channel.initials || initials(channel.title)}</span><span><strong>{channel.title}{channel.verified ? ' ✓' : ''}</strong><small>{channel.username ? `@${channel.username}` : channel.type || 'Telegram'}</small></span></button>)}
          {query && visibleFeed.length > 0 && <div className="sg-search-count">{visibleFeed.length} matching {visibleFeed.length === 1 ? 'post' : 'posts'} currently loaded</div>}
          <button type="button" className="sg-search-all" disabled={remoteSearchLoading || query.trim().length < 2} onClick={() => void runTelegramSearch()}>{remoteSearchLoading ? 'Searching Telegram…' : sourceFilter ? `Search full history in ${channelMap.get(sourceFilter)?.title || 'this source'}` : 'Search all Telegram history'}</button>
          {remoteSearchError ? <div className="sg-remote-search-error" role="status">{remoteSearchError}</div> : null}
          {remoteSearch ? <div className="sg-remote-search" aria-live="polite">
            <div className="sg-remote-search-head"><strong>{remoteSearch.scope === 'source' ? 'Source history' : 'Telegram history'}</strong><span>{remoteSearch.total > remoteSearch.results.length ? `Showing ${remoteSearch.results.length} of ${remoteSearch.total}` : `${remoteSearch.results.length} ${remoteSearch.results.length === 1 ? 'result' : 'results'}`}</span></div>
            {remoteSearch.results.length ? remoteSearch.results.map(item => {
              const channel = remoteChannelMap.get(item.channelId) || channelMap.get(item.channelId)
              const original = telegramPostUrl(item, channel)
              return <article className="sg-remote-search-row" key={item.id}>
                <button type="button" className="sg-remote-search-source" onClick={() => openSearchSource(item.channelId)} aria-label={`Open ${channel?.title || 'Telegram source'}`}><span className="sg-mini-avatar" style={{ background: channel?.accent || '#242426' }}>{channel?.initials || initials(channel?.title)}</span></button>
                <div className="sg-remote-search-copy"><div><button type="button" onClick={() => openSearchSource(item.channelId)}>{channel?.title || 'Telegram'}{channel?.verified ? ' ✓' : ''}</button><span>{searchDate(item.timestamp)}</span></div><p>{searchExcerpt(item.text) || (item.media ? `${item.media.kind} attachment` : 'Telegram message')}</p></div>
                {original ? <a href={original} target="_blank" rel="noreferrer">Open</a> : null}
              </article>
            }) : <div className="sg-remote-search-empty">No historical matches found.</div>}
            {remoteSearch.hasMore ? <div className="sg-remote-search-note">Telegram found more matches. Refine the search to narrow them down.</div> : null}
          </div> : null}
        </div>
      </section>
    </div>}'''
s = s[:start] + new_search + s[end:]
p.write_text(s)

p = Path('src/components/FeedCard.tsx')
s = p.read_text()
heart_anchor = '''function isHeart(value?: string) {
  return value === '❤' || value === '❤️' || value === '♥' || value === '♥️'
}
'''
descriptor = heart_anchor + '''
function sourceDescriptor(channel: Channel) {
  if (channel.scam) return 'Telegram marks this source as scam'
  if (channel.fake) return 'Telegram marks this source as fake'
  if (channel.bot) return 'Bot'
  if (channel.type === 'person') return 'Private chat'
  if (channel.type === 'group') return 'Group'
  return 'Telegram source'
}
'''
if 'function sourceDescriptor' not in s:
    if heart_anchor not in s: raise SystemExit('heart helper anchor missing')
    s = s.replace(heart_anchor, descriptor, 1)
liked_anchor = "  const [liked, setLiked] = useState(initialHeart)\n"
if 'reactionRows' not in s:
    if liked_anchor not in s: raise SystemExit('liked state anchor missing')
    s = s.replace(liked_anchor, liked_anchor + "  const [reactionRows, setReactionRows] = useState<FeedItem['reactions']>(() => Array.isArray(item.reactions) ? item.reactions : [])\n", 1)
s = s.replace("  const reactions = useMemo(() => Array.isArray(item.reactions) ? item.reactions.filter(Boolean).slice(0, 6) : [], [item.reactions])", "  const reactions = useMemo(() => Array.isArray(reactionRows) ? reactionRows.filter(Boolean).slice(0, 6) : [], [reactionRows])")
old_sync = '''  useEffect(() => {
    const selected = isHeart(item.myReaction) || item.reactions?.some(reaction => reaction.chosen && isHeart(reaction.emoji)) || false
    setLiked(selected)
  }, [item.id, item.myReaction, item.reactions])'''
new_sync = '''  useEffect(() => {
    const rows = Array.isArray(item.reactions) ? item.reactions : []
    const selected = isHeart(item.myReaction) || rows.some(reaction => reaction.chosen && isHeart(reaction.emoji)) || false
    setReactionRows(rows)
    setLiked(selected)
  }, [item.id, item.myReaction, item.reactions])'''
if old_sync in s: s = s.replace(old_sync, new_sync, 1)
old_toggle = '''    try {
      await setTelegramReaction(item, next)
    } catch (error) {'''
new_toggle = '''    try {
      const result = await setTelegramReaction(item, next)
      setLiked(Boolean(result.liked))
      if (Array.isArray(result.reactions)) setReactionRows(result.reactions)
    } catch (error) {'''
if old_toggle in s: s = s.replace(old_toggle, new_toggle, 1)
old_verified = '''          {channel.verified && <span className="sg-verified" title="Verified Telegram source">✓</span>}'''
new_verified = '''          {channel.verified && <span className="sg-verified" title="Verified by Telegram" aria-label="Verified by Telegram">✓</span>}
          {channel.scam && <span className="sg-trust-warning" title="Telegram marks this source as scam">Scam</span>}
          {channel.fake && <span className="sg-trust-warning" title="Telegram marks this source as fake">Fake</span>}
          {channel.bot && <span className="sg-source-kind" title="Telegram bot">Bot</span>}'''
if old_verified in s: s = s.replace(old_verified, new_verified, 1)
s = s.replace("<span key={`${String(reaction?.emoji || '♥')}-${i}`}>{String(reaction?.emoji || '♥')} {Number(reaction?.count || 0)}</span>", "<span className={reaction.chosen ? 'is-chosen' : undefined} key={`${String(reaction?.emoji || '♥')}-${i}`}>{String(reaction?.emoji || '♥')} {Number(reaction?.count || 0)}</span>")
s = s.replace('<strong>{source.title}</strong>', "<strong>{source.title}{source.verified ? ' ✓' : ''}</strong>")
old_sheet = '''      <div className="sg-sheet-source"><SourceAvatar channel={channel} /><div><strong>{channel.title}</strong><span>{channel.username ? `@${channel.username}` : channel.type === 'person' ? 'Private chat' : channel.type === 'group' ? 'Group' : 'Telegram source'}</span></div></div>'''
new_sheet = '''      <div className="sg-sheet-source"><SourceAvatar channel={channel} /><div><strong>{channel.title}{channel.verified ? ' ✓' : ''}</strong><span>{channel.username ? `@${channel.username}` : sourceDescriptor(channel)}</span>{channel.scam || channel.fake ? <small className="sg-sheet-trust-warning">{sourceDescriptor(channel)}</small> : null}</div></div>'''
if old_sheet in s: s = s.replace(old_sheet, new_sheet, 1)
p.write_text(s)
