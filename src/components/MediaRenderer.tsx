import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { AlbumMedia, MediaAsset, UserSettings } from '../types'
import { fetchMediaTicket } from '../lib/api'
import { loadSettings } from '../lib/storage'
import { persistVideoMuted, storedVideoMuted, videoRegistry } from '../lib/videoRegistry'
import { MediaLightbox, type FlipRect } from './MediaLightbox'

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

function shouldAutoplay(settings = loadSettings()) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  return settings.autoplay === 'on' && !reduceMotion
}

function TicketAsset({ asset, compact = false }: { asset: MediaAsset; compact?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [url, setUrl] = useState(asset.src || '')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [preload, setPreload] = useState<'metadata' | 'auto'>('metadata')
  const [muted, setMuted] = useState(() => asset.kind === 'gif' ? true : storedVideoMuted())
  const [autoplay, setAutoplay] = useState(() => shouldAutoplay())
  const [lightboxRect, setLightboxRect] = useState<FlipRect | null>(null)
  const needsTicket = Boolean(asset.ticketEndpoint && !asset.src)

  useEffect(() => { setLoaded(false) }, [url])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (settings?: UserSettings) => setAutoplay(shouldAutoplay(settings || loadSettings()))
    const onSettings = (event: Event) => update((event as CustomEvent<UserSettings>).detail)
    const onMotion = () => update()
    window.addEventListener('supergram:settings-changed', onSettings)
    media.addEventListener?.('change', onMotion)
    return () => {
      window.removeEventListener('supergram:settings-changed', onSettings)
      media.removeEventListener?.('change', onMotion)
    }
  }, [])

  useEffect(() => {
    if (!needsTicket || url) return
    const el = root.current
    const controller = new AbortController()
    if (!el || typeof IntersectionObserver === 'undefined') {
      void fetchMediaTicket(asset.ticketEndpoint!, controller.signal).then(ticket => setUrl(ticket.url)).catch(() => setError('Media unavailable'))
      return () => controller.abort()
    }

    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      void fetchMediaTicket(asset.ticketEndpoint!, controller.signal)
        .then(ticket => { setUrl(ticket.url); setError('') })
        .catch(() => setError('Media unavailable'))
    }, { rootMargin: '200% 0px' })
    observer.observe(el)
    return () => { observer.disconnect(); controller.abort() }
  }, [asset.ticketEndpoint, attempt, needsTicket, url])

  useEffect(() => {
    const node = video.current
    const host = root.current
    if (!node || !host || typeof IntersectionObserver === 'undefined') return
    const preloadObserver = new IntersectionObserver(entries => {
      setPreload(entries.some(entry => entry.isIntersecting) ? 'auto' : 'metadata')
    }, { rootMargin: '200% 0px' })
    const playbackObserver = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .7)
      if (visible && autoplay) void videoRegistry.requestPlay(node)
      else videoRegistry.requestPause(node)
    }, { threshold: [.2, .7] })
    preloadObserver.observe(host)
    playbackObserver.observe(node)
    if (!autoplay) videoRegistry.requestPause(node)
    return () => {
      preloadObserver.disconnect()
      playbackObserver.disconnect()
      videoRegistry.clear(node)
      node.pause()
    }
  }, [url, asset.kind, autoplay])

  function retry() {
    if (!asset.ticketEndpoint || attempt >= 1) return setError('Media unavailable')
    setUrl('')
    setError('')
    setAttempt(value => value + 1)
  }

  function openLightbox(event: ReactMouseEvent<HTMLImageElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    setLightboxRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
  }

  const style = aspect(asset) ? { aspectRatio: aspect(asset) } : undefined
  const mime = String(asset.mimeType || '')
  const animatedSticker = asset.kind === 'sticker' && mime.includes('tgsticker')

  if (asset.kind === 'poll' || asset.kind === 'location' || asset.kind === 'contact') {
    return <div ref={root} className={`sg-media-meta sg-media-${asset.kind}`}>
      <strong>{asset.kind === 'poll' ? 'Telegram poll' : asset.kind === 'location' ? 'Location' : 'Contact'}</strong>
      <span>{asset.kind === 'poll' ? 'Open in Telegram to vote.' : asset.kind === 'location' ? 'Open in Telegram to view this location.' : 'Open in Telegram to use this contact.'}</span>
    </div>
  }

  if (asset.kind === 'document') {
    return <div ref={root} className="sg-document">
      <div className="sg-document-icon">DOC</div>
      <div><strong>{asset.name || 'Telegram file'}</strong><span>{[asset.mimeType, formatBytes(asset.size)].filter(Boolean).join(' · ')}</span></div>
      {url ? <a className="pressable" href={url} target="_blank" rel="noreferrer">Open</a> : <span className="sg-media-loading">{error || 'Preparing file…'}</span>}
    </div>
  }

  if (asset.kind === 'audio' || asset.kind === 'voice') {
    return <div ref={root} className={`sg-audio ${asset.kind === 'voice' ? 'is-voice' : ''}`}>
      <div className="sg-audio-copy"><strong>{asset.kind === 'voice' ? 'Voice message' : asset.name || 'Audio'}</strong><span>{[formatDuration(asset.duration), formatBytes(asset.size)].filter(Boolean).join(' · ')}</span></div>
      {url ? <audio src={url} controls preload="metadata" onError={retry} /> : <span className="sg-media-loading">{error || 'Preparing audio…'}</span>}
    </div>
  }

  if (animatedSticker) {
    return <div ref={root} className="sg-media-meta"><strong>Animated sticker</strong><span>Open the original post in Telegram to view this sticker.</span></div>
  }

  if (!url) {
    return <div ref={root} className={`sg-media-placeholder ${compact ? 'is-compact' : ''}`} style={style}>
      <span>{error || 'Loading media…'}</span>
    </div>
  }

  if (asset.kind === 'video' || (asset.kind === 'gif' && mime.startsWith('video/'))) {
    const gif = asset.kind === 'gif'
    return <div ref={root} className={`sg-media-asset ${compact ? 'is-compact' : ''}`} style={style}>
      <video
        ref={video}
        className={`media-reveal ${loaded ? 'loaded' : ''}`}
        src={url}
        controls={!gif || !autoplay}
        muted={gif ? true : muted}
        loop={gif && autoplay}
        playsInline
        preload={preload}
        onLoadedData={() => setLoaded(true)}
        onVolumeChange={event => {
          if (gif) return
          const nextMuted = event.currentTarget.muted
          setMuted(nextMuted)
          persistVideoMuted(nextMuted)
        }}
        onError={retry}
      />
      {asset.duration ? <span className="sg-duration">{formatDuration(asset.duration)}</span> : null}
    </div>
  }

  return <>
    <div ref={root} className={`sg-media-asset ${asset.kind === 'sticker' ? 'is-sticker' : ''} ${compact ? 'is-compact' : ''}`} style={style}>
      <img className={`media-reveal sg-lightbox-trigger ${loaded ? 'loaded' : ''}`} src={url} alt={asset.label || 'Image from Telegram'} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} onError={retry} onClick={openLightbox} />
    </div>
    {lightboxRect ? <MediaLightbox src={url} sourceRect={lightboxRect} onClose={() => setLightboxRect(null)} /> : null}
  </>
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
