import type { FeedItem, RankingReason } from '../types'
import { loadViewerActions } from './storage'

const HOUR = 60 * 60 * 1000
const STORY_WINDOW = 12 * HOUR
const ACTION_WINDOW = 30 * 24 * HOUR
const URGENT_TERMS = /\b(breaking|urgent|alert|deadline|incident|outage|exploit|hack|hacked|breach|warning|critical|delist|airdrop|snapshot|vote|proposal|claim|last chance|action required|security)\b/i
const STOP_WORDS = new Set('a an and are as at be been being but by can could did do does for from had has have he her here him his how i if in into is it its me more most my no not of on one or our out over she so some than that the their them then there they this to too up us was we were what when where which who why will with you your'.split(' '))

export const DEFAULT_RANKING_WEIGHTS = {
  media: 22,
  urgent: 18,
  unread: 10,
  saved: 3,
  favoriteSource: 18,
  fresh3h: 30,
  fresh8h: 26,
  fresh24h: 21,
  fresh72h: 13,
  fresh7d: 6,
  sponsoredPenalty: 24,
  unseenBoost: 6,
  seenPenalty: 10,
  repetitionPenalty: 22,
  globalSourcePenalty: 6
} as const

type ViewerModel = {
  sourceAffinity: Map<string, number>
  sourceNegative: Map<string, number>
  mediaAffinity: number
  seen: Set<string>
}

export type RankingOptions = {
  favoriteSources?: Set<string>
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

    if (action.type === 'save') positive = 5
    else if (action.type === 'open') positive = 3.5
    else if (action.type === 'dwell') positive = Math.min(4.5, dwellSeconds / 8)
    else if (action.type === 'favorite_source') positive = 7
    else if (action.type === 'more_like_this') positive = 6
    else if (action.type === 'skip') negative = 2
    else if (action.type === 'unsave') negative = 1.25
    else if (action.type === 'unfavorite_source') negative = 3
    else if (action.type === 'less_like_this') negative = 7
    else if (action.type === 'hide_source') negative = 12

    if (positive > 0) sourceAffinity.set(action.channelId, (sourceAffinity.get(action.channelId) || 0) + positive * recency)
    if (negative > 0) sourceNegative.set(action.channelId, (sourceNegative.get(action.channelId) || 0) + negative * recency)
    if (action.type === 'dwell' || action.type === 'open' || action.type === 'save') seen.add(action.itemId)

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
  const sourceSignal = Math.tanh((affinity - negative) / 10) * 20
  const mediaSignal = item.media ? (model.mediaAffinity - .5) * 12 : (.5 - model.mediaAffinity) * 5
  const seenSignal = model.seen.has(item.id) ? -DEFAULT_RANKING_WEIGHTS.seenPenalty : DEFAULT_RANKING_WEIGHTS.unseenBoost
  return sourceSignal + mediaSignal + seenSignal
}

function rankScore(item: FeedItem, model: ViewerModel, options: RankingOptions) {
  const ageHours = Math.max(0, (Date.now() - Number(item.timestamp || 0)) / HOUR)
  const reactionCount = (item.reactions || []).reduce((total, reaction) => total + Number(reaction?.count || 0), 0)
  const engagement = reactionCount + Number(item.comments || 0) * 2 + Math.log10(parseMetric(item.views) + 1) * 2.5
  let score = predictedViewerValue(item, model)

  if (item.media) score += DEFAULT_RANKING_WEIGHTS.media
  if (URGENT_TERMS.test(String(item.text || ''))) score += DEFAULT_RANKING_WEIGHTS.urgent
  if (item.unread) score += DEFAULT_RANKING_WEIGHTS.unread
  if (item.saved) score += DEFAULT_RANKING_WEIGHTS.saved
  if (options.favoriteSources?.has(item.channelId)) score += DEFAULT_RANKING_WEIGHTS.favoriteSource

  if (ageHours <= 3) score += DEFAULT_RANKING_WEIGHTS.fresh3h
  else if (ageHours <= 8) score += DEFAULT_RANKING_WEIGHTS.fresh8h
  else if (ageHours <= 24) score += DEFAULT_RANKING_WEIGHTS.fresh24h
  else if (ageHours <= 72) score += DEFAULT_RANKING_WEIGHTS.fresh72h
  else if (ageHours <= 168) score += DEFAULT_RANKING_WEIGHTS.fresh7d
  else score -= Math.min(14, (ageHours - 168) / 30)

  score += Math.min(14, engagement)
  score += Math.min(18, Number(item.storyVelocity || 0) * 5)
  score += Math.min(12, Math.max(0, Number(item.storySources || 1) - 1) * 4)
  if (item.sponsored) score -= DEFAULT_RANKING_WEIGHTS.sponsoredPenalty
  return score
}

function clusterStories(items: FeedItem[], model: ViewerModel, options: RankingOptions) {
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
      const score = similarity(tokens, cluster.tokens)
      if (score >= .4 && score > bestSimilarity) {
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
    const representative = [...cluster.members].sort((a, b) => rankScore(b, model, options) - rankScore(a, model, options) || b.timestamp - a.timestamp)[0]
    const strongestMedia = cluster.members.find(member => member.media)?.media
    const evidenceSeen = new Set<string>()
    const storyMembers = [...cluster.members]
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter(member => {
        if (evidenceSeen.has(member.channelId)) return false
        evidenceSeen.add(member.channelId)
        return true
      })
      .map(member => ({ id: member.id, messageId: member.messageId, channelId: member.channelId, timestamp: member.timestamp, text: member.text }))

    return [{
      ...representative,
      media: representative.media || strongestMedia,
      timestamp: newest,
      unread: cluster.members.some(member => member.unread),
      saved: cluster.members.some(member => member.saved),
      storySources: storyMembers.length,
      storyVelocity: velocity,
      storyClustered: true,
      storyMembers,
      storyKey: `story:${storyMembers.map(member => member.channelId).sort().join(':')}:${Math.floor(newest / STORY_WINDOW)}`
    }]
  })

  return [...clustered, ...passthrough]
}

export function rankFeed(items: FeedItem[], options: RankingOptions = {}) {
  const model = buildViewerModel()
  const clusteredItems = clusterStories(items, model, options)
  const ranked = [...clusteredItems]
    .map((item, index) => ({ item, index, score: rankScore(item, model, options) }))
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
      const repetitionPenalty = recentRepetition * DEFAULT_RANKING_WEIGHTS.repetitionPenalty + Math.max(0, globalCount - 2) * DEFAULT_RANKING_WEIGHTS.globalSourcePenalty
      const explorationBoost = globalCount === 0 && !model.seen.has(candidate.item.id) ? 3 : 0
      const adjusted = candidate.score - repetitionPenalty + explorationBoost
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

export function latestFeed(items: FeedItem[]) {
  return [...items].sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))
}

export function getRankingReasons(item: FeedItem, options: RankingOptions = {}): RankingReason[] {
  const reasons: RankingReason[] = []
  const ageHours = Math.max(0, (Date.now() - Number(item.timestamp || 0)) / HOUR)
  const actions = loadViewerActions().filter(action => action.channelId === item.channelId)
  const positive = actions.some(action => action.type === 'save' || action.type === 'open' || action.type === 'dwell' || action.type === 'more_like_this')
  if (ageHours <= 24) reasons.push({ type: 'fresh', label: 'Posted recently' })
  if (options.favoriteSources?.has(item.channelId)) reasons.push({ type: 'favorite', label: 'From a favorite source' })
  if (positive) reasons.push({ type: 'source_affinity', label: 'You often engage with this source' })
  if (item.storyClustered && Number(item.storySources || 0) > 1) reasons.push({ type: 'multi_source', label: `Appearing across ${Number(item.storySources)} sources` })
  if (item.unread) reasons.push({ type: 'unread', label: 'Still unread' })
  if (item.media) reasons.push({ type: 'media', label: 'Contains media' })
  if ((item.reactions || []).some(reaction => Number(reaction.count || 0) > 0) || Number(item.comments || 0) > 0) reasons.push({ type: 'engagement', label: 'Getting engagement' })
  return reasons.slice(0, 4)
}
