import { useEffect, useRef } from 'react'
import type { Channel, FeedItem } from '../types'
import { BookmarkIcon, EyeIcon, MessageIcon, MoreIcon, SendIcon } from './Icons'

function timeAgo(timestamp: number) {
  const mins = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
function originalPostUrl(item: FeedItem, channel?: Channel) {
  if (!channel?.username) return null
  return `https://t.me/${channel.username}/${item.messageId}`
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

  useEffect(() => {
    const el = root.current
    if (!el || !item.unread) return
    let sent = false
    const observer = new IntersectionObserver(entries => {
      if (!sent && entries.some(x => x.isIntersecting && x.intersectionRatio >= .6)) { sent = true; onRead(item); observer.disconnect() }
    }, { threshold: [.6] })
    observer.observe(el)
    return () => observer.disconnect()
  }, [item.id, item.unread, onRead])

  const share = async () => {
    const payload = { title: channel.title, text: item.text, url: original || location.href }
    if (navigator.share) await navigator.share(payload).catch(() => {})
    else await navigator.clipboard?.writeText([payload.text, payload.url].filter(Boolean).join('\n\n')).catch(() => {})
  }

  return <article ref={root} className={`telegram-post ${item.unread ? 'is-unread' : ''}`}>
    <div className="post-avatar" style={{ background: channel.accent }}>{channel.initials}</div>
    <div className="message-bubble">
      <header className="message-header">
        <div className="message-identity">
          <strong>{channel.title}</strong>
          {channel.username && <span className="verified">✓</span>}
          <span className="message-handle">{channel.username ? `@${channel.username}` : 'channel'}</span>
        </div>
        <button className="message-more" aria-label="More options"><MoreIcon /></button>
      </header>

      {item.text && <div className="message-text">{item.text}</div>}

      {item.media && <div className="message-media" style={item.media.src ? undefined : { background: item.media.gradient }}>
        {item.media.src ? <img src={item.media.src} alt="Telegram post media" loading="lazy" /> : <div className="media-label"><span>{item.media.label}</span><small>{live ? 'Preview unavailable' : 'Demo media'}</small></div>}
      </div>}

      <div className="message-footer">
        <div className="reaction-row">{item.reactions.map((r, i) => <span className="reaction-pill" key={`${r.emoji}-${i}`}>{r.emoji}<b>{r.count}</b></span>)}</div>
        <div className="message-stats">
          {item.views && <span><EyeIcon />{item.views}</span>}
          {!!item.comments && <span><MessageIcon />{item.comments}</span>}
          <span className="message-time">{timeAgo(item.timestamp)}</span>
          {item.unread && <span className="read-dot" title="Unread" />}
        </div>
      </div>

      <div className="social-actions">
        <button className={item.saved ? 'active' : ''} onClick={() => onSave(item)}><BookmarkIcon />{item.saved ? 'Saved' : 'Save'}</button>
        <button onClick={share}><SendIcon />Share</button>
        {original ? <a href={original} target="_blank" rel="noreferrer">Open in Telegram</a> : <span>Private channel</span>}
      </div>
    </div>
  </article>
}
