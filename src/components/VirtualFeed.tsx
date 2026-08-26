import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeedItem } from '../types'

const INITIAL_WINDOW = 36
const WINDOW_CAP = 84
const STEP = 18
const HOUR = 60 * 60 * 1000

const URGENT_TERMS = /\b(breaking|urgent|alert|deadline|today|now|live|incident|outage|exploit|hack|hacked|breach|warning|critical|launch|listing|delist|airdrop|snapshot|vote|proposal|claim|ends? in|last chance|action required|security)\b/i

function parseMetric(value?: string) {
  if (!value) return 0
  const normalized = String(value).trim().replace(/,/g, '')
  const match = normalized.match(/^([\d.]+)\s*([kmb])?/i)
  if (!match) return Number(normalized) || 0
  const base = Number(match[1]) || 0
  const multiplier = match[2]?.toLowerCase() === 'b' ? 1_000_000_000 : match[2]?.toLowerCase() === 'm' ? 1_000_000 : match[2]?.toLowerCase() === 'k' ? 1_000 : 1
  return base * multiplier
}

function rankScore(item: FeedItem) {
  const ageHours = Math.max(0, (Date.now() - Number(item.timestamp || 0)) / HOUR)
  const reactionCount = (item.reactions || []).reduce((total, reaction) => total + Number(reaction?.count || 0), 0)
  const engagement = reactionCount + Number(item.comments || 0) * 2 + Math.log10(parseMetric(item.views) + 1) * 3

  let score = 0

  // Media is the strongest default signal, but a genuinely urgent text post can still outrank stale media.
  if (item.media) {
    score += 52
    if (item.media.kind === 'album') score += 7
    if (item.media.kind === 'video' || item.media.kind === 'photo') score += 5
  }

  if (URGENT_TERMS.test(String(item.text || ''))) score += 46
  if (item.unread) score += 12
  if (item.saved) score += 3

  if (ageHours <= 3) score += 38
  else if (ageHours <= 8) score += 33
  else if (ageHours <= 24) score += 27
  else if (ageHours <= 72) score += 17
  else if (ageHours <= 168) score += 8
  else score -= Math.min(18, (ageHours - 168) / 24)

  score += Math.min(20, engagement)

  // Keep sponsored content from displacing genuinely useful posts at the top.
  if (item.sponsored) score -= 28

  return score
}

function rankFeed(items: FeedItem[]) {
  const ranked = [...items]
    .map((item, index) => ({ item, index, score: rankScore(item) }))
    .sort((a, b) => b.score - a.score || b.item.timestamp - a.item.timestamp || a.index - b.index)

  // Lightweight source diversity rerank. This prevents one noisy channel from filling the entire first screen.
  const output: FeedItem[] = []
  const remaining = [...ranked]
  while (remaining.length) {
    const recentSources = output.slice(-2).map(item => item.channelId)
    let bestIndex = 0
    let bestAdjusted = -Infinity

    for (let i = 0; i < Math.min(10, remaining.length); i++) {
      const candidate = remaining[i]
      const repetitionPenalty = recentSources.filter(source => source === candidate.item.channelId).length * 22
      const adjusted = candidate.score - repetitionPenalty
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted
        bestIndex = i
      }
    }

    output.push(remaining.splice(bestIndex, 1)[0].item)
  }

  return output
}

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

  return <div ref={ref} className="sg-virtual-row" data-feed-index={index} data-post-id={item.id}>{children}</div>
}

export function VirtualFeed({ items, renderItem }: {
  items: FeedItem[]
  renderItem: (item: FeedItem, index: number) => ReactNode
}) {
  const rankedItems = useMemo(() => rankFeed(items), [items])
  const heightsRef = useRef(new Map<string, number>())
  const topSentinel = useRef<HTMLDivElement>(null)
  const bottomSentinel = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState(() => ({ start: 0, end: Math.min(rankedItems.length, INITIAL_WINDOW) }))
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const valid = new Set(rankedItems.map(item => item.id))
    for (const id of heightsRef.current.keys()) if (!valid.has(id)) heightsRef.current.delete(id)
    setRange(current => {
      if (!rankedItems.length) return { start: 0, end: 0 }
      const start = Math.min(current.start, Math.max(0, rankedItems.length - 1))
      const end = Math.max(start + 1, Math.min(rankedItems.length, Math.max(current.end, Math.min(rankedItems.length, INITIAL_WINDOW))))
      return { start, end }
    })
  }, [rankedItems])

  const onHeight = useCallback((id: string, height: number) => {
    const previous = heightsRef.current.get(id)
    if (previous && Math.abs(previous - height) < 2) return
    heightsRef.current.set(id, height)
    setRevision(value => value + 1)
  }, [])

  const heightFor = useCallback((item?: FeedItem) => item ? (heightsRef.current.get(item.id) || estimateHeight(item)) : 0, [])

  const safeRange = useMemo(() => {
    const start = Math.max(0, Math.min(range.start, rankedItems.length))
    const end = Math.max(start, Math.min(range.end, rankedItems.length))
    return { start, end }
  }, [rankedItems.length, range])

  const spacers = useMemo(() => {
    let top = 0
    let bottom = 0
    for (let i = 0; i < safeRange.start; i++) top += heightFor(rankedItems[i])
    for (let i = safeRange.end; i < rankedItems.length; i++) bottom += heightFor(rankedItems[i])
    return { top, bottom }
  }, [heightFor, rankedItems, safeRange, revision])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !rankedItems.length) return
    const top = topSentinel.current
    const bottom = bottomSentinel.current
    if (!top || !bottom) return

    const viewportHeight = Math.max(600, window.innerHeight || 0)
    const bottomMarginPx = Math.max(1800, Math.round(viewportHeight * 6.5))
    const topMarginPx = Math.max(1400, Math.round(viewportHeight * 4.5))

    const bottomObserver = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setRange(current => {
        if (current.end >= rankedItems.length) return current
        const nextEnd = Math.min(rankedItems.length, current.end + STEP)
        const nextStart = Math.max(0, nextEnd - WINDOW_CAP)
        return { start: Math.max(current.start, nextStart), end: nextEnd }
      })
    }, { rootMargin: `0px 0px ${bottomMarginPx}px 0px` })

    const topObserver = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setRange(current => {
        if (current.start <= 0) return current
        const nextStart = Math.max(0, current.start - STEP)
        const nextEnd = Math.min(rankedItems.length, Math.max(current.end, nextStart + WINDOW_CAP))
        return { start: nextStart, end: nextEnd }
      })
    }, { rootMargin: `${topMarginPx}px 0px 0px 0px` })

    bottomObserver.observe(bottom)
    topObserver.observe(top)
    return () => { bottomObserver.disconnect(); topObserver.disconnect() }
  }, [rankedItems.length, safeRange.start, safeRange.end])

  return <div className="sg-virtual-feed">
    {spacers.top > 0 ? <div className="sg-virtual-spacer" style={{ height: spacers.top }} aria-hidden="true" /> : null}
    <div ref={topSentinel} className="sg-virtual-sentinel" aria-hidden="true" />
    {rankedItems.slice(safeRange.start, safeRange.end).map((item, localIndex) => {
      const index = safeRange.start + localIndex
      return <MeasuredRow item={item} index={index} onHeight={onHeight} key={item.id}>{renderItem(item, index)}</MeasuredRow>
    })}
    <div ref={bottomSentinel} className="sg-virtual-sentinel" aria-hidden="true" />
    {spacers.bottom > 0 ? <div className="sg-virtual-spacer" style={{ height: spacers.bottom }} aria-hidden="true" /> : null}
  </div>
}
