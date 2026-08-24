import { useEffect, useRef, type ReactNode } from 'react'
import { BrandMark } from './BrandMark'
import { BookmarkIcon, ImageIcon, MessageIcon, RefreshIcon } from './Icons'

type LandingPageProps = {
  onConnect: () => void
  connecting: boolean
  backendReady: boolean
  booting: boolean
  error?: string
}

const sources = ['Product Hunt', 'Tech Signals', 'Design Notes', 'Markets', 'AI Research']

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      node.dataset.visible = 'true'
      observer.disconnect()
    }, { rootMargin: '0px 0px -12% 0px', threshold: .15 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className={`lp-reveal ${className}`}>{children}</div>
}

function ProductPreview() {
  return <div className="lp-preview" aria-label="Supergram feed preview">
    <div className="lp-preview-top">
      <div className="lp-preview-brand"><BrandMark /><span>Supergram</span></div>
      <span className="lp-preview-live"><i /> Live</span>
    </div>
    <div className="lp-source-marquee"><div>{[...sources, ...sources].map((name, i) => <span key={`${name}-${i}`}><b>{name.slice(0, 2).toUpperCase()}</b>{name}</span>)}</div></div>
    <div className="lp-feed-window">
      <div className="lp-feed-track">
        <article className="lp-demo-post lp-demo-media">
          <header><span className="lp-demo-avatar">PH</span><div><strong>Product Hunt</strong><small>@producthunt · 4m</small></div></header>
          <div className="lp-demo-photo"><span>New release</span><strong>A faster way to follow what matters.</strong></div>
          <p>See the post, save it, and keep moving without jumping between chats.</p>
          <footer><MessageIcon /><BookmarkIcon /></footer>
        </article>
        <article className="lp-demo-post">
          <header><span className="lp-demo-avatar alt">TS</span><div><strong>Tech Signals</strong><small>@techsignals · 11m</small></div></header>
          <p>Long channel threads become readable in one continuous timeline, while new posts wait until you are ready to return to the top.</p>
          <footer><MessageIcon /><BookmarkIcon /></footer>
        </article>
        <article className="lp-demo-post lp-demo-media">
          <header><span className="lp-demo-avatar warm">DN</span><div><strong>Design Notes</strong><small>@designnotes · 18m</small></div></header>
          <div className="lp-demo-photo second"><span>Motion study</span><strong>Media plays when it earns the screen.</strong></div>
          <footer><MessageIcon /><BookmarkIcon /></footer>
        </article>
      </div>
    </div>
    <div className="lp-preview-bottom"><span><RefreshIcon /> New posts stay buffered</span><span><ImageIcon /> Media-first feed</span></div>
  </div>
}

export function LandingPage({ onConnect, connecting, backendReady, booting, error }: LandingPageProps) {
  return <div className="lp-page">
    <header className="lp-nav">
      <a className="lp-wordmark" href="/" aria-label="Supergram home"><BrandMark /><strong>Supergram</strong></a>
      <nav><a href="#product">Product</a><a href="#privacy">Privacy</a><a href="/terms.html">Terms</a></nav>
      <button className="lp-nav-cta pressable" type="button" onClick={onConnect} disabled={booting || connecting || !backendReady}>{connecting ? 'Connecting…' : 'Open Supergram'}</button>
    </header>

    <main>
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow">A feed for the Telegram you already use</p>
          <h1>Follow Telegram like a feed, not an inbox.</h1>
          <p className="lp-hero-body">Supergram turns the channels, groups, and conversations you already follow into one continuous timeline, with media that loads when it matters and new posts that never knock you out of place.</p>
          <div className="lp-hero-actions">
            <button className="lp-primary pressable" type="button" onClick={onConnect} disabled={booting || connecting || !backendReady}>{booting ? 'Checking connection…' : connecting ? 'Connecting to Telegram…' : 'Continue with Telegram'}</button>
            <a className="lp-secondary pressable" href="#product">See the product</a>
          </div>
          {error ? <p className="lp-error">{error}</p> : null}
          <div className="lp-trust"><span className={backendReady ? 'is-ready' : ''}><i />{backendReady ? 'Telegram API ready' : booting ? 'Checking backend' : 'Backend unavailable'}</span><span>Unofficial Telegram client</span></div>
        </div>
        <ProductPreview />
      </section>

      <Reveal className="lp-proof">
        <p>Supergram keeps the interaction model simple. Scroll back in time, let fresh posts wait above you, and open media only when it enters your attention.</p>
      </Reveal>

      <section id="product" className="lp-product-section">
        <Reveal className="lp-section-intro"><p className="lp-eyebrow">The product</p><h2>Telegram history behaves better when it respects your position.</h2><p>Infinite history is cursor-paginated instead of repeatedly refetched. The feed keeps a bounded render window, and media stays lazy until it approaches the viewport.</p></Reveal>
        <div className="lp-behaviors">
          <Reveal><span className="lp-step">01</span><h3>Scroll into older history</h3><p>Reaching the end requests the next Telegram history cursor and merges it into the same timeline without resetting what is already on screen.</p></Reveal>
          <Reveal><span className="lp-step">02</span><h3>Keep fresh posts out of the way</h3><p>New arrivals sit in a small queue when you are reading further down. A single control returns you to the top before those posts enter the feed.</p></Reveal>
          <Reveal><span className="lp-step">03</span><h3>Give media the screen only when needed</h3><p>Photos, video, audio, voice notes, documents, stickers, and albums use the right renderer instead of being forced into one generic image box.</p></Reveal>
        </div>
      </section>

      <section id="privacy" className="lp-privacy-section">
        <Reveal className="lp-privacy-copy"><p className="lp-eyebrow">Your account stays yours</p><h2>Supergram reads through your authorized Telegram session instead of copying your inbox into a new message database.</h2><p>Your session is encrypted before it reaches the browser cookie, login codes and two-step passwords are not kept, and private chats are not published as discovery content.</p><a className="lp-text-link" href="/privacy.html">Read the privacy policy</a></Reveal>
        <Reveal className="lp-privacy-panel"><div><strong>Session</strong><span>Encrypted HttpOnly cookie</span></div><div><strong>Messages</strong><span>Fetched from Telegram on demand</span></div><div><strong>Media</strong><span>Short-lived authenticated delivery</span></div><div><strong>Local state</strong><span>Read, saved, theme, and feed preferences</span></div></Reveal>
      </section>

      <section className="lp-final">
        <Reveal><BrandMark className="lp-final-mark" /><h2>Your Telegram is already full of things worth following. Supergram gives them a better place to land.</h2><button className="lp-primary pressable" type="button" onClick={onConnect} disabled={booting || connecting || !backendReady}>Open Supergram</button></Reveal>
      </section>
    </main>

    <footer className="lp-footer"><a className="lp-wordmark" href="/"><BrandMark /><strong>Supergram</strong></a><p>Independent software using the Telegram API. Supergram is not affiliated with Telegram.</p><div><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="https://github.com/Imdavid21/Telegram-social" target="_blank" rel="noreferrer">GitHub</a></div></footer>
  </div>
}
