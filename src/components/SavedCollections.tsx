import { useMemo, useState } from 'react'
import type { FeedItem, SavedCollection } from '../types'
import { createCollection, loadCollections } from '../lib/socialSystem'
import { CloseIcon } from './Icons'

type Props = { open: boolean; savedItems: FeedItem[]; onClose: () => void }

export function SavedCollections({ open, savedItems, onClose }: Props) {
  const [collections, setCollections] = useState<SavedCollection[]>(() => loadCollections())
  const [name, setName] = useState('')
  const savedIds = useMemo(() => new Set(savedItems.map(item => item.id)), [savedItems])
  if (!open) return null
  return <div className="sg-social-modal" role="dialog" aria-modal="true" aria-label="Saved collections">
    <button className="sg-social-backdrop" type="button" onClick={onClose} aria-label="Close saved collections" />
    <section className="sg-saved-panel"><header><div><strong>Saved</strong><span>{savedItems.length} saved posts across Telegram and Supergram</span></div><button type="button" onClick={onClose}><CloseIcon /></button></header>
      <form onSubmit={event => { event.preventDefault(); if (!name.trim()) return; createCollection(name); setCollections(loadCollections()); setName('') }}><input value={name} onChange={event => setName(event.target.value)} placeholder="New collection" /><button type="submit">Create</button></form>
      <div className="sg-collection-grid"><article><strong>All posts</strong><span>{savedItems.length} items</span></article>{collections.map(collection => <article key={collection.id}><strong>{collection.name}</strong><span>{collection.itemIds.filter(id => savedIds.has(id)).length} available items</span></article>)}</div>
    </section>
  </div>
}