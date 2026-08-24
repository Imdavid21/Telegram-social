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
  return <article ref={root} className={`feed-card ${item.unread ? 'is-unread' : ''}`}>
    <header className="post-header">
      <div className="avatar" style={{ background: channel.accent }}>{channel.initials}</div>
      <div className="post-identity">
        <div className="channel-line"><strong>{channel.title}</strong>{channel.username && <span className="verified">✓</span>}</div>
        <span>{channel.username ? `@${channel.username}` : 'Telegram channel'} · {timeAgo(item.timestamp)}</span>
      </div>
      {item.unread && <span className="unread-dot" title="Unread" />}
      <button className="icon-button" aria-label="More options"><MoreIcon /></button>
    </header>

    {item.text && <div className="post-text">{item.text}</div>}
    {item.media && <div className="post-media" style={item.media.src ? undefined : { background: item.media.gradient }}>
      {item.media.src ? <img src={item.media.src} alt="Telegram post media" loading="lazy" /> : <div className="media-label"><span>{item.media.label}</span><small>{live ? 'Preview unavailable' : 'Demo media'}</small></div>}
    </div>}

    <div className="post-meta">
      <div className="reactions">{item.reactions.map((r, i) => <span className="reaction" key={`${r.emoji}-${i}`}>{r.emoji} {r.count}</span>)}</div>
      <div className="metrics">
        {item.views && <span><EyeIcon />{item.views}</span>}
        {!!item.comments && <span><MessageIcon />{item.comments}</span>}
      </div>
    </div>

    <footer className="post-actions">
      <button className={`action-button ${item.saved ? 'active' : ''}`} onClick={() => onSave(item)}><BookmarkIcon />{item.saved ? 'Saved' : 'Save'}</button>
      <button className="action-button" onClick={share}><SendIcon />Share</button>
      {original ? <a className="open-telegram" href={original} target="_blank" rel="noreferrer">Open in Telegram ↗</a> : <span className="private-post">Private channel</span>}
    </footer>
  </article>
}
