import { useEffect, useMemo, useRef, useState } from 'react'
import type { Channel, FeedItem } from '../types'
import { BookmarkIcon, EyeIcon, LockIcon, MessageIcon, MoreIcon, SendIcon } from './Icons'

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

function compactFileSize(bytes?: number) {
  const n = Number(bytes || 0)
  if (!n) return ''
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

function SourceAvatar({ channel }: { channel: Channel }) {
  const [failed, setFailed] = useState(false)
  const initials = String(channel.initials || channel.title?.slice(0, 2) || 'SG').toUpperCase()
  return <span className="sg-avatar" style={{ background: channel.accent || '#2AABEE' }}>
    {channel.avatar && !failed ? <img src={channel.avatar} alt="" onError={() => setFailed(true)} /> : initials}
  </span>
}

export function FeedCard({ item, channel, live, onSave, onRead, index = 0 }: {
  item: FeedItem
  channel: Channel
  live: boolean
  onSave: (item: FeedItem) => void
  onRead: (item: FeedItem) => void
  index?: number
}) {
  const root = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [expanded, setExpanded] = useState(false)
  const original = originalPostUrl(item, channel)
  const reactions = useMemo(() => Array.isArray(item.reactions) ? item.reactions.filter(Boolean).slice(0, 6) : [], [item.reactions])
  const media = item.media && typeof item.media === 'object' ? item.media : undefined
  const text = String(item.text || '')
  const isLong = text.length > 650
  const visibleText = !expanded && isLong ? `${text.slice(0, 650).trimEnd()}…` : text
  const privateSource = !channel.username && (channel.type === 'person' || item.sourceType === 'person')

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

  useEffect(() => {
    const video = videoRef.current
    if (!video || typeof IntersectionObserver === 'undefined') return
    video.muted = true
    const observer = new IntersectionObserver(entries => {
      const mostlyVisible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .72)
      if (mostlyVisible) void video.play().catch(() => {})
      else video.pause()
    }, { threshold: [.2, .72] })
    observer.observe(video)
    return () => observer.disconnect()
  }, [media?.src, media?.kind])

  const share = async () => {
    const payload = { title: String(channel.title || 'Supergram'), text, url: original || location.href }
    if (navigator.share) await navigator.share(payload).catch(() => {})
    else await navigator.clipboard?.writeText([payload.text, payload.url].filter(Boolean).join('\n\n')).catch(() => {})
  }

  return <article ref={root} className={`sg-post ${item.unread ? 'is-unread' : ''} ${media ? 'has-media' : 'text-only'}`} data-feed-index={index}>
    <header className="sg-post-head">
      <SourceAvatar channel={channel} />
      <div className="sg-post-who">
        <div className="sg-source-line">
          <strong>{String(channel.title || 'Telegram')}</strong>
          {privateSource && <LockIcon className="sg-private-icon" />}
          {channel.username && <span className="sg-verified">✓</span>}
        </div>
        <span>{channel.username ? `@${channel.username}` : channel.type === 'group' ? 'Group' : channel.type === 'person' ? 'Private chat' : 'Telegram'} · {timeAgo(item.timestamp)}</span>
      </div>
      {item.unread && <span className="sg-unread-dot" title="Unread" />}
      <button className="sg-icon-button sg-more" aria-label="More options"><MoreIcon /></button>
    </header>

    {media && <div className={`sg-media sg-media-${media.kind}`} style={!media.src ? { background: media.gradient } : undefined}>
      {media.src ? <>
        {media.kind === 'video' && <video ref={videoRef} src={media.src} controls playsInline muted preload="metadata" />}
        {media.kind === 'audio' && <div className="sg-audio-wrap"><audio src={media.src} controls preload="metadata" /></div>}
        {media.kind === 'document' && <a className="sg-document" href={media.src} target="_blank" rel="noreferrer"><span className="sg-document-icon">DOC</span><span><strong>{media.fileName || media.label || 'Telegram file'}</strong><small>{[media.mimeType, compactFileSize(media.size)].filter(Boolean).join(' · ') || 'Open file'}</small></span></a>}
        {(media.kind === 'photo' || media.kind === 'gif') && <img src={media.src} alt="Telegram post media" loading="lazy" decoding="async" />}
      </> : <div className="sg-media-fallback"><strong>{media.label || 'Media'}</strong><span>{live ? 'Preview unavailable' : 'Demo media'}</span></div>}
    </div>}

    {visibleText && <div className={`sg-caption ${media ? '' : 'sg-text-post'}`}>
      <span className="sg-caption-source">{String(channel.title || 'Telegram')}</span>{' '}
      <span>{visibleText}</span>
      {isLong && <button className="sg-more-text" onClick={() => setExpanded(value => !value)}>{expanded ? 'less' : 'more'}</button>}
    </div>}

    <div className="sg-post-actions">
      <div className="sg-actions-left">
        <button className="sg-action" onClick={share} aria-label="Share"><SendIcon /></button>
        {original ? <a className="sg-action" href={original} target="_blank" rel="noreferrer" aria-label="Open in Telegram"><MessageIcon /></a> : <span className="sg-action is-disabled" title="Private source"><MessageIcon /></span>}
      </div>
      <button className={`sg-action ${item.saved ? 'is-active' : ''}`} onClick={() => onSave(item)} aria-label={item.saved ? 'Remove from saved' : 'Save'}><BookmarkIcon /></button>
    </div>

    {(reactions.length > 0 || item.views || item.comments) && <div className="sg-engagement">
      {reactions.length > 0 && <span className="sg-reaction-summary">{reactions.map((reaction, i) => <span key={`${String(reaction?.emoji || '♥')}-${i}`}>{String(reaction?.emoji || '♥')} {Number(reaction?.count || 0)}</span>)}</span>}
      <span className="sg-stats">
        {item.views && <span><EyeIcon />{String(item.views)}</span>}
        {!!Number(item.comments || 0) && <span><MessageIcon />{Number(item.comments || 0)}</span>}
      </span>
    </div>}
  </article>
}
