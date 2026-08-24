import { useEffect, useRef, useState } from 'react'
import type { Channel, FeedItem } from '../types'
import { MoreIcon } from './Icons'
import { trackSponsoredClick, trackSponsoredView } from '../lib/api'

const SAFE_HOST = /(^|\.)(telegram\.(org|me|dog)|t\.me|te\.?legra\.ph|graph\.org|fragment\.com|telesco\.pe)$/i

export function SponsoredCard({ item, channel, index = 0 }: { item: FeedItem; channel: Channel; index?: number }) {
  const root = useRef<HTMLElement>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const ad = item.sponsored!

  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let sent = false
    const observer = new IntersectionObserver(entries => {
      if (!sent && entries.some(x => x.isIntersecting && x.intersectionRatio >= .5)) {
        sent = true
        trackSponsoredView(ad.randomId).catch(() => {})
        observer.disconnect()
      }
    }, { threshold: [.5] })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ad.randomId])

  async function openAd() {
    let url: URL
    try { url = new URL(ad.url) } catch { return }
    if (!SAFE_HOST.test(url.hostname)) {
      const approved = window.confirm(`Open sponsored link on ${url.hostname}?`)
      if (!approved) return
    }
    await trackSponsoredClick(ad.randomId).catch(() => {})
    window.open(ad.url, '_blank', 'noopener,noreferrer')
  }

  return <article ref={root} className="sg-post sg-sponsored" data-feed-index={index}>
    <header className="sg-post-head">
      <span className="sg-avatar sg-ad-avatar">AD</span>
      <div className="sg-post-who">
        <div className="sg-source-line"><strong>{ad.title}</strong><span className="sg-sponsored-label">{ad.label}</span></div>
        <span>Shown with {channel.title}</span>
      </div>
      <button className="sg-icon-button sg-more" onClick={() => setInfoOpen(value => !value)} aria-label="Sponsored post information"><MoreIcon /></button>
    </header>

    <div className="sg-sponsored-body">
      <p>{String(item.text || '')}</p>
      {infoOpen && (ad.sponsorInfo || ad.additionalInfo) && <div className="sg-sponsor-info">
        {ad.sponsorInfo && <p>{ad.sponsorInfo}</p>}
        {ad.additionalInfo && <p>{ad.additionalInfo}</p>}
      </div>}
      <button className="sg-sponsored-cta" onClick={openAd}>{ad.buttonText || 'Learn more'} <span>↗</span></button>
    </div>
  </article>
}
