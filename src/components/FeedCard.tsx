import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Skeleton } from '@mui/material'
import type { Channel, FeedItem, FeedMode, StoryMember } from '../types'
import { BookmarkIcon, EyeIcon, HeartIcon, LockIcon, MessageIcon, MoreIcon, SearchIcon, SendIcon } from './Icons'
import { MediaRenderer } from './MediaRenderer'
import { SuccessConfirm } from './SuccessConfirm'
import { BottomSheet } from './BottomSheet'
import { haptics } from '../lib/interaction'
import { buildContextualBrief, fetchShareTargets, forwardTelegramPost, replyToTelegramPost, setTelegramReaction, summarizeMessage, type ShareTarget } from '../lib/api'
import { recordViewerAction, type ViewerActionType } from '../lib/storage'
import { getRankingReasons } from '../lib/ranking'

const HOUR = 60 * 60 * 1000

type Brief = { headline: string; summary: string; ml: boolean }
type BriefState = 'idle' | 'ai' | 'local'
type StoryEntry = { member: StoryMember; channel: Channel }

function timeAgo(timestamp: number) {
  const value = Number(timestamp)
  if (!Number.isFinite(value) || value <= 0) return ''
  const mins = Math.max(1, Math.floor((Date.now() - value) / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function telegramPostUrl(channel: Channel | undefined, messageId?: number) {
  if (!channel?.username || !messageId) return null
  return `https://t.me/${encodeURIComponent(channel.username)}/${Number(messageId)}`
}

function originalPostUrl(item: FeedItem, channel?: Channel) {
  return telegramPostUrl(channel, item.messageId)
}

function cleanText(value: string) {
  return value
    .replace(/https?:\/\/\S+/g, '')
    .replace(/(^|\s)@[\w_]+/g, '$1')
    .replace(/(^|\s)#[\w-]+/g, '$1')
    .replace(/[•▪◦]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clipAtWord(value: string, limit: number) {
  if (value.length <= limit) return value
  const clipped = value.slice(0, limit + 1)
  const cut = clipped.lastIndexOf(' ')
  return `${(cut > limit * .65 ? clipped.slice(0, cut) : clipped.slice(0, limit)).trim()}…`
}

function localBrief(text: string, previousMessages: string[] = [], sourceName = ''): Brief {
  const result = buildContextualBrief(text, { previousMessages, sourceName })
  return { headline: result.headline, summary: result.summary, ml: false }
}

function isHeart(value?: string) {
  return value === '❤' || value === '❤️' || value === '♥' || value === '♥️'
}

function sourceDescriptor(channel: Channel) {
  if (channel.scam) return 'Telegram marks this source as scam'
  if (channel.fake) return 'Telegram marks this source as fake'
  if (channel.bot) return 'Bot'
  if (channel.type === 'person') return 'Private chat'
  if (channel.type === 'group') return 'Group'
  return 'Telegram source'
}

function SourceAvatar({ channel }: { channel: Channel }) {
  const [failed, setFailed] = useState(false)
  const initials = String(channel.initials || channel.title?.slice(0, 2) || 'SG').toUpperCase()
  return <span className="sg-avatar" style={{ background: channel.accent || '#242426' }}>
    {channel.avatar && !failed ? <img src={channel.avatar} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : initials}
  </span>
}

export function FeedCard({
  item,
  channel,
  feedMode,
  favoriteSource,
  summarizePrivateChats,
  storyEntries = [],
  summaryContext = [],
  onSave,
  onRead,
  onFavoriteSource,
  onHideSource,
  onHidePost,
  onFeedback,
  onSourceOpen,
  index = 0
}: {
  item: FeedItem
  channel: Channel
  feedMode: FeedMode
  favoriteSource: boolean
  summarizePrivateChats: boolean
  storyEntries?: StoryEntry[]
  summaryContext?: string[]
  onSave: (item: FeedItem) => void
  onRead: (item: FeedItem) => void
  onFavoriteSource: (channel: Channel) => void
  onHideSource: (channel: Channel) => void
  onHidePost: (item: FeedItem) => void
  onFeedback: (item: FeedItem, type: Extract<ViewerActionType, 'more_like_this' | 'less_like_this'>) => void
  onSourceOpen?: (channel: Channel) => void
  index?: number
}) {
  const root = useRef<HTMLElement>(null)
  const dwellStartedAt = useRef<number | null>(null)
  const impressionLogged = useRef(false)
  const skipLogged = useRef(false)
  const [expanded, setExpanded] = useState(false)
  const [saveConfirm, setSaveConfirm] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const initialHeart = isHeart(item.myReaction) || item.reactions?.some(reaction => reaction.chosen && isHeart(reaction.emoji)) || false
  const [liked, setLiked] = useState(initialHeart)
  const [reactionRows, setReactionRows] = useState<FeedItem['reactions']>(() => Array.isArray(item.reactions) ? item.reactions : [])
  const [likeBusy, setLikeBusy] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareTargets, setShareTargets] = useState<ShareTarget[]>([])
  const [shareLoading, setShareLoading] = useState(false)
  const [shareBusy, setShareBusy] = useState('')
  const [shareQuery, setShareQuery] = useState('')
  const [whyOpen, setWhyOpen] = useState(false)
  const [storyOpen, setStoryOpen] = useState(false)
  const [interactionError, setInteractionError] = useState('')
  const [brief, setBrief] = useState<Brief | null>(null)
  const [briefState, setBriefState] = useState<BriefState>('idle')
  const original = originalPostUrl(item, channel)
  const reactions = useMemo(() => Array.isArray(reactionRows) ? reactionRows.filter(Boolean).slice(0, 6) : [], [reactionRows])
  const media = item.media && typeof item.media === 'object' ? item.media : undefined
  const text = String(item.text || '')
  const ageHours = Math.max(0, (Date.now() - Number(item.timestamp || 0)) / HOUR)
  const privateConversation = item.sourceType === 'person' || channel.type === 'person'
  const minimumBriefLength = 56
  const meaningfulWords = cleanText(text).split(/\s+/).filter(Boolean).length
  const canSummarize = !privateConversation || summarizePrivateChats
  const isNewsBrief = canSummarize && ageHours <= 168 && text.trim().length >= minimumBriefLength && meaningfulWords >= 8
  const storySources = Math.max(0, Number(item.storySources || 0))
  const storyVelocity = Math.max(0, Number(item.storyVelocity || 0))
  const isTrending = Boolean(item.storyClustered && storySources >= 3 && storyVelocity >= .5)
  const hasStoryEvidence = item.storyClustered && storyEntries.length > 1
  const isLong = text.length > 650
  const visibleText = !expanded && isLong ? `${text.slice(0, 650).trimEnd()}…` : text
  const privateSource = Boolean(channel.private || (!channel.username && (channel.type === 'person' || item.sourceType === 'person')))
  const rankingReasons = useMemo(
    () => feedMode === 'latest'
      ? [{ type: 'latest' as const, label: 'Shown in chronological order' }]
      : getRankingReasons(item, { favoriteSources: favoriteSource ? new Set([channel.id]) : undefined }),
    [channel.id, favoriteSource, feedMode, item]
  )
  const filteredShareTargets = useMemo(() => {
    const q = shareQuery.trim().toLowerCase()
    if (!q) return shareTargets
    return shareTargets.filter(target => `${target.title} ${target.username || ''}`.toLowerCase().includes(q))
  }, [shareQuery, shareTargets])

  useEffect(() => {
    const rows = Array.isArray(item.reactions) ? item.reactions : []
    const selected = isHeart(item.myReaction) || rows.some(reaction => reaction.chosen && isHeart(reaction.emoji)) || false
    setReactionRows(rows)
    setLiked(selected)
  }, [item.id, item.myReaction, item.reactions])

  useEffect(() => {
    if (!isNewsBrief) {
      setBrief(null)
      setBriefState('idle')
      return
    }
    const controller = new AbortController()
    const immediate = localBrief(text, summaryContext, channel.title)
    setBrief(immediate)
    setBriefState('local')
    void summarizeMessage(text, {
      outgoing: Boolean(item.outgoing),
      sourceType: item.sourceType || channel.type,
      sourceName: channel.title,
      previousMessages: summaryContext
    }, controller.signal)
      .then(result => {
        if (!result?.headline) return
        setBrief({ headline: result.headline, summary: result.summary || '', ml: Boolean(result.ml) })
        setBriefState(result.ml ? 'ai' : 'local')
      })
      .catch(() => setBriefState('local'))
    return () => controller.abort()
  }, [isNewsBrief, item.id, item.outgoing, item.sourceType, text, channel.title, channel.type, summaryContext])

  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      const entry = entries[0]
      const visible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= .55)
      if (visible) {
        if (!impressionLogged.current) {
          impressionLogged.current = true
          recordViewerAction({ type: 'impression', itemId: item.id, channelId: item.channelId, timestamp: Date.now(), media: Boolean(media) })
        }
        if (dwellStartedAt.current === null) dwellStartedAt.current = Date.now()
      } else if (dwellStartedAt.current !== null) {
        const dwellSeconds = Math.max(0, (Date.now() - dwellStartedAt.current) / 1000)
        dwellStartedAt.current = null
        if (dwellSeconds >= 1.5) {
          recordViewerAction({ type: 'dwell', itemId: item.id, channelId: item.channelId, timestamp: Date.now(), value: dwellSeconds, media: Boolean(media) })
        } else if (impressionLogged.current && !skipLogged.current) {
          skipLogged.current = true
          recordViewerAction({ type: 'skip', itemId: item.id, channelId: item.channelId, timestamp: Date.now(), value: dwellSeconds, media: Boolean(media) })
        }
      }
    }, { threshold: [.15, .55, .85] })
    observer.observe(el)
    return () => observer.disconnect()
  }, [item.id, item.channelId, media])


  async function toggleLike() {
    if (likeBusy) return
    const next = !liked
    setLiked(next)
    setLikeBusy(true)
    setInteractionError('')
    haptics.light()
    try {
      const result = await setTelegramReaction(item, next)
      setLiked(Boolean(result.liked))
      if (Array.isArray(result.reactions)) setReactionRows(result.reactions)
    } catch (error) {
      setLiked(!next)
      setInteractionError(String((error as Error)?.message || 'Could not update reaction.'))
      haptics.error()
    } finally {
      setLikeBusy(false)
    }
  }

  async function sendReply() {
    const value = replyText.trim()
    if (!value || replyBusy) return
    setReplyBusy(true)
    setInteractionError('')
    try {
      await replyToTelegramPost(item, value)
      setReplyText('')
      setReplyOpen(false)
      haptics.success()
    } catch (error) {
      setInteractionError(String((error as Error)?.message || 'Could not send reply.'))
      haptics.error()
    } finally {
      setReplyBusy(false)
    }
  }

  async function openShare() {
    if (item.noForwards) return
    setShareOpen(true)
    if (shareTargets.length || shareLoading) return
    setShareLoading(true)
    setInteractionError('')
    try {
      const result = await fetchShareTargets()
      setShareTargets(Array.isArray(result.targets) ? result.targets : [])
    } catch (error) {
      setInteractionError(String((error as Error)?.message || 'Could not load contacts.'))
    } finally {
      setShareLoading(false)
    }
  }

  async function forwardTo(targetId: string) {
    if (shareBusy) return
    setShareBusy(targetId)
    setInteractionError('')
    try {
      await forwardTelegramPost(item, targetId)
      setShareOpen(false)
      haptics.success()
    } catch (error) {
      setInteractionError(String((error as Error)?.message || 'Could not forward post.'))
      haptics.error()
    } finally {
      setShareBusy('')
    }
  }

  const handleSave = useCallback(() => {
    haptics.light()
    const saving = !item.saved
    recordViewerAction({ type: saving ? 'save' : 'unsave', itemId: item.id, channelId: item.channelId, timestamp: Date.now(), media: Boolean(media) })
    onSave(item)
    if (saving) setSaveConfirm(true)
  }, [item, media, onSave])

  const handleRead = useCallback(() => {
    if (item.unread) onRead(item)
  }, [item, onRead])

  function handleOriginalOpen() {
    recordViewerAction({ type: 'open', itemId: item.id, channelId: item.channelId, timestamp: Date.now(), media: Boolean(media) })
    handleRead()
  }

  function applyFeedback(type: 'more_like_this' | 'less_like_this') {
    onFeedback(item, type)
    setMoreOpen(false)
    haptics.selection()
  }

  const briefLabel = summaryContext.length ? 'Context brief' : 'Condensed'

  return <article ref={root} className={`sg-post ${item.unread ? 'is-unread' : ''} ${media ? 'has-media' : 'text-only'} ${isNewsBrief ? 'is-news-brief' : ''} ${isTrending ? 'is-trending' : ''}`} data-feed-index={index}>
    <header className="sg-post-head">
      <button type="button" className="sg-source-open" onClick={() => onSourceOpen?.(channel)} aria-label={`Open ${channel.title} source details`}><SourceAvatar channel={channel} /></button>
      <div className="sg-post-who">
        <div className="sg-source-line">
          <button type="button" onClick={() => onSourceOpen?.(channel)}>{String(channel.title || 'Telegram')}</button>
          {privateSource && <LockIcon className="sg-private-icon" />}
          {channel.verified && <span className="sg-verified" title="Verified by Telegram" aria-label="Verified by Telegram">✓</span>}
          {channel.scam && <span className="sg-trust-warning" title="Telegram marks this source as scam">Scam</span>}
          {channel.fake && <span className="sg-trust-warning" title="Telegram marks this source as fake">Fake</span>}
          {channel.bot && <span className="sg-source-kind" title="Telegram bot">Bot</span>}
        </div>
        <span>{channel.username ? `@${channel.username}` : channel.type === 'group' ? 'Group' : channel.type === 'person' ? 'Private chat' : 'Telegram'} · <time dateTime={new Date(item.timestamp).toISOString()} title={new Date(item.timestamp).toLocaleString()}>{timeAgo(item.timestamp)}</time>{item.outgoing ? ' · sent by you' : ''}{storySources > 1 ? ` · ${storySources} sources` : ''}{item.edited ? ' · edited' : ''}</span>
      </div>
      {isTrending ? <button type="button" className="sg-trending-badge" onClick={() => hasStoryEvidence ? setStoryOpen(true) : setWhyOpen(true)}>Trending · {storySources}</button> : null}
      {item.unread && <span className="sg-unread-dot" title="Unread" />}
      <button className="sg-icon-button sg-more pressable" onClick={() => { haptics.light(); setMoreOpen(true) }} aria-label="Post options"><MoreIcon /></button>
    </header>

    {media && <div className={`sg-media sg-media-${media.kind}`}><MediaRenderer media={media} /></div>}

    {isNewsBrief ? <div className="sg-news-brief">
      <span className="sg-news-kicker">{storySources > 1 ? `${storySources} sources · ` : ''}{briefLabel}</span>
      <strong>{brief?.headline || localBrief(text, summaryContext, channel.title).headline}</strong>
      {(brief?.summary || localBrief(text, summaryContext, channel.title).summary) && <p>{brief?.summary || localBrief(text, summaryContext, channel.title).summary}</p>}
      {hasStoryEvidence ? <button type="button" className="sg-story-evidence-link" onClick={() => setStoryOpen(true)}>View {storySources} sources</button> : null}
      <button type="button" className="sg-news-expand pressable" onClick={() => { if (!expanded) handleRead(); setExpanded(value => !value) }}>{expanded ? 'Hide original' : 'Read original'}</button>
      {expanded && <div className="sg-news-original">{text}</div>}
    </div> : visibleText && <div className={`sg-caption ${media ? '' : 'sg-text-post'}`}>
      <span className="sg-caption-source">{String(channel.title || 'Telegram')}</span>{' '}
      <span>{visibleText}</span>
      {isLong && <button className="sg-more-text pressable" onClick={() => setExpanded(value => !value)}>{expanded ? 'less' : 'more'}</button>}
    </div>}

    <div className="sg-post-actions sg-post-actions-ref">
      <div className="sg-actions-left">
        <button className={`sg-action pressable sg-like ${liked ? 'is-liked' : ''}`} disabled={likeBusy} onClick={() => void toggleLike()} aria-label={liked ? 'Unlike on Telegram' : 'Like on Telegram'}><HeartIcon /></button>
        <button className="sg-action pressable" onClick={() => { setInteractionError(''); setReplyOpen(true) }} aria-label="Reply on Telegram"><MessageIcon /></button>
        <button className={`sg-action pressable ${item.noForwards ? 'is-disabled' : ''}`} disabled={item.noForwards} onClick={() => void openShare()} aria-label={item.noForwards ? 'Forwarding restricted' : 'Forward to Telegram contact'}><SendIcon /></button>
      </div>
      <span className="sg-save-slot"><button className={`sg-action pressable ${item.saved ? 'is-active' : ''}`} onClick={handleSave} aria-label={item.saved ? 'Remove from saved' : 'Save'}><BookmarkIcon /></button>{saveConfirm ? <SuccessConfirm onComplete={() => setSaveConfirm(false)} /> : null}</span>
    </div>
    {interactionError && <div className="sg-interaction-error" role="status">{interactionError}</div>}

    {(reactions.length > 0 || item.views || item.comments) && <div className="sg-engagement">
      {reactions.length > 0 && <span className="sg-reaction-summary">{reactions.map((reaction, i) => <span className={reaction.chosen ? 'is-chosen' : undefined} key={`${String(reaction?.emoji || '♥')}-${i}`}>{String(reaction?.emoji || '♥')} {Number(reaction?.count || 0)}</span>)}</span>}
      <span className="sg-stats">{item.views && <span><EyeIcon />{String(item.views)}</span>}{!!Number(item.comments || 0) && <span><MessageIcon />{Number(item.comments || 0)}</span>}</span>
    </div>}

    <BottomSheet open={replyOpen} onClose={() => setReplyOpen(false)} title="Reply">
      <div className="sg-reply-box">
        <div className="sg-reply-context"><strong>{channel.title}</strong><span>{clipAtWord(cleanText(text) || 'Original post', 120)}</span></div>
        <textarea value={replyText} onChange={event => setReplyText(event.target.value)} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void sendReply() }} placeholder="Write a reply…" autoFocus />
        <button type="button" disabled={!replyText.trim() || replyBusy} onClick={() => void sendReply()}>{replyBusy ? 'Sending…' : 'Reply on Telegram'}</button>
      </div>
    </BottomSheet>

    <BottomSheet open={shareOpen} onClose={() => setShareOpen(false)} title="Forward to">
      <div className="sg-share-picker">
        <label className="sg-share-search"><SearchIcon /><input value={shareQuery} onChange={event => setShareQuery(event.target.value)} placeholder="Search contacts" aria-label="Search Telegram contacts" /></label>
        {shareLoading ? <><Skeleton height={52} /><Skeleton height={52} /><Skeleton height={52} /></> : filteredShareTargets.length ? filteredShareTargets.map(target => <button type="button" key={target.id} disabled={Boolean(shareBusy)} onClick={() => void forwardTo(target.id)}><span className="sg-share-avatar" style={{ background: target.accent || '#777' }}>{target.initials || target.title.slice(0, 2).toUpperCase()}</span><span><strong>{target.title}</strong>{target.username && <small>@{target.username}</small>}</span><em>{shareBusy === target.id ? 'Sending…' : 'Send'}</em></button>) : <div className="sg-share-empty">No Telegram contacts found.</div>}
      </div>
    </BottomSheet>

    <BottomSheet open={whyOpen} onClose={() => setWhyOpen(false)} title="Why this post?">
      <div className="sg-why-list">{rankingReasons.length ? rankingReasons.map(reason => <div key={reason.type}><strong>{reason.label}</strong></div>) : <div><strong>Part of your current feed</strong></div>}</div>
    </BottomSheet>

    <BottomSheet open={storyOpen} onClose={() => setStoryOpen(false)} title={`${storySources || storyEntries.length} sources`}>
      <div className="sg-story-sources">
        {storyEntries.map(({ member, channel: source }) => {
          const url = telegramPostUrl(source, member.messageId)
          return <article key={`${member.channelId}:${member.messageId}`} className="sg-story-source-row">
            <SourceAvatar channel={source} />
            <div className="sg-story-source-copy">
              <strong>{source.title}{source.verified ? ' ✓' : ''}</strong>
              <span>{source.username ? `@${source.username}` : source.type === 'group' ? 'Group' : source.type === 'person' ? 'Private chat' : 'Telegram'} · <time dateTime={new Date(member.timestamp).toISOString()}>{timeAgo(member.timestamp)}</time></span>
              <p>{clipAtWord(cleanText(member.text) || 'Telegram post', 180)}</p>
            </div>
            {url ? <a href={url} target="_blank" rel="noreferrer">Open</a> : null}
          </article>
        })}
        {!storyEntries.length ? <div className="sg-share-empty">Source evidence is not available for this story.</div> : null}
      </div>
    </BottomSheet>

    <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={channel.title || 'Post options'}>
      <div className="sg-sheet-source"><SourceAvatar channel={channel} /><div><strong>{channel.title}{channel.verified ? ' ✓' : ''}</strong><span>{channel.username ? `@${channel.username}` : sourceDescriptor(channel)}</span>{channel.scam || channel.fake ? <small className="sg-sheet-trust-warning">{sourceDescriptor(channel)}</small> : null}</div></div>
      <div className="sg-sheet-actions">
        <button type="button" className="pressable" onClick={() => { setMoreOpen(false); setWhyOpen(true) }}><EyeIcon /><span><strong>Why this post?</strong><small>{feedMode === 'latest' ? 'Latest is ordered chronologically' : 'See what influenced its position'}</small></span></button>
        {hasStoryEvidence ? <button type="button" className="pressable" onClick={() => { setMoreOpen(false); setStoryOpen(true) }}><MessageIcon /><span><strong>View {storySources} sources</strong><small>Inspect the Telegram posts grouped into this story</small></span></button> : null}
        {feedMode === 'for-you' ? <>
          <button type="button" className="pressable" onClick={() => applyFeedback('more_like_this')}><HeartIcon /><span><strong>More like this</strong><small>Increase this source’s relevance in For You</small></span></button>
          <button type="button" className="pressable" onClick={() => applyFeedback('less_like_this')}><EyeIcon /><span><strong>Less like this</strong><small>Reduce this source’s relevance in For You</small></span></button>
        </> : null}
        <button type="button" className="pressable" onClick={() => { onFavoriteSource(channel); setMoreOpen(false) }}><BookmarkIcon /><span><strong>{favoriteSource ? 'Remove favorite source' : 'Favorite source'}</strong><small>{favoriteSource ? 'Return this source to normal priority' : 'Keep this source easier to find'}</small></span></button>
        {item.unread ? <button type="button" className="pressable" onClick={() => { handleRead(); setMoreOpen(false) }}><EyeIcon /><span><strong>Mark read in Supergram</strong><small>This does not change Telegram read receipts</small></span></button> : null}
        <button type="button" className="pressable" onClick={() => { handleSave(); setMoreOpen(false) }}><BookmarkIcon /><span><strong>{item.saved ? 'Remove from Supergram saved' : 'Save post'}</strong><small>{item.saved ? 'The Telegram Saved Messages copy is kept' : 'Save in Supergram and forward a copy to Telegram Saved Messages'}</small></span></button>
        {!item.noForwards ? <button type="button" className="pressable" onClick={() => { setMoreOpen(false); void openShare() }}><SendIcon /><span><strong>Forward</strong><small>Send to a Telegram contact</small></span></button> : null}
        {feedMode === 'for-you' ? <button type="button" className="pressable" onClick={() => { onHideSource(channel); setMoreOpen(false) }}><LockIcon /><span><strong>Hide source from For You</strong><small>Latest will still show this source</small></span></button> : null}
        <button type="button" className="pressable" onClick={() => { onHidePost(item); setMoreOpen(false) }}><EyeIcon /><span><strong>Hide this post</strong><small>Remove it from Supergram on this device</small></span></button>
        {original ? <a className="pressable" href={original} target="_blank" rel="noreferrer" onClick={() => { handleOriginalOpen(); setMoreOpen(false) }}><MessageIcon /><span><strong>Open in Telegram</strong><small>View this message in its original source</small></span></a> : null}
      </div>
    </BottomSheet>
  </article>
}
