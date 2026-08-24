import { useEffect, useMemo, useRef, useState } from 'react'
import type { AlbumMedia, MediaAsset } from '../types'
import { fetchMediaTicket } from '../lib/api'

function formatBytes(value?: number) {
  const size = Number(value || 0)
  if (!size) return ''
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${size} B`
}

function formatDuration(value?: number) {
  const seconds = Math.max(0, Math.round(Number(value || 0)))
  if (!seconds) return ''
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function aspect(asset: MediaAsset) {
  if (!asset.width || !asset.height) return undefined
  const ratio = Math.max(.55, Math.min(1.9, asset.width / asset.height))
  return `${ratio}`
}

function TicketAsset({ asset, compact = false }: { asset: MediaAsset; compact?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [url, setUrl] = useState(asset.src || '')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const needsTicket = Boolean(asset.ticketEndpoint && !asset.src)

  useEffect(() => {
    if (!needsTicket || url) return
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      const controller = new AbortController()
      void fetchMediaTicket(asset.ticketEndpoint!, controller.signal).then(ticket => setUrl(ticket.url)).catch(() => setError('Media unavailable'))
      return () => controller.abort()
    }

    const controller = new AbortController()
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      void fetchMediaTicket(asset.ticketEndpoint!, controller.signal)
        .then(ticket => { setUrl(ticket.url); setError('') })
        .catch(() => setError('Media unavailable'))
    }, { rootMargin: '900px 0px' })
    observer.observe(el)
    return () => { observer.disconnect(); controller.abort() }
  }, [asset.ticketEndpoint, attempt, needsTicket, url])

  useEffect(() => {
    const node = video.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .72)
      if (visible) void node.play().catch(() => {})
      else node.pause()
    }, { threshold: [.2, .72] })
    observer.observe(node)
    return () => observer.disconnect()
  }, [url, asset.kind])

  function retry() {
    if (!asset.ticketEndpoint || attempt >= 1) return setError('Media unavailable')
    setUrl('')
    setError('')
    setAttempt(value => value + 1)
  }

  const style = aspect(asset) ? { aspectRatio: aspect(asset) } : undefined
  const mime = String(asset.mimeType || '')
  const animatedSticker = asset.kind === 'sticker' && mime.includes('tgsticker')

  if (asset.kind === 'poll' || asset.kind === 'location' || asset.kind === 'contact') {
    return <div ref={root} className={`sg-media-meta sg-media-${asset.kind}`}>
      <strong>{asset.kind === 'poll' ? 'Telegram poll' : asset.kind === 'location' ? 'Location' : 'Contact'}</strong>
      <span>Open in Telegram for the interactive version.</span>
    </div>
  }

  if (asset.kind === 'document') {
    return <div ref={root} className="sg-document">
      <div className="sg-document-icon">DOC</div>
      <div><strong>{asset.name || 'Telegram file'}</strong><span>{[asset.mimeType, formatBytes(asset.size)].filter(Boolean).join(' · ')}</span></div>
      {url ? <a href={url} target="_blank" rel="noreferrer">Open</a> : <span className="sg-media-loading">{error || 'Preparing…'}</span>}
    </div>
  }

  if (asset.kind === 'audio' || asset.kind === 'voice') {
    return <div ref={root} className={`sg-audio ${asset.kind === 'voice' ? 'is-voice' : ''}`}>
      <div className="sg-audio-copy"><strong>{asset.kind === 'voice' ? 'Voice message' : asset.name || 'Audio'}</strong><span>{[formatDuration(asset.duration), formatBytes(asset.size)].filter(Boolean).join(' · ')}</span></div>
      {url ? <audio src={url} controls preload="metadata" onError={retry} /> : <span className="sg-media-loading">{error || 'Preparing audio…'}</span>}
    </div>
  }

  if (animatedSticker) {
    return <div ref={root} className="sg-media-meta"><strong>Animated sticker</strong><span>This Telegram sticker format is not browser-renderable yet.</span></div>
  }

  if (!url) {
    return <div ref={root} className={`sg-media-placeholder ${compact ? 'is-compact' : ''}`} style={style}>
      <span>{error || 'Loading media…'}</span>
    </div>
  }

  if (asset.kind === 'video' || (asset.kind === 'gif' && mime.startsWith('video/'))) {
    return <div ref={root} className={`sg-media-asset ${compact ? 'is-compact' : ''}`} style={style}>
      <video ref={video} src={url} controls={asset.kind === 'video'} muted={asset.kind === 'gif'} loop={asset.kind === 'gif'} playsInline preload="metadata" onError={retry} />
      {asset.duration ? <span className="sg-duration">{formatDuration(asset.duration)}</span> : null}
    </div>
  }

  return <div ref={root} className={`sg-media-asset ${asset.kind === 'sticker' ? 'is-sticker' : ''} ${compact ? 'is-compact' : ''}`} style={style}>
    <img src={url} alt="Telegram media" loading="lazy" decoding="async" onError={retry} />
  </div>
}

export function MediaRenderer({ media }: { media: MediaAsset | AlbumMedia }) {
  const albumItems = useMemo(() => media.kind === 'album' ? media.items.slice(0, 4) : [], [media])
  if (media.kind !== 'album') return <TicketAsset asset={media} />

  return <div className={`sg-album sg-album-${Math.min(4, albumItems.length)}`}>
    {albumItems.map((asset, index) => <div className="sg-album-cell" key={`${asset.messageId || index}-${index}`}>
      <TicketAsset asset={asset} compact />
      {index === 3 && media.items.length > 4 ? <span className="sg-album-more">+{media.items.length - 4}</span> : null}
    </div>)}
  </div>
}
