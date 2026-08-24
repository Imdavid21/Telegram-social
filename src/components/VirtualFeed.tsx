import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { FeedItem } from '../types'

const OVERSCAN_PX = 1800

function estimateHeight(item: FeedItem) {
  if (item.sponsored) return 280
  if (!item.media) return Math.min(520, 180 + Math.ceil(String(item.text || '').length / 80) * 24)
  if (item.media.kind === 'audio' || item.media.kind === 'voice' || item.media.kind === 'document') return 300
  if (item.media.kind === 'poll' || item.media.kind === 'location' || item.media.kind === 'contact') return 260
  return 760
}

function lowerBound(prefix: number[], target: number) {
  let low = 0
  let high = prefix.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (prefix[mid] < target) low = mid + 1
    else high = mid
  }
  return low
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

  return <div ref={ref} className="sg-virtual-row" data-feed-index={index}>{children}</div>
}

export function VirtualFeed({ items, renderItem }: {
  items: FeedItem[]
  renderItem: (item: FeedItem, index: number) => ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const heightsRef = useRef(new Map<string, number>())
  const [revision, setRevision] = useState(0)
  const [viewport, setViewport] = useState(() => ({ top: typeof window === 'undefined' ? 0 : window.scrollY, height: typeof window === 'undefined' ? 900 : window.innerHeight }))
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const update = () => {
      rafRef.current = null
      setViewport({ top: window.scrollY, height: window.innerHeight })
    }
    const schedule = () => {
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(update)
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useEffect(() => {
    const valid = new Set(items.map(item => item.id))
    for (const id of heightsRef.current.keys()) if (!valid.has(id)) heightsRef.current.delete(id)
  }, [items])

  const onHeight = useMemo(() => (id: string, height: number) => {
    const previous = heightsRef.current.get(id)
    if (previous === height || Math.abs((previous || 0) - height) < 2) return
    heightsRef.current.set(id, height)
    setRevision(value => value + 1)
  }, [])

  const model = useMemo(() => {
    const prefix = new Array(items.length + 1).fill(0)
    for (let index = 0; index < items.length; index++) {
      const item = items[index]
      prefix[index + 1] = prefix[index] + (heightsRef.current.get(item.id) || estimateHeight(item))
    }

    const rootTop = rootRef.current ? rootRef.current.getBoundingClientRect().top + window.scrollY : 0
    const viewStart = Math.max(0, viewport.top - rootTop - OVERSCAN_PX)
    const viewEnd = Math.max(viewStart, viewport.top - rootTop + viewport.height + OVERSCAN_PX)
    const start = Math.max(0, Math.min(items.length, lowerBound(prefix, viewStart) - 1))
    const end = Math.max(start, Math.min(items.length, lowerBound(prefix, viewEnd) + 1))
    return {
      start,
      end,
      top: prefix[start],
      bottom: Math.max(0, prefix[items.length] - prefix[end]),
      total: prefix[items.length]
    }
  }, [items, viewport, revision])

  return <div ref={rootRef} className="sg-virtual-feed" style={{ minHeight: model.total || undefined }}>
    {model.top > 0 && <div className="sg-virtual-spacer" style={{ height: model.top }} aria-hidden="true" />}
    {items.slice(model.start, model.end).map((item, localIndex) => {
      const index = model.start + localIndex
      return <MeasuredRow item={item} index={index} onHeight={onHeight} key={item.id}>{renderItem(item, index)}</MeasuredRow>
    })}
    {model.bottom > 0 && <div className="sg-virtual-spacer" style={{ height: model.bottom }} aria-hidden="true" />}
  </div>
}
