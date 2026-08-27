import { useState } from 'react'
import type { ActivityItem } from '../types'
import { loadActivities, markActivityRead } from '../lib/socialSystem'
import { CloseIcon } from './Icons'

type Props = { open: boolean; onClose: () => void }

export function ActivityCenter({ open, onClose }: Props) {
  const [items, setItems] = useState<ActivityItem[]>(() => loadActivities())
  if (!open) return null
  const read = (id: string) => { markActivityRead(id); setItems(loadActivities()) }
  return <div className="sg-social-modal" role="dialog" aria-modal="true" aria-label="Activity">
    <button className="sg-social-backdrop" type="button" onClick={onClose} aria-label="Close activity" />
    <section className="sg-activity-panel"><header><div><strong>Activity</strong><span>Replies, mentions, reactions, follows, tags, and invites</span></div><button type="button" onClick={onClose}><CloseIcon /></button></header>
      {items.length ? <div className="sg-activity-list">{items.map(item => <button type="button" className={item.read ? '' : 'is-unread'} key={item.id} onClick={() => read(item.id)}><span className="sg-activity-avatar">{item.actor.avatar ? <img src={item.actor.avatar} alt="" /> : item.actor.name.slice(0, 1)}</span><span><strong>{item.actor.name}</strong><small>{item.kind.replace('-', ' ')}{item.aggregateCount && item.aggregateCount > 1 ? ` +${item.aggregateCount - 1}` : ''}</small>{item.excerpt && <p>{item.excerpt}</p>}</span><time>{new Date(item.createdAt).toLocaleDateString()}</time></button>)}</div> : <div className="sg-social-empty"><strong>No social activity yet</strong><span>Telegram unread updates remain available in the main Activity feed.</span></div>}
    </section>
  </div>
}