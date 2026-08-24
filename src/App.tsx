import { useEffect, useMemo, useState } from 'react'
import { authStatus, fetchFeed, logoutTelegram, saveTelegramPost } from './lib/api'
import type { Channel, FeedFilter, FeedItem } from './types'

const demoChannels: Channel[] = [
  { id: 'design', title: 'Design Dispatch', username: 'design_dispatch', initials: 'DD', accent: '#56d6b0', unread: 3, followers: '18.4K' },
  { id: 'product', title: 'Product Signals', username: 'productsignals', initials: 'PS', accent: '#f2b56b', unread: 0, followers: '42.1K' },
  { id: 'indie', title: 'Indie Makers', username: 'indiemakers', initials: 'IM', accent: '#a98df4', unread: 8, followers: '9.7K' },
]
const demoFeed: FeedItem[] = [
  { id: '1', messageId: 1, channelId: 'design', timestamp: Date.now() - 1000 * 60 * 18, text: 'A calmer interface is often a faster interface. This week we are collecting small patterns that make complex products feel obvious.', unread: true, saved: false, reactions: [{ emoji: '♥', count: 18 }, { emoji: '✦', count: 7 }], views: '2.4K', comments: 12 },
  { id: '2', messageId: 2, channelId: 'product', timestamp: Date.now() - 1000 * 60 * 75, text: 'The best product updates do not announce features. They explain what is easier now.', unread: false, saved: true, reactions: [{ emoji: '♥', count: 31 }], views: '5.8K', comments: 24, media: { kind: 'photo', gradient: 'linear-gradient(135deg, #253b40, #b47f5e)', label: 'Field notes / 04' } },
  { id: '3', messageId: 3, channelId: 'indie', timestamp: Date.now() - 1000 * 60 * 160, text: 'Shipping in public is less about broadcasting every move and more about leaving a trail others can learn from.', unread: true, saved: false, reactions: [{ emoji: '✦', count: 14 }], views: '1.1K', comments: 4 },
]

function App() {
  const [channels, setChannels] = useState<Channel[]>(demoChannels)
  const [feed, setFeed] = useState<FeedItem[]>(demoFeed)
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [activeChannel, setActiveChannel] = useState('all')
  const [connected, setConnected] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => { authStatus().then((result) => setConnected(result.connected)).catch(() => undefined); fetchFeed().then((result) => { if (result.feed?.length) { setChannels(result.channels); setFeed(result.feed) } }).catch(() => undefined) }, [])
  const visible = useMemo(() => feed.filter((item) => (activeChannel === 'all' || item.channelId === activeChannel) && (filter === 'all' || (filter === 'unread' && item.unread) || (filter === 'saved' && item.saved) || (filter === 'media' && item.media))), [feed, filter, activeChannel])
  const channelFor = (id: string) => channels.find((channel) => channel.id === id) ?? demoChannels[0]
  const toggleSave = (item: FeedItem) => { setFeed((items) => items.map((entry) => entry.id === item.id ? { ...entry, saved: !entry.saved } : entry)); saveTelegramPost(item).catch(() => undefined) }

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">t</span><span>unofficial.social</span></div><button className="new-channel" onClick={() => setNotice('Connect Telegram to add channels.')}>+ Add channel</button><nav><button className={activeChannel === 'all' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveChannel('all')}><span>◉</span> All updates <b>{feed.filter((item) => item.unread).length}</b></button><p className="section-label">YOUR CHANNELS</p>{channels.map((channel) => <button className={activeChannel === channel.id ? 'nav-item active' : 'nav-item'} key={channel.id} onClick={() => setActiveChannel(channel.id)}><i style={{ background: channel.accent }}>{channel.initials[0]}</i>{channel.title}<b>{channel.unread || ''}</b></button>)}</nav><div className="sidebar-footer"><span className="status-dot" /> {connected ? 'Telegram connected' : 'Preview mode'}<button className="logout" onClick={() => logoutTelegram().then(() => setConnected(false)).catch(() => undefined)}>{connected ? 'Log out' : 'Settings'}</button></div></aside>
    <main><header><div><p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1>Good morning.</h1></div><button className="connect" onClick={() => setNotice(connected ? 'You are already connected.' : 'Start the Telegram login flow from the server.')}>{connected ? 'Connected' : 'Connect Telegram'} <span>↗</span></button></header><div className="toolbar"><div className="filters">{(['all', 'unread', 'saved', 'media'] as FeedFilter[]).map((value) => <button key={value} className={filter === value ? 'filter active' : 'filter'} onClick={() => setFilter(value)}>{value[0].toUpperCase() + value.slice(1)}{value === 'unread' && <small>{feed.filter((item) => item.unread).length}</small>}</button>)}</div><button className="sort">Newest first⌄</button></div>{notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}<section className="feed">{visible.map((item) => { const channel = channelFor(item.channelId); return <article className={item.unread ? 'post unread' : 'post'} key={item.id}><div className="post-meta"><span className="channel-avatar" style={{ background: channel.accent }}>{channel.initials[0]}</span><div><strong>{channel.title}</strong><span>@{channel.username} · {Math.max(1, Math.round((Date.now() - item.timestamp) / 60000))}m</span></div><button className={item.saved ? 'save saved' : 'save'} onClick={() => toggleSave(item)} aria-label="Save post">{item.saved ? '★' : '☆'}</button></div><p className="post-copy">{item.text}</p>{item.media && <div className="media" style={{ background: item.media.gradient }}><span>{item.media.label}</span></div>}<div className="post-footer"><span>{item.reactions.map((reaction) => <button key={reaction.emoji}>{reaction.emoji} {reaction.count}</button>)}</span><span>{item.views} views · {item.comments} comments</span></div></article>})}</section>{visible.length === 0 && <div className="empty">Nothing here yet.</div>}</main></div>
}
export default App
