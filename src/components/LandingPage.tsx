import { useMemo, useState } from 'react'
import { ArrowRight, Bookmark, Heart, MessageCircle, Play, Search, Send, Sparkles } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { Button } from './ui/button'
import { demoChannels, demoFeed } from '../data/demo'

type LandingPageProps = {
  onConnect: () => void
  onDemo: () => void
  connecting: boolean
  backendReady: boolean
  booting: boolean
  error?: string
}

function LandingProductDemo({ onConnect }: { onConnect: () => void }) {
  const [saved, setSaved] = useState(() => new Set<string>())
  const [liked, setLiked] = useState(() => new Set<string>())
  const [query, setQuery] = useState('')
  const posts = useMemo(() => demoFeed.slice(0, 3).filter(item => {
    const source = demoChannels.find(channel => channel.id === item.channelId)
    const q = query.trim().toLowerCase()
    return !q || `${item.text} ${source?.title || ''}`.toLowerCase().includes(q)
  }), [query])
  const toggle = (setter: typeof setSaved, current: Set<string>, id: string) => setter(() => {
    const next = new Set(current)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  return <div className="sg-marketing-demo" aria-label="Interactive Supergram product demo">
    <div className="sg-marketing-demo-sidebar">
      <div className="sg-marketing-demo-brand"><BrandMark/><strong>Supergram</strong></div>
      <button className="is-active"><span className="sg-demo-nav-dot"/>Home</button>
      <button><Search/>Discover</button>
      <button><MessageCircle/>Chats</button>
      <button><Heart/>Activity</button>
      <button><Bookmark/>Saved</button>
      <div className="sg-marketing-demo-profile"><span>UD</span><div><strong>Your Telegram</strong><small>Connected graph</small></div></div>
    </div>
    <div className="sg-marketing-demo-main">
      <div className="sg-marketing-demo-top"><div><button className="is-active">For You</button><button>Following</button></div><label><Search/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search"/></label></div>
      <div className="sg-marketing-demo-feed">
        {posts.map(item => {
          const channel = demoChannels.find(source => source.id === item.channelId)!
          return <article className="sg-marketing-demo-post" key={item.id}>
            <header><span style={{background: channel.accent}}>{channel.initials}</span><div><strong>{channel.title}</strong><small>{channel.username ? `@${channel.username}` : 'Telegram source'} · now</small></div></header>
            {item.media ? <div className="sg-marketing-demo-media" style={{background:item.media.gradient}}><span>{item.media.label}</span></div> : null}
            <p>{item.text}</p>
            <div className="sg-marketing-demo-actions"><span><button className={liked.has(item.id)?'is-active':''} onClick={() => toggle(setLiked, liked, item.id)} aria-label="Like"><Heart/></button><button aria-label="Discuss"><MessageCircle/></button><button aria-label="Forward"><Send/></button></span><button className={saved.has(item.id)?'is-active':''} onClick={() => toggle(setSaved, saved, item.id)} aria-label="Save"><Bookmark/></button></div>
          </article>
        })}
        {!posts.length && <div className="sg-marketing-demo-empty">No demo posts match your search.</div>}
      </div>
    </div>
    <aside className="sg-marketing-demo-context"><strong>Telegram context</strong><p>Public content stays connected to the chats, groups, and channels it came from.</p><div><span>PD</span><p><b>Product Design Daily</b><small>3 new updates</small></p></div><div><span>AI</span><p><b>AI Builders</b><small>Active discussion</small></p></div><Button size="sm" onClick={onConnect}>Use my Telegram</Button></aside>
  </div>
}

const outcomes = [
  ['A feed built from your Telegram graph', 'Channels, groups, people, and media come together in one ranked or chronological feed without losing source context.'],
  ['Context-aware local summaries', 'Long updates use nearby message history to identify what changed, what matters, and whether you need to act.'],
  ['Telegram-native engagement', 'React on the original message, reply into the conversation, forward to a contact, and save into your Telegram Saved Messages archive.'],
  ['Less repetition across channels', 'Similar updates can be grouped so one developing story does not occupy the feed five times.'],
  ['Media gets the attention it deserves', 'Photos, video, documents, and albums lead the visual hierarchy while text stays readable and compact.'],
  ['Control stays visible', 'Switch between For You and Following, filter sources, manage private chat inclusion, and tune the experience without hunting through menus.']
]

export function LandingPage({ onConnect, onDemo, connecting, backendReady, booting, error }: LandingPageProps) {
  return <div className="sg-marketing-page">
    <header className="sg-marketing-header">
      <a href="/" className="sg-marketing-brand"><span><BrandMark/></span><strong>Supergram</strong></a>
      <nav><a href="#product">Product</a><a href="#intelligence">Summaries</a><a href="#telegram">Telegram</a></nav>
      <div><Button variant="ghost" onClick={onDemo}>Open demo</Button><Button onClick={onConnect} disabled={connecting}>{connecting ? 'Connecting' : backendReady ? 'Open app' : 'Retry connection'}</Button></div>
    </header>

    <main>
      <section className="sg-marketing-hero" id="product">
        <div className="sg-marketing-hero-copy">
          <span className="sg-marketing-kicker"><Sparkles/>A social layer for the Telegram you already use</span>
          <h1>Your Telegram graph, rebuilt around what deserves your attention.</h1>
          <p>Supergram turns the channels, groups, conversations, and media already in your account into a focused social feed. You can scan the important updates, understand long threads faster, and move from discovery to conversation without leaving the Telegram context behind.</p>
          <div className="sg-marketing-actions"><Button size="lg" onClick={onConnect} disabled={connecting}>{connecting ? 'Connecting to Telegram' : backendReady ? 'Continue with Telegram' : 'Retry connection'}<ArrowRight/></Button><Button size="lg" variant="outline" onClick={onDemo}><Play/>Open full demo</Button></div>
          {error ? <p className="sg-marketing-error" role="alert">{error}</p> : null}
          <small className="sg-marketing-status">{backendReady ? 'Ready to connect to Telegram' : booting ? 'Checking the Telegram connection' : 'Telegram connection is currently unavailable'}</small>
        </div>
        <div className="sg-marketing-hero-proof"><span>Built around your existing Telegram account</span><span>Local-first summarization</span><span>No new social graph to rebuild</span></div>
      </section>

      <section className="sg-marketing-demo-section">
        <div className="sg-marketing-section-head"><span>Product demo</span><h2>See the product before you connect anything.</h2><p>The demo uses sample data, but the interaction model mirrors the real application across desktop and mobile.</p></div>
        <LandingProductDemo onConnect={onConnect}/>
      </section>

      <section className="sg-marketing-outcomes">
        <div className="sg-marketing-section-head"><span>What changes</span><h2>Telegram becomes easier to consume without becoming less Telegram.</h2></div>
        <div className="sg-marketing-grid">{outcomes.map(([title, copy], index) => <article key={title}><small>{String(index + 1).padStart(2,'0')}</small><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>

      <section className="sg-marketing-feature-band" id="intelligence">
        <div><span>Local intelligence</span><h2>Summaries use the messages that came before so each update keeps the context that gives it meaning.</h2><p>Supergram keeps recent message context from the same source so a follow-up can be understood as a follow-up. Your outgoing messages can help explain a conversation, but they do not need to appear as standalone feed posts.</p></div>
        <div className="sg-marketing-summary-card"><small>Context brief</small><strong>Launch moved to Thursday after the audit cleared</strong><p>The latest message confirms the audit is complete and the launch can proceed on the date discussed earlier in the conversation.</p><footer><span>3 prior messages used as context</span><span>Local summary</span></footer></div>
      </section>

      <section className="sg-marketing-telegram" id="telegram">
        <div className="sg-marketing-section-head"><span>Telegram-native actions</span><h2>The feed is useful because every post still belongs to a conversation.</h2></div>
        <div className="sg-marketing-flow"><article><Heart/><h3>React</h3><p>Send or remove the Telegram reaction on the original message.</p></article><article><MessageCircle/><h3>Discuss</h3><p>Reply into the original chat or linked channel discussion.</p></article><article><Send/><h3>Forward</h3><p>Send the original Telegram message to an existing contact.</p></article><article><Bookmark/><h3>Save</h3><p>Keep a Supergram save state while copying the original message into Telegram Saved Messages.</p></article></div>
      </section>

      <section className="sg-marketing-final"><span>Your Telegram already has the network.</span><h2>Supergram gives that network a better home screen.</h2><p>Connect your account and turn the sources you already follow into a fast, visual, context-aware feed that works across browser and phone.</p><Button size="lg" onClick={onConnect} disabled={connecting}>{connecting ? 'Connecting' : 'Continue with Telegram'}<ArrowRight/></Button></section>
    </main>

    <footer className="sg-marketing-footer"><div><BrandMark/><strong>Supergram</strong></div><p>Independent client using the Telegram API. Supergram is not affiliated with Telegram.</p><nav><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></nav></footer>
  </div>
}
