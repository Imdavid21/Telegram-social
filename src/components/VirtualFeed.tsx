import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import type { FeedItem, FeedMode } from '../types'
import { latestFeed, rankFeed } from '../lib/ranking'
import { AnimatedListItem } from './motion/Reactive'

const INITIAL_WINDOW = 36
const WINDOW_CAP = 84
const STEP = 18

function estimateHeight(item?: FeedItem) {
  if (!item) return 0
  if (item.sponsored) return 280
  if (!item.media) return Math.min(520, 180 + Math.ceil(String(item.text || '').length / 80) * 24)
  if (item.media.kind === 'audio' || item.media.kind === 'voice' || item.media.kind === 'document') return 300
  if (item.media.kind === 'poll' || item.media.kind === 'location' || item.media.kind === 'contact') return 260
  return 720
}

function MeasuredRow({ item, index, onHeight, children }: {
  item: FeedItem
  index: number
  onHeight: (id: string, height: number) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const report = () => {
      const height = Math.ceil(node.getBoundingClientRect().height)
      if (height > 0) onHeight(item.id, height)
    }
    report()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(report)
    observer.observe(node)
    return () => observer.disconnect()
  }, [item.id, onHeight])

  return <div ref={ref} className="sg-virtual-row" data-feed-index={index} data-post-id={item.id}><AnimatedListItem index={index}>{children}</AnimatedListItem></div>
}

export function VirtualFeed({ items, mode, favoriteSources, rankingRevision, renderItem }: {
  items: FeedItem[]
  mode: FeedMode
  favoriteSources: Set<string>
  rankingRevision: number
  renderItem: (item: FeedItem, index: number) => ReactNode
}) {
  const orderedItems = useMemo(
    () => mode === 'latest' ? latestFeed(items) : rankFeed(items, { favoriteSources }),
    [favoriteSources, items, mode, rankingRevision]
  )
  const heightsRef = useRef(new Map<string, number>())
  const topSentinel = useRef<HTMLDivElement>(null)
  const bottomSentinel = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState(() => ({ start: 0, end: Math.min(orderedItems.length, INITIAL_WINDOW) }))
  const [heightRevision, setHeightRevision] = useState(0)

  useEffect(() => {
    const valid = new Set(orderedItems.map(item => item.id))
    for (const id of heightsRef.current.keys()) if (!valid.has(id)) heightsRef.current.delete(id)
    setRange(current => {
      if (!orderedItems.length) return { start: 0, end: 0 }
      const start = Math.min(current.start, Math.max(0, orderedItems.length - 1))
      const end = Math.max(start + 1, Math.min(orderedItems.length, Math.max(current.end, Math.min(orderedItems.length, INITIAL_WINDOW))))
      return { start, end }
    })
  }, [orderedItems])

  useEffect(() => {
    setRange({ start: 0, end: Math.min(orderedItems.length, INITIAL_WINDOW) })
  }, [mode])

  const onHeight = useCallback((id: string, height: number) => {
    const previous = heightsRef.current.get(id)
    if (previous && Math.abs(previous - height) < 2) return
    heightsRef.current.set(id, height)
    setHeightRevision(value => value + 1)
  }, [])

  const heightFor = useCallback((item?: FeedItem) => item ? (heightsRef.current.get(item.id) || estimateHeight(item)) : 0, [])

  const safeRange = useMemo(() => {
    const start = Math.max(0, Math.min(range.start, orderedItems.length))
    const end = Math.max(start, Math.min(range.end, orderedItems.length))
    return { start, end }
  }, [orderedItems.length, range])

  const spacers = useMemo(() => {
    let top = 0
    let bottom = 0
    for (let i = 0; i < safeRange.start; i++) top += heightFor(orderedItems[i])
    for (let i = safeRange.end; i < orderedItems.length; i++) bottom += heightFor(orderedItems[i])
    return { top, bottom }
  }, [heightFor, orderedItems, safeRange, heightRevision])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !orderedItems.length) return
    const top = topSentinel.current
    const bottom = bottomSentinel.current
    if (!top || !bottom) return

    const viewportHeight = Math.max(600, window.innerHeight || 0)
    const bottomMarginPx = Math.max(1800, Math.round(viewportHeight * 6.5))
    const topMarginPx = Math.max(1400, Math.round(viewportHeight * 4.5))

    const bottomObserver = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setRange(current => {
        if (current.end >= orderedItems.length) return current
        const nextEnd = Math.min(orderedItems.length, current.end + STEP)
        const nextStart = Math.max(0, nextEnd - WINDOW_CAP)
        return { start: Math.max(current.start, nextStart), end: nextEnd }
      })
    }, { rootMargin: `0px 0px ${bottomMarginPx}px 0px` })

    const topObserver = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setRange(current => {
        if (current.start <= 0) return current
        const nextStart = Math.max(0, current.start - STEP)
        const nextEnd = Math.min(orderedItems.length, Math.max(current.end, nextStart + WINDOW_CAP))
        return { start: nextStart, end: nextEnd }
      })
    }, { rootMargin: `${topMarginPx}px 0px 0px 0px` })

    bottomObserver.observe(bottom)
    topObserver.observe(top)
    return () => { bottomObserver.disconnect(); topObserver.disconnect() }
  }, [orderedItems.length, safeRange.start, safeRange.end])

  return <div className="sg-virtual-feed" data-feed-mode={mode}>
    {spacers.top > 0 ? <div className="sg-virtual-spacer" style={{ height: spacers.top }} aria-hidden="true" /> : null}
    <div ref={topSentinel} className="sg-virtual-sentinel" aria-hidden="true" />
    <AnimatePresence initial={false} mode="popLayout">
      {orderedItems.slice(safeRange.start, safeRange.end).map((item, localIndex) => {
        const index = safeRange.start + localIndex
        return <MeasuredRow item={item} index={index} onHeight={onHeight} key={item.storyKey || item.id}>{renderItem(item, index)}</MeasuredRow>
      })}
    </AnimatePresence>
    <div ref={bottomSentinel} className="sg-virtual-sentinel" aria-hidden="true" />
    {spacers.bottom > 0 ? <div className="sg-virtual-spacer" style={{ height: spacers.bottom }} aria-hidden="true" /> : null}
  </div>
}
