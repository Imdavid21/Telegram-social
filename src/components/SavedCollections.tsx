import { useMemo, useState } from 'react'
import type { FeedItem, SavedCollection } from '../types'
import { createCollection, loadCollections } from '../lib/socialSystem'
import { CloseIcon } from './Icons'
import { AnimatePresence,motion } from 'motion/react'
import { IconPressable,MotionSurface } from './motion/Reactive'
import { motionTheme } from '../lib/motionTheme'

type Props = { open: boolean; savedItems: FeedItem[]; onClose: () => void }

export function SavedCollections({ open, savedItems, onClose }: Props) {
  const [collections, setCollections] = useState<SavedCollection[]>(() => loadCollections())
  const [name, setName] = useState('')
  const savedIds = useMemo(() => new Set(savedItems.map(item => item.id)), [savedItems])
  return <AnimatePresence initial={false}>{open&&<motion.div className="sg-social-modal" role="dialog" aria-modal="true" aria-label="Saved collections" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={motionTheme.transition.ui}>
    <motion.button className="sg-social-backdrop" type="button" onClick={onClose} aria-label="Close saved collections" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} />
    <MotionSurface className="sg-saved-panel"><header><div><strong>Saved</strong><span>{savedItems.length} saved posts across Telegram and Supergram</span></div><IconPressable type="button" onClick={onClose} aria-label="Close saved collections"><CloseIcon /></IconPressable></header>
      <form onSubmit={event => { event.preventDefault(); if (!name.trim()) return; createCollection(name); setCollections(loadCollections()); setName('') }}><input value={name} onChange={event => setName(event.target.value)} placeholder="New collection" /><button type="submit">Create</button></form>
      <motion.div className="sg-collection-grid" layout><motion.article layout><strong>All posts</strong><span>{savedItems.length} items</span></motion.article>{collections.map(collection => <motion.article layout key={collection.id} initial={{opacity:0,scale:.96}} animate={{opacity:1,scale:1}} transition={motionTheme.transition.gentle}><strong>{collection.name}</strong><span>{collection.itemIds.filter(id => savedIds.has(id)).length} available items</span></motion.article>)}</motion.div>
    </MotionSurface>
  </motion.div>}</AnimatePresence>
}