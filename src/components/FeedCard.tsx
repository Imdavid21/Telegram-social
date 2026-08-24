import { useEffect, useMemo, useRef } from 'react'
import type { Channel, FeedItem } from '../types'
import { BookmarkIcon, EyeIcon, MessageIcon, MoreIcon, SendIcon } from './Icons'

function timeAgo(timestamp: number) {
  const value = Number(timestamp)
  if (!Number.isFinite(value) || value <= 0) return ''
  const mins = Math.max(1, Math.floor((Date.now() - value) / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function originalPostUrl(item: FeedItem, channel?: Channel) {
  if (!channel?.username) return null
  return `https://t.me/${encodeURIComponent(channel.username)}/${Number(item.messageId) || 0}`
}

export function FeedCard({ item, channel, live, onSave, onRead }: {
  item: FeedItem
  channel: Channel
  live: boolean
  onSave: (item: FeedItem) => void
  onRead: (item: FeedItem) => void
}) {
  const root = useRef<HTMLElement>(null)
  const original = originalPostUrl(item, channel)
  const reactions = useMemo(() => Array.isArray(item.reactions) ? item.reactions.filter(Boolean).slice(0, 12) : [], [item.reactions])
  const media = item.media && typeof item.media === 'object' ? item.media : undefined

  useEffect(() => {
    const el = root.current
    if (!el || !item.unread || typeof IntersectionObserver === 'undefined') return
    let sent = false
    const observer = new IntersectionObserver(entries => {
      if (!sent && entries.some(x => x.isIntersecting && x.intersectionRatio >= .6)) {
        sent = true
        onRead(item)
        observer.disconnect()
      }
    }, { threshold: [.6] })
    observer.observe(el)
    return () => observer.disconnect()
  }, [item.id, item.unread, onRead])

  const share = async () => {
    const payload = { title: String(channel.title || 'Telegram'), text: String(item.text || ''), url: original || location.href }
    if (navigator.share) await navigator.share(payload).catch(() => {})
    else await navigator.clipboard?.writeText([payload.text, payload.url].filter(Boolean).join('\n\n')).catch(() => {})
  }

  const title = String(channel.title || 'Telegram')
  const initials = String(channel.initials || title.slice(0, 2).toUpperCase() || 'TG')
  const text = String(item.text || '')

  return <article ref={root} className={`telegram-post ${item.unread ? 'is-unread' : ''}`}>
    <div className="post-avatar" style={{ background: channel.accent || '#3390ec' }}>{initials}</div>
    <div className="message-bubble">
      <header className="message-header">
        <div className="message-identity">
          <strong>{title}</strong>
          {channel.username && <span className="verified">✓</span>}
          <span className="message-handle">{channel.username ? `@${channel.username}` : 'Telegram'}</span>
        </div>
        <button className="message-more" aria-label="More options"><MoreIcon /></button>
      </header>

      {text && <div className="message-text">{text}</div>}

      {media && <div className="message-media" style={media.src ? undefined : { background: media.gradient }}>
        {media.src ? (
          media.kind === 'video'
            ? <video src={media.src} controls playsInline preload="metadata" />
            : <img src={media.src} alt="Telegram post media" loading="lazy" decoding="async" />
        ) : <div className="media-label"><span>{media.label || 'Media'}</span><small>{live ? 'Preview unavailable' : 'Demo media'}</small></div>}
      </div>}

      <div className="message-footer">
        <div className="reaction-row">{reactions.map((reaction, i) => <span className="reaction-pill" key={`${String(reaction?.emoji || '♥')}-${i}`}>{String(reaction?.emoji || '♥')}<b>{Number(reaction?.count || 0)}</b></span>)}</div>
        <div className="message-stats">
          {item.views && <span><EyeIcon />{String(item.views)}</span>}
          {!!Number(item.comments || 0) && <span><MessageIcon />{Number(item.comments || 0)}</span>}
          <span className="message-time">{timeAgo(item.timestamp)}</span>
          {item.unread && <span className="read-dot" title="Unread" />}
        </div>
      </div>

      <div className="social-actions">
        <button className={item.saved ? 'active' : ''} onClick={() => onSave(item)}><BookmarkIcon />{item.saved ? 'Saved' : 'Save'}</button>
        <button onClick={share}><SendIcon />Share</button>
        {original ? <a href={original} target="_blank" rel="noreferrer">Open in Telegram</a> : <span>Private source</span>}
      </div>
    </div>
  </article>
}
