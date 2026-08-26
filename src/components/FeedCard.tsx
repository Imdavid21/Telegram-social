import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Channel, FeedItem } from '../types'
import { BookmarkIcon, EyeIcon, LockIcon, MessageIcon, MoreIcon, SendIcon } from './Icons'
import { MediaRenderer } from './MediaRenderer'
import { SuccessConfirm } from './SuccessConfirm'
import { BottomSheet } from './BottomSheet'
import { haptics } from '../lib/interaction'

const HOUR = 60 * 60 * 1000
const URGENT_TERMS = /\b(breaking|urgent|alert|deadline|today|now|live|incident|outage|exploit|hack|hacked|breach|warning|critical|launch|listing|delist|airdrop|snapshot|vote|proposal|claim|ends? in|last chance|action required|security)\b/i

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

function makeNewsBrief(text: string) {
  const cleaned = cleanText(text)
  if (!cleaned) return { headline: 'Telegram update', brief: '' }

  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean)
  const first = sentences[0] || cleaned
  let headline = first.replace(/[.!?]+$/, '').trim()

  if (headline.length > 94) {
    const lead = headline.split(/[:;–-]/)[0]?.trim()
    headline = lead && lead.length >= 24 && lead.length <= 94 ? lead : clipAtWord(headline, 88)
  }

  const remaining = sentences.slice(1).join(' ').trim()
  const fallback = cleaned.slice(first.length).trim().replace(/^[.!?\s-]+/, '')
  const brief = clipAtWord(remaining || fallback || cleaned, 230)

  return { headline: clipAtWord(headline, 94), brief: brief === headline ? '' : brief }
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
  const [expanded, setExpanded] = useState(false)
  const [saveConfirm, setSaveConfirm] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const original = originalPostUrl(item, channel)
  const reactions = useMemo(() => Array.isArray(item.reactions) ? item.reactions.filter(Boolean).slice(0, 6) : [], [item.reactions])
  const media = item.media && typeof item.media === 'object' ? item.media : undefined
  const text = String(item.text || '')
  const ageHours = Math.max(0, (Date.now() - Number(item.timestamp || 0)) / HOUR)
  const isNewsBrief = !media && ageHours >= 24 && ageHours <= 168 && text.trim().length > 80
  const newsBrief = useMemo(() => makeNewsBrief(text), [text])
  const isUrgent = URGENT_TERMS.test(text)
  const isLong = text.length > 650
  const visibleText = !expanded && isLong ? `${text.slice(0, 650).trimEnd()}…` : text
  const privateSource = Boolean(channel.private || (!channel.username && (channel.type === 'person' || item.sourceType === 'person')))

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

  const share = async () => {
    if (item.noForwards) return
    haptics.light()
    const payload = { title: String(channel.title || 'Supergram'), text, url: original || location.href }
    if (navigator.share) await navigator.share(payload).catch(() => {})
    else await navigator.clipboard?.writeText([payload.text, payload.url].filter(Boolean).join('\n\n')).catch(() => {})
  }

  const handleSave = useCallback(() => {
    haptics.light()
    const saving = !item.saved
    onSave(item)
    if (saving) setSaveConfirm(true)
  }, [item, onSave])

  function openMore() {
    haptics.light()
    setMoreOpen(true)
  }

  return <article ref={root} className={`sg-post ${item.unread ? 'is-unread' : ''} ${media ? 'has-media' : 'text-only'} ${isNewsBrief ? 'is-news-brief' : ''} ${isUrgent ? 'is-priority' : ''} ${saveConfirm ? 'is-confirming' : ''}`} data-feed-index={index}>
    <header className="sg-post-head">
      <SourceAvatar channel={channel} />
      <div className="sg-post-who">
        <div className="sg-source-line">
          <strong>{String(channel.title || 'Telegram')}</strong>
          {privateSource && <LockIcon className="sg-private-icon" />}
          {channel.username && <span className="sg-verified">✓</span>}
        </div>
        <span>{channel.username ? `@${channel.username}` : channel.type === 'group' ? 'Group' : channel.type === 'person' ? 'Private chat' : 'Telegram'} · {timeAgo(item.timestamp)}{item.edited ? ' · edited' : ''}</span>
      </div>
      {isUrgent && <span className="sg-priority-badge">Priority</span>}
      {item.unread && <span className="sg-unread-dot" title="Unread" />}
      <button className="sg-icon-button sg-more pressable" onClick={openMore} aria-label="Post options"><MoreIcon /></button>
    </header>

    {media && <div className={`sg-media sg-media-${media.kind}`}><MediaRenderer media={media} /></div>}

    {isNewsBrief ? <div className="sg-news-brief">
      <span className="sg-news-kicker">Brief · {timeAgo(item.timestamp)}</span>
      <strong>{newsBrief.headline}</strong>
      {newsBrief.brief && <p>{newsBrief.brief}</p>}
      <button type="button" className="sg-news-expand pressable" onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide original' : 'Read original'}</button>
      {expanded && <div className="sg-news-original">{text}</div>}
    </div> : visibleText && <div className={`sg-caption ${media ? '' : 'sg-text-post'}`}>
      <span className="sg-caption-source">{String(channel.title || 'Telegram')}</span>{' '}
      <span>{visibleText}</span>
      {isLong && <button className="sg-more-text pressable" onClick={() => setExpanded(value => !value)}>{expanded ? 'less' : 'more'}</button>}
    </div>}

    <div className="sg-post-actions">
      <div className="sg-actions-left">
        <button className={`sg-action pressable ${item.noForwards ? 'is-disabled' : ''}`} disabled={item.noForwards} onClick={share} aria-label={item.noForwards ? 'Sharing restricted' : 'Share'}><SendIcon /></button>
        {original ? <a className="sg-action pressable" href={original} target="_blank" rel="noreferrer" aria-label="Open in Telegram"><MessageIcon /></a> : <span className="sg-action is-disabled" title="Private source"><MessageIcon /></span>}
      </div>
      <span className="sg-save-slot">
        <button className={`sg-action pressable ${item.saved ? 'is-active' : ''}`} onClick={handleSave} aria-label={item.saved ? 'Remove from saved' : 'Save'}><BookmarkIcon /></button>
        {saveConfirm ? <SuccessConfirm onComplete={() => setSaveConfirm(false)} /> : null}
      </span>
    </div>

    {(reactions.length > 0 || item.views || item.comments) && <div className="sg-engagement">
      {reactions.length > 0 && <span className="sg-reaction-summary">{reactions.map((reaction, i) => <span key={`${String(reaction?.emoji || '♥')}-${i}`}>{String(reaction?.emoji || '♥')} {Number(reaction?.count || 0)}</span>)}</span>}
      <span className="sg-stats">
        {item.views && <span><EyeIcon />{String(item.views)}</span>}
        {!!Number(item.comments || 0) && <span><MessageIcon />{Number(item.comments || 0)}</span>}
      </span>
    </div>}

    <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={channel.title || 'Post options'}>
      <div className="sg-sheet-source"><SourceAvatar channel={channel} /><div><strong>{channel.title}</strong><span>{channel.username ? `@${channel.username}` : channel.type === 'person' ? 'Private chat' : channel.type === 'group' ? 'Group' : 'Telegram source'}</span></div></div>
      <div className="sg-sheet-actions">
        <button type="button" className="pressable" onClick={() => { handleSave(); setMoreOpen(false) }}><BookmarkIcon /><span><strong>{item.saved ? 'Remove saved post' : 'Save post'}</strong><small>{item.saved ? 'Keep it only in the feed' : 'Add it to your saved state'}</small></span></button>
        {!item.noForwards ? <button type="button" className="pressable" onClick={() => { void share(); setMoreOpen(false) }}><SendIcon /><span><strong>Share</strong><small>Use your device share sheet or copy the post</small></span></button> : null}
        {original ? <a className="pressable" href={original} target="_blank" rel="noreferrer" onClick={() => setMoreOpen(false)}><MessageIcon /><span><strong>Open in Telegram</strong><small>View this message in its original source</small></span></a> : null}
      </div>
    </BottomSheet>
  </article>
}
