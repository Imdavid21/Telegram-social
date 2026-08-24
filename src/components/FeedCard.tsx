import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Channel, FeedItem } from '../types'
import { BookmarkIcon, EyeIcon, LockIcon, MessageIcon, MoreIcon, SendIcon } from './Icons'
import { MediaRenderer } from './MediaRenderer'
import { SuccessConfirm } from './SuccessConfirm'
import { haptics } from '../lib/interaction'

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
  const original = originalPostUrl(item, channel)
  const reactions = useMemo(() => Array.isArray(item.reactions) ? item.reactions.filter(Boolean).slice(0, 6) : [], [item.reactions])
  const media = item.media && typeof item.media === 'object' ? item.media : undefined
  const text = String(item.text || '')
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

  return <article ref={root} className={`sg-post ${item.unread ? 'is-unread' : ''} ${media ? 'has-media' : 'text-only'} ${saveConfirm ? 'is-confirming' : ''}`} data-feed-index={index}>
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
      {item.unread && <span className="sg-unread-dot" title="Unread" />}
      <button className="sg-icon-button sg-more pressable" aria-label="More options"><MoreIcon /></button>
    </header>

    {media && <div className={`sg-media sg-media-${media.kind}`}><MediaRenderer media={media} /></div>}

    {visibleText && <div className={`sg-caption ${media ? '' : 'sg-text-post'}`}>
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
  </article>
}
