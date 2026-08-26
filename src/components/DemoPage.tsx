import { useMemo, useState } from 'react'
import { BrandMark } from './BrandMark'
import { demoChannels, demoFeed } from '../data/demo'
import { BookmarkIcon, HeartIcon, HomeIcon, ImageIcon, MessageIcon, SearchIcon, SendIcon } from './Icons'

function timeAgo(timestamp: number) {
  const mins = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

export function DemoPage({ onConnect }: { onConnect: () => void }) {
  const [saved, setSaved] = useState(() => new Set(demoFeed.filter(item => item.saved).map(item => item.id)))
  const [activeSource, setActiveSource] = useState('all')
  const [query, setQuery] = useState('')

  const visible = useMemo(() => demoFeed.filter(item => {
    const channel = demoChannels.find(source => source.id === item.channelId)
    const sourceMatch = activeSource === 'all' || item.channelId === activeSource
    const q = query.trim().toLowerCase()
    const queryMatch = !q || item.text.toLowerCase().includes(q) || channel?.title.toLowerCase().includes(q) || channel?.username?.toLowerCase().includes(q)
    return sourceMatch && queryMatch
  }), [activeSource, query])

  function toggleSaved(id: string) {
    setSaved(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return <div className="demo-page">
    <aside className="demo-left">
      <a className="demo-brand" href="/"><BrandMark /><strong>Supergram</strong></a>
      <nav className="demo-nav">
        <button className="is-active"><HomeIcon /><span>Home</span></button>
        <label><SearchIcon /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search demo" /></label>
        <button><ImageIcon /><span>Media</span></button>
        <button><BookmarkIcon /><span>Saved</span></button>
      </nav>
      <div className="demo-left-bottom"><button className="demo-connect pressable" onClick={onConnect}>Connect Telegram</button><a href="/">Back to homepage</a></div>
    </aside>

    <main className="demo-main">
      <header className="demo-topbar"><div><strong>Demo feed</strong><span>Sample content, no Telegram login required</span></div><button className="demo-connect pressable" onClick={onConnect}>Use my Telegram</button></header>

      <div className="demo-source-strip">
        <button className={activeSource === 'all' ? 'is-active' : ''} onClick={() => setActiveSource('all')}><span className="demo-all-avatar"><BrandMark /></span><small>All</small></button>
        {demoChannels.map(channel => <button key={channel.id} className={activeSource === channel.id ? 'is-active' : ''} onClick={() => setActiveSource(channel.id)}>
          <span className="demo-source-avatar" style={{ background: channel.accent }}>{channel.initials}</span><small>{channel.title}</small>
        </button>)}
      </div>

      <section className="demo-feed">
        {visible.map(item => {
          const channel = demoChannels.find(source => source.id === item.channelId)!
          const demoMedia = item.media && item.media.kind !== 'album' ? item.media : null
          return <article className="demo-post" key={item.id}>
            <header><span className="demo-post-avatar" style={{ background: channel.accent }}>{channel.initials}</span><div><strong>{channel.title}</strong><span>{channel.username ? `@${channel.username}` : 'Telegram source'} · {timeAgo(item.timestamp)}</span></div></header>
            {demoMedia ? <div className="demo-media" style={{ background: demoMedia.gradient }}><span>{demoMedia.label}</span></div> : null}
            <div className="demo-actions"><span><button className="pressable" aria-label="Like"><HeartIcon /></button><button className="pressable" aria-label="Comment"><MessageIcon /></button><button className="pressable" aria-label="Share"><SendIcon /></button></span><button className={`pressable ${saved.has(item.id) ? 'is-saved' : ''}`} onClick={() => toggleSaved(item.id)} aria-label="Save"><BookmarkIcon /></button></div>
            <p><strong>{channel.title}</strong> {item.text}</p>
            <div className="demo-meta"><span>{item.reactions.map(reaction => `${reaction.emoji} ${reaction.count}`).join('  ')}</span><span>{item.views ? `${item.views} views` : ''}</span></div>
          </article>
        })}
        {!visible.length ? <div className="demo-empty"><strong>No demo posts match.</strong><span>Clear the search or choose another source.</span></div> : null}
      </section>
    </main>

    <aside className="demo-right">
      <section><div className="demo-profile"><BrandMark /><div><strong>Supergram demo</strong><span>Public preview</span></div></div><p>This is a front-end demonstration using sample Telegram-style sources. Nothing here reads your account.</p></section>
      <section><strong>Try the interaction</strong><ul><li>Filter by source</li><li>Search posts</li><li>Save posts locally</li><li>Keep scrolling through the feed</li></ul></section>
      <section className="demo-real"><strong>Want your actual feed?</strong><p>Connect Telegram to replace this sample timeline with the channels, groups, and conversations already in your account.</p><button className="demo-connect pressable" onClick={onConnect}>Connect Telegram</button></section>
    </aside>
  </div>
}
