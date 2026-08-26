import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeedItem } from '../types'
import { loadViewerActions } from '../lib/storage'

const INITIAL_WINDOW = 36
const WINDOW_CAP = 84
const STEP = 18
const HOUR = 60 * 60 * 1000
const STORY_WINDOW = 12 * HOUR
const ACTION_WINDOW = 30 * 24 * HOUR

const URGENT_TERMS = /\b(breaking|urgent|alert|deadline|today|now|live|incident|outage|exploit|hack|hacked|breach|warning|critical|launch|listing|delist|airdrop|snapshot|vote|proposal|claim|ends? in|last chance|action required|security)\b/i
const STOP_WORDS = new Set('a an and are as at be been being but by can could did do does for from had has have he her here him his how i if in into is it its me more most my no not of on one or our out over she so some than that the their them then there they this to too up us was we were what when where which who why will with you your'.split(' '))

type ViewerModel = {
  sourceAffinity: Map<string, number>
  sourceNegative: Map<string, number>
  mediaAffinity: number
  seen: Set<string>
}

function parseMetric(value?: string) {
  if (!value) return 0
  const normalized = String(value).trim().replace(/,/g, '')
  const match = normalized.match(/^([\d.]+)\s*([kmb])?/i)
  if (!match) return Number(normalized) || 0
  const base = Number(match[1]) || 0
  const multiplier = match[2]?.toLowerCase() === 'b' ? 1_000_000_000 : match[2]?.toLowerCase() === 'm' ? 1_000_000 : match[2]?.toLowerCase() === 'k' ? 1_000 : 1
  return base * multiplier
}

function storyTokens(item: FeedItem) {
  const text = String(item.text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@#][\w-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
  const tokens = text.split(/\s+/).filter(token => token.length > 2 && !STOP_WORDS.has(token))
  return new Set(tokens.slice(0, 64))
}

function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection += 1
  const union = a.size + b.size - intersection
  return union ? intersection / union : 0
}

function buildViewerModel(): ViewerModel {
  const sourceAffinity = new Map<string, number>()
  const sourceNegative = new Map<string, number>()
  const seen = new Set<string>()
  let mediaPositive = 0
  let mediaTotal = 0
  const now = Date.now()

  for (const action of loadViewerActions()) {
    const age = Math.max(0, now - action.timestamp)
    if (age > ACTION_WINDOW) continue
    const recency = Math.max(.18, 1 - age / ACTION_WINDOW)
    const dwellSeconds = Math.max(0, Number(action.value || 0))
    let positive = 0
    let negative = 0

    if (action.type === 'save') positive = 5.5
    else if (action.type === 'open') positive = 3.5
    else if (action.type === 'dwell') positive = Math.min(5, dwellSeconds / 7)
    else if (action.type === 'impression') positive = .35
    else if (action.type === 'skip') negative = 2.5
    else if (action.type === 'unsave') negative = 1.5

    if (positive > 0) sourceAffinity.set(action.channelId, (sourceAffinity.get(action.channelId) || 0) + positive * recency)
    if (negative > 0) sourceNegative.set(action.channelId, (sourceNegative.get(action.channelId) || 0) + negative * recency)
    if (action.type === 'impression' || action.type === 'dwell' || action.type === 'open' || action.type === 'save') seen.add(action.itemId)

    if (action.media !== undefined && positive > 0) {
      mediaTotal += positive * recency
      if (action.media) mediaPositive += positive * recency
    }
  }

  return { sourceAffinity, sourceNegative, mediaAffinity: mediaTotal ? mediaPositive / mediaTotal : .5, seen }
}

function predictedViewerValue(item: FeedItem, model: ViewerModel) {
  const affinity = model.sourceAffinity.get(item.channelId) || 0
  const negative = model.sourceNegative.get(item.channelId) || 0
  const sourceSignal = Math.tanh((affinity - negative) / 8) * 24
  const mediaSignal = item.media ? (model.mediaAffinity - .5) * 24 : (.5 - model.mediaAffinity) * 8
  const unseenBoost = model.seen.has(item.id) ? -16 : 8
  return sourceSignal + mediaSignal + unseenBoost
}

function rankScore(item: FeedItem, model: ViewerModel) {
  const ageHours = Math.max(0, (Date.now() - Number(item.timestamp || 0)) / HOUR)
  const reactionCount = (item.reactions || []).reduce((total, reaction) => total + Number(reaction?.count || 0), 0)
  const engagement = reactionCount + Number(item.comments || 0) * 2 + Math.log10(parseMetric(item.views) + 1) * 3

  let score = predictedViewerValue(item, model)

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
  score += Math.min(32, Number(item.storyVelocity || 0) * 8)
  score += Math.min(18, Math.max(0, Number(item.storySources || 1) - 1) * 6)

  if (item.sponsored) score -= 28
  return score
}

function clusterStories(items: FeedItem[], model: ViewerModel) {
  type Cluster = { members: FeedItem[]; tokens: Set<string>; newest: number }
  const clusters: Cluster[] = []
  const passthrough: FeedItem[] = []

  const eligible = items
    .filter(item => !item.sponsored && String(item.text || '').trim().length >= 42)
    .sort((a, b) => b.timestamp - a.timestamp)

  const eligibleIds = new Set(eligible.map(item => item.id))
  for (const item of items) if (!eligibleIds.has(item.id)) passthrough.push(item)

  for (const item of eligible) {
    const tokens = storyTokens(item)
    if (tokens.size < 4) {
      passthrough.push(item)
      continue
    }

    let match: Cluster | undefined
    let bestSimilarity = 0
    for (const cluster of clusters) {
      if (Math.abs(cluster.newest - item.timestamp) > STORY_WINDOW) continue
      const sameSourceOnly = cluster.members.every(member => member.channelId === item.channelId)
      if (sameSourceOnly && cluster.members.length >= 2) continue
      const score = similarity(tokens, cluster.tokens)
      if (score >= .38 && score > bestSimilarity) {
        bestSimilarity = score
        match = cluster
      }
    }

    if (!match) {
      clusters.push({ members: [item], tokens, newest: item.timestamp })
      continue
    }

    match.members.push(item)
    match.newest = Math.max(match.newest, item.timestamp)
    for (const token of tokens) match.tokens.add(token)
  }

  const clustered = clusters.flatMap(cluster => {
    const sources = new Set(cluster.members.map(member => member.channelId))
    if (cluster.members.length < 2 || sources.size < 2) return cluster.members

    const times = cluster.members.map(member => member.timestamp)
    const newest = Math.max(...times)
    const oldest = Math.min(...times)
    const spanHours = Math.max(.25, (newest - oldest) / HOUR)
    const velocity = sources.size / spanHours
    const representative = [...cluster.members].sort((a, b) => rankScore(b, model) - rankScore(a, model) || b.timestamp - a.timestamp)[0]
    const strongestMedia = cluster.members.find(member => member.media)?.media

    return [{
      ...representative,
      media: representative.media || strongestMedia,
      timestamp: newest,
      unread: cluster.members.some(member => member.unread),
      saved: cluster.members.some(member => member.saved),
      storySources: sources.size,
      storyVelocity: velocity,
      storyClustered: true,
      storyKey: `story:${[...sources].sort().join(':')}:${Math.floor(newest / STORY_WINDOW)}`
    }]
  })

  return [...clustered, ...passthrough]
}

function rankFeed(items: FeedItem[]) {
  const model = buildViewerModel()
  const clusteredItems = clusterStories(items, model)
  const ranked = [...clusteredItems]
    .map((item, index) => ({ item, index, score: rankScore(item, model) }))
    .sort((a, b) => b.score - a.score || b.item.timestamp - a.item.timestamp || a.index - b.index)

  const output: FeedItem[] = []
  const remaining = [...ranked]
  const sourceCounts = new Map<string, number>()

  while (remaining.length) {
    const recentSources = output.slice(-4).map(item => item.channelId)
    let bestIndex = 0
    let bestAdjusted = -Infinity

    for (let i = 0; i < Math.min(16, remaining.length); i++) {
      const candidate = remaining[i]
      const recentRepetition = recentSources.filter(source => source === candidate.item.channelId).length
      const globalCount = sourceCounts.get(candidate.item.channelId) || 0
      const repetitionPenalty = recentRepetition * 26 + Math.max(0, globalCount - 2) * 7
      const storyRelief = candidate.item.storyClustered ? 10 : 0
      const explorationBoost = globalCount === 0 && !model.seen.has(candidate.item.id) ? 4 : 0
      const adjusted = candidate.score - repetitionPenalty + storyRelief + explorationBoost
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted
        bestIndex = i
      }
    }

    const selected = remaining.splice(bestIndex, 1)[0].item
    output.push(selected)
    sourceCounts.set(selected.channelId, (sourceCounts.get(selected.channelId) || 0) + 1)
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
      return <MeasuredRow item={item} index={index} onHeight={onHeight} key={item.storyKey || item.id}>{renderItem(item, index)}</MeasuredRow>
    })}
    <div ref={bottomSentinel} className="sg-virtual-sentinel" aria-hidden="true" />
    {spacers.bottom > 0 ? <div className="sg-virtual-spacer" style={{ height: spacers.bottom }} aria-hidden="true" /> : null}
  </div>
}
