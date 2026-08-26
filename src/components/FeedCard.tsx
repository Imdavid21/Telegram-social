import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Skeleton } from '@mui/material'
import type { Channel, FeedItem } from '../types'
import { BookmarkIcon, EyeIcon, HeartIcon, LockIcon, MessageIcon, MoreIcon, SendIcon } from './Icons'
import { MediaRenderer } from './MediaRenderer'
import { SuccessConfirm } from './SuccessConfirm'
import { BottomSheet } from './BottomSheet'
import { haptics } from '../lib/interaction'
import { fetchShareTargets, forwardTelegramPost, replyToTelegramPost, setTelegramReaction, summarizeMessage, type ShareTarget } from '../lib/api'
import { recordViewerAction } from '../lib/storage'

const HOUR = 60 * 60 * 1000
const URGENT_TERMS = /\b(breaking|urgent|alert|deadline|today|now|live|incident|outage|exploit|hack|hacked|breach|warning|critical|launch|listing|delist|airdrop|snapshot|vote|proposal|claim|ends? in|last chance|action required|security)\b/i

type Brief = { headline: string; summary: string; ml: boolean }
type BriefState = 'idle' | 'loading' | 'ai' | 'local'

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

function originalPostUrl(item: FeedItem, channel?: Channel) {
  if (!channel?.username || !item.messageId) return null
  return `https://t.me/${encodeURIComponent(channel.username)}/${Number(item.messageId)}`
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

function localBrief(text: string): Brief {
  const cleaned = cleanText(text)
  if (!cleaned) return { headline: 'Telegram update', summary: '', ml: false }
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean)
  const first = sentences[0] || cleaned
  const headline = clipAtWord(first.replace(/[.!?]+$/, '').trim(), 94)
  const summary = clipAtWord(sentences.slice(1, 3).join(' ').trim() || cleaned, 230)
  return { headline, summary: summary === headline ? '' : summary, ml: false }
}

function SourceAvatar({ channel }: { channel: Channel }) {
  const [failed, setFailed] = useState(false)
  const initials = String(channel.initials || channel.title?.slice(0, 2) || 'SG').toUpperCase()
  return <span className="sg-avatar" style={{ background: channel.accent || '#2AABEE' }}>
    {channel.avatar && !failed ? <img src={channel.avatar} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : initials}
  </span>
}

export function FeedCard({ item, channel, onSave, onRead, index = 0 }: {
  item: FeedItem
  channel: Channel
  live?: boolean
  onSave: (item: FeedItem) => void
  onRead: (item: FeedItem) => void
  index?: number
}) {
  const root = useRef<HTMLElement>(null)
  const dwellStartedAt = useRef<number | null>(null)
  const impressionLogged = useRef(false)
  const skipLogged = useRef(false)
  const [expanded, setExpanded] = useState(false)
  const [saveConfirm, setSaveConfirm] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareTargets, setShareTargets] = useState<ShareTarget[]>([])
  const [shareLoading, setShareLoading] = useState(false)
  const [shareBusy, setShareBusy] = useState('')
  const [interactionError, setInteractionError] = useState('')
  const [brief, setBrief] = useState<Brief | null>(null)
  const [briefState, setBriefState] = useState<BriefState>('idle')
  const original = originalPostUrl(item, channel)
  const reactions = useMemo(() => Array.isArray(item.reactions) ? item.reactions.filter(Boolean).slice(0, 6) : [], [item.reactions])
  const media = item.media && typeof item.media === 'object' ? item.media : undefined
  const text = String(item.text || '')
  const ageHours = Math.max(0, (Date.now() - Number(item.timestamp || 0)) / HOUR)
  const privateConversation = item.sourceType === 'person' || channel.type === 'person'
  const minimumBriefLength = privateConversation ? 24 : 56
  const meaningfulWords = cleanText(text).split(/\s+/).filter(Boolean).length
  const isNewsBrief = ageHours <= 168 && text.trim().length >= minimumBriefLength && meaningfulWords >= (privateConversation ? 5 : 8)
  const isUrgent = URGENT_TERMS.test(text)
  const storySources = Math.max(0, Number(item.storySources || 0))
  const storyVelocity = Math.max(0, Number(item.storyVelocity || 0))
  const isTrending = Boolean(item.storyClustered && (storySources >= 3 || storyVelocity >= 1.25))
  const isLong = text.length > 650
  const visibleText = !expanded && isLong ? `${text.slice(0, 650).trimEnd()}…` : text
  const privateSource = Boolean(channel.private || (!channel.username && (channel.type === 'person' || item.sourceType === 'person')))

  useEffect(() => {
    if (!isNewsBrief) {
      setBrief(null)
      setBriefState('idle')
      return
    }
    const controller = new AbortController()
    const immediate = localBrief(text)
    setBrief(immediate)
    setBriefState('local')
    void summarizeMessage(text, {
      outgoing: Boolean(item.outgoing),
      sourceType: item.sourceType || channel.type,
      sourceName: channel.title
    }, controller.signal)
      .then(result => {
        if (!result?.headline) {
          setBriefState('local')
          return
        }
        setBrief({ headline: result.headline, summary: result.summary || '', ml: Boolean(result.ml) })
        setBriefState(result.ml ? 'ai' : 'local')
      })
      .catch(() => setBriefState('local'))
    return () => controller.abort()
  }, [isNewsBrief, item.id, item.outgoing, item.sourceType, text, channel.title, channel.type])

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
    return () => {
      if (dwellStartedAt.current !== null) {
        const dwellSeconds = Math.max(0, (Date.now() - dwellStartedAt.current) / 1000)
        if (dwellSeconds >= 1.5) recordViewerAction({ type: 'dwell', itemId: item.id, channelId: item.channelId, timestamp: Date.now(), value: dwellSeconds, media: Boolean(media) })
      }
      observer.disconnect()
    }
  }, [item.id, item.channelId, media])

  useEffect(() => {
    const el = root.current
    if (!el || !item.unread || typeof IntersectionObserver === 'undefined') return
    let timer: number | undefined
    let done = false
    const observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .6)
      if (visible && !done && timer === undefined) {
        timer = window.setTimeout(() => {
          done = true
          onRead(item)
          observer.disconnect()
        }, 700)
      } else if (!visible && timer !== undefined) {
        window.clearTimeout(timer)
        timer = undefined
      }
    }, { threshold: [.25, .6, .85] })
    observer.observe(el)
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [item.id, item.unread, onRead])

  async function toggleLike() {
    if (likeBusy) return
    const next = !liked
    setLiked(next); setLikeBusy(true); setInteractionError(''); haptics.light()
    try { await setTelegramReaction(item, next) } catch (error) { setLiked(!next); setInteractionError(String((error as Error)?.message || 'Could not update reaction.')); haptics.error() } finally { setLikeBusy(false) }
  }
  async function sendReply() {
    const value = replyText.trim(); if (!value || replyBusy) return
    setReplyBusy(true); setInteractionError('')
    try { await replyToTelegramPost(item, value); setReplyText(''); setReplyOpen(false); haptics.success() } catch (error) { setInteractionError(String((error as Error)?.message || 'Could not send reply.')); haptics.error() } finally { setReplyBusy(false) }
  }
  async function openShare() {
    if (item.noForwards) return
    setShareOpen(true); if (shareTargets.length || shareLoading) return
    setShareLoading(true); setInteractionError('')
    try { const result = await fetchShareTargets(); setShareTargets(Array.isArray(result.targets) ? result.targets : []) } catch (error) { setInteractionError(String((error as Error)?.message || 'Could not load contacts.')) } finally { setShareLoading(false) }
  }
  async function forwardTo(targetId: string) {
    if (shareBusy) return
    setShareBusy(targetId); setInteractionError('')
    try { await forwardTelegramPost(item, targetId); setShareOpen(false); haptics.success() } catch (error) { setInteractionError(String((error as Error)?.message || 'Could not forward post.')); haptics.error() } finally { setShareBusy('') }
  }

  const handleSave = useCallback(() => {
    haptics.light()
    const saving = !item.saved
    recordViewerAction({ type: saving ? 'save' : 'unsave', itemId: item.id, channelId: item.channelId, timestamp: Date.now(), media: Boolean(media) })
    onSave(item)
    if (saving) setSaveConfirm(true)
  }, [item, media, onSave])

  function openMore() {
    haptics.light()
    setMoreOpen(true)
  }

  function handleOriginalOpen() {
    recordViewerAction({ type: 'open', itemId: item.id, channelId: item.channelId, timestamp: Date.now(), media: Boolean(media) })
  }

  const briefLabel = briefState === 'ai' ? 'AI brief' : 'Smart brief'

  return <article ref={root} className={`sg-post ${item.unread ? 'is-unread' : ''} ${media ? 'has-media' : 'text-only'} ${isNewsBrief ? 'is-news-brief' : ''} ${isUrgent ? 'is-priority' : ''} ${isTrending ? 'is-trending' : ''} ${saveConfirm ? 'is-confirming' : ''}`} data-feed-index={index}>
    <header className="sg-post-head">
      <SourceAvatar channel={channel} />
      <div className="sg-post-who">
        <div className="sg-source-line">
          <strong>{String(channel.title || 'Telegram')}</strong>
          {privateSource && <LockIcon className="sg-private-icon" />}
          {channel.username && <span className="sg-verified">✓</span>}
        </div>
        <span>{channel.username ? `@${channel.username}` : channel.type === 'group' ? 'Group' : channel.type === 'person' ? 'Private chat' : 'Telegram'} · {timeAgo(item.timestamp)}{item.outgoing ? ' · sent by you' : ''}{storySources > 1 ? ` · ${storySources} sources` : ''}{item.edited ? ' · edited' : ''}</span>
      </div>
      {isUrgent ? <span className="sg-priority-badge">Priority</span> : isTrending ? <span className="sg-trending-badge">Trending</span> : null}
      {item.unread && <span className="sg-unread-dot" title="Unread" />}
      <button className="sg-icon-button sg-more pressable" onClick={openMore} aria-label="Post options"><MoreIcon /></button>
    </header>

    {media && <div className={`sg-media sg-media-${media.kind}`}><MediaRenderer media={media} /></div>}

    {isNewsBrief ? <div className="sg-news-brief">
      <span className="sg-news-kicker">{storySources > 1 ? `${storySources} sources · ` : ''}{briefLabel} · {timeAgo(item.timestamp)}</span>
      {briefState === 'loading' && !brief ? <><Skeleton width="78%" height={34} /><Skeleton width="92%" /><Skeleton width="66%" /></> : <>
        <strong>{brief?.headline || localBrief(text).headline}</strong>
        {(brief?.summary || localBrief(text).summary) && <p>{brief?.summary || localBrief(text).summary}</p>}
      </>}
      <button type="button" className="sg-news-expand pressable" onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide original' : 'Read original'}</button>
      {expanded && <div className="sg-news-original">{text}</div>}
    </div> : visibleText && <div className={`sg-caption ${media ? '' : 'sg-text-post'}`}>
      <span className="sg-caption-source">{String(channel.title || 'Telegram')}</span>{' '}
      <span>{visibleText}</span>
      {isLong && <button className="sg-more-text pressable" onClick={() => setExpanded(value => !value)}>{expanded ? 'less' : 'more'}</button>}
    </div>}

    <div className="sg-post-actions sg-post-actions-ref">
      <div className="sg-actions-left">
        <button className={`sg-action pressable sg-like ${liked ? 'is-liked' : ''}`} disabled={likeBusy} onClick={() => void toggleLike()} aria-label={liked ? 'Unlike on Telegram' : 'Like on Telegram'}><HeartIcon /></button>
        <button className="sg-action pressable" onClick={() => { setInteractionError(''); setReplyOpen(true) }} aria-label="Quote reply on Telegram"><MessageIcon /></button>
        <button className={`sg-action pressable ${item.noForwards ? 'is-disabled' : ''}`} disabled={item.noForwards} onClick={() => void openShare()} aria-label={item.noForwards ? 'Forwarding restricted' : 'Forward to contact'}><SendIcon /></button>
      </div>
      <span className="sg-save-slot"><button className={`sg-action pressable ${item.saved ? 'is-active' : ''}`} onClick={handleSave} aria-label={item.saved ? 'Remove from saved' : 'Save'}><BookmarkIcon /></button>{saveConfirm ? <SuccessConfirm onComplete={() => setSaveConfirm(false)} /> : null}</span>
    </div>
    {interactionError && <div className="sg-interaction-error">{interactionError}</div>}

    {(reactions.length > 0 || item.views || item.comments) && <div className="sg-engagement">
      {reactions.length > 0 && <span className="sg-reaction-summary">{reactions.map((reaction, i) => <span key={`${String(reaction?.emoji || '♥')}-${i}`}>{String(reaction?.emoji || '♥')} {Number(reaction?.count || 0)}</span>)}</span>}
      <span className="sg-stats">
        {item.views && <span><EyeIcon />{String(item.views)}</span>}
        {!!Number(item.comments || 0) && <span><MessageIcon />{Number(item.comments || 0)}</span>}
      </span>
    </div>}

    <BottomSheet open={replyOpen} onClose={() => setReplyOpen(false)} title="Reply"><div className="sg-reply-box"><div className="sg-reply-context"><strong>{channel.title}</strong><span>{clipAtWord(cleanText(text) || 'Original post', 120)}</span></div><textarea value={replyText} onChange={event => setReplyText(event.target.value)} placeholder="Write a reply…" autoFocus /><button type="button" disabled={!replyText.trim() || replyBusy} onClick={() => void sendReply()}>{replyBusy ? 'Sending…' : 'Reply on Telegram'}</button></div></BottomSheet>

    <BottomSheet open={shareOpen} onClose={() => setShareOpen(false)} title="Forward to"><div className="sg-share-picker">{shareLoading ? <><Skeleton height={52} /><Skeleton height={52} /><Skeleton height={52} /></> : shareTargets.length ? shareTargets.map(target => <button type="button" key={target.id} disabled={Boolean(shareBusy)} onClick={() => void forwardTo(target.id)}><span className="sg-share-avatar" style={{ background: target.accent || '#777' }}>{target.initials || target.title.slice(0, 2).toUpperCase()}</span><span><strong>{target.title}</strong>{target.username && <small>@{target.username}</small>}</span><em>{shareBusy === target.id ? 'Sending…' : 'Send'}</em></button>) : <div className="sg-share-empty">No Telegram contacts found.</div>}</div></BottomSheet>

    <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={channel.title || 'Post options'}>
      <div className="sg-sheet-source"><SourceAvatar channel={channel} /><div><strong>{channel.title}</strong><span>{channel.username ? `@${channel.username}` : channel.type === 'person' ? 'Private chat' : channel.type === 'group' ? 'Group' : 'Telegram source'}</span></div></div>
      <div className="sg-sheet-actions">
        <button type="button" className="pressable" onClick={() => { handleSave(); setMoreOpen(false) }}><BookmarkIcon /><span><strong>{item.saved ? 'Remove saved post' : 'Save post'}</strong><small>{item.saved ? 'Keep it only in the feed' : 'Add it to your saved state'}</small></span></button>
        {!item.noForwards ? <button type="button" className="pressable" onClick={() => { void share(); setMoreOpen(false) }}><SendIcon /><span><strong>Share</strong><small>Use your device share sheet or copy the post</small></span></button> : null}
        {original ? <a className="pressable" href={original} target="_blank" rel="noreferrer" onClick={() => { handleOriginalOpen(); setMoreOpen(false) }}><MessageIcon /><span><strong>Open in Telegram</strong><small>View this message in its original source</small></span></a> : null}
      </div>
    </BottomSheet>
  </article>
}
