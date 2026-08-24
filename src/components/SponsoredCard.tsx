import { useEffect, useRef, useState } from 'react'
import type { Channel, FeedItem } from '../types'
import { trackSponsoredClick, trackSponsoredView } from '../lib/api'

const SAFE_HOST = /(^|\.)(telegram\.(org|me|dog)|t\.me|te\.?legra\.ph|graph\.org|fragment\.com|telesco\.pe)$/i

export function SponsoredCard({ item, channel }: { item: FeedItem; channel: Channel }) {
  const root = useRef<HTMLElement>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const ad = item.sponsored!

  useEffect(() => {
    const el = root.current
    if (!el) return
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

  return <article ref={root} className="feed-card sponsored-card">
    <header className="post-header">
      <div className="avatar sponsor-avatar">AD</div>
      <div className="post-identity">
        <div className="channel-line"><strong>{ad.title}</strong></div>
        <span>{ad.label} · shown with {channel.title}</span>
      </div>
      {(ad.sponsorInfo || ad.additionalInfo) && <button className="sponsor-info-button" onClick={() => setInfoOpen(v => !v)}>Sponsor info</button>}
    </header>
    <div className="post-text sponsor-text">{item.text}</div>
    {infoOpen && <div className="sponsor-info-panel">{ad.sponsorInfo && <p>{ad.sponsorInfo}</p>}{ad.additionalInfo && <p>{ad.additionalInfo}</p>}</div>}
    <footer className="sponsor-footer"><button className="sponsor-cta" onClick={openAd}>{ad.buttonText || 'Learn more'} ↗</button></footer>
  </article>
}
