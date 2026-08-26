import type { Channel, FeedDiagnostics, FeedItem, FeedPage, FeedUpdate } from '../types'

type FlowState = { step: 'starting'|'processing'|'phone'|'code'|'password'|'done'|'error'; error?: string | null; meta?: Record<string, unknown> }
type HealthState = { ok: boolean; configured: boolean; runtime?: string; version?: string }
type RawFeedState = {
  channels?: unknown
  feed?: unknown
  sources?: unknown
  posts?: unknown
  nextCursor?: unknown
  hasMore?: unknown
  syncToken?: unknown
  diagnostics?: FeedDiagnostics
}

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {})
    },
    ...init
  })

  const text = await res.text()
  let data: any = {}
  if (text) {
    try { data = JSON.parse(text) }
    catch { throw new ApiError(`Invalid JSON response from ${url} (${res.status}).`, res.status) }
  } else if (res.status !== 204) {
    throw new ApiError(`Empty API response from ${url} (${res.status}).`, res.status) }
  }

  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code)
  return data as T
}

export function healthStatus() { return request<HealthState>('/api/health') }
export function authStatus() { return request<{ connected: boolean; user?: { id: string; firstName: string; username?: string } }>('/api/auth/status') }
export function beginAuth() { return request<FlowState>('/api/auth/begin', { method: 'POST', body: '{}' }) }
export function submitAuth(value: string) { return request<FlowState>('/api/auth/input', { method: 'POST', body: JSON.stringify({ value }) }) }
export function authFlow() { return request<FlowState>('/api/auth/flow') }
export function logoutTelegram() { return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' }) }

export async function fetchFeed(cursor?: string | null, limit = 40): Promise<FeedPage> {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  params.set('limit', String(limit))
  const data = await request<RawFeedState>(`/api/feed?${params}`)
  const rawChannels = Array.isArray(data?.channels) ? data.channels : Array.isArray(data?.sources) ? data.sources : []
  const rawFeed = Array.isArray(data?.feed) ? data.feed : Array.isArray(data?.posts) ? data.posts : []
  return {
    channels: rawChannels.filter((row): row is Channel => Boolean(row && typeof row === 'object')),
    feed: rawFeed.filter((row): row is FeedItem => Boolean(row && typeof row === 'object')),
    nextCursor: typeof data?.nextCursor === 'string' && data.nextCursor ? data.nextCursor : null,
    hasMore: Boolean(data?.hasMore),
    syncToken: Number(data?.syncToken || 0),
    diagnostics: data?.diagnostics
  }
}

export function fetchFeedUpdates(after: number, signal?: AbortSignal) {
  return request<{ updates: FeedUpdate[]; syncToken: number }>(`/api/feed/updates?after=${Math.max(0, Number(after || 0))}`, { signal })
}
export function fetchFeedDiagnostics() { return request<FeedDiagnostics>('/api/feed/diagnostics') }
export function fetchMediaTicket(endpoint: string, signal?: AbortSignal) {
  if (!endpoint.startsWith('/api/media/ticket/')) throw new Error('Invalid media ticket endpoint.')
  return request<{ url: string; expiresAt: number }>(endpoint, { signal })
}

const LOCAL_STOP = new Set('a an and are as at be been being but by can could did do does for from had has have if in into is it its more most no not of on one or our out over so some than that the their them then there they this to too up was we were what when where which who why will with you your'.split(' '))
const SIGNAL = /\b(breaking|urgent|alert|deadline|today|tomorrow|now|live|incident|outage|exploit|hack|breach|launch|listing|delist|airdrop|snapshot|vote|proposal|claim|security|announc|release|update|ship|price|fund|raise|partnership|deadline)\w*/i
const NUMBER = /(?:[$₹€£]\s?)?\d[\d,.]*(?:\s?(?:%|k|m|b|million|billion|hours?|days?|weeks?|months?|years?))?/i

function cleanLocal(value: string) {
  return value.replace(/https?:\/\/\S+/g, ' ').replace(/(^|\s)@[\w_]+/g, '$1').replace(/(^|\s)#[\w-]+/g, '$1').replace(/[•▪◦]+/g, ' ').replace(/\s+/g, ' ').trim()
}
function clipLocal(value: string, limit: number) {
  if (value.length <= limit) return value
  const part = value.slice(0, limit + 1)
  const cut = part.lastIndexOf(' ')
  return `${(cut > limit * .65 ? part.slice(0, cut) : part.slice(0, limit)).trim()}…`
}
function localSummary(text: string, context: { outgoing?: boolean; sourceType?: string; sourceName?: string }) {
  const cleaned = cleanLocal(text)
  if (!cleaned) return { headline: 'Telegram update', summary: '', model: 'local-extractive-v2', ml: true, reason: 'on-device' }
  const sentences = cleaned.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean).slice(0, 18)
  const frequencies = new Map<string, number>()
  for (const word of cleaned.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || []) if (!LOCAL_STOP.has(word)) frequencies.set(word, (frequencies.get(word) || 0) + 1)
  const scored = sentences.map((sentence, index) => {
    const words = sentence.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || []
    const topical = words.reduce((sum, word) => sum + Math.min(3, frequencies.get(word) || 0), 0) / Math.max(5, words.length)
    const signal = SIGNAL.test(sentence) ? 3.2 : 0
    const numeric = NUMBER.test(sentence) ? 2.4 : 0
    const recency = index === 0 ? 1.4 : index === 1 ? .8 : 0
    const length = sentence.length >= 35 && sentence.length <= 220 ? .8 : 0
    return { sentence, index, score: topical + signal + numeric + recency + length }
  })
  const headlineSentence = [...scored].sort((a, b) => b.score - a.score || a.index - b.index)[0]?.sentence || sentences[0] || cleaned
  const summaryParts = [...scored].filter(row => row.sentence !== headlineSentence).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2).sort((a, b) => a.index - b.index).map(row => row.sentence)
  const direction = context.outgoing && context.sourceType === 'person' ? 'You: ' : ''
  const headline = clipLocal(`${direction}${headlineSentence.replace(/[.!?]+$/, '')}`, 96)
  const summary = clipLocal(summaryParts.join(' ') || (headlineSentence !== cleaned ? cleaned : ''), 240)
  return { headline, summary: summary === headline ? '' : summary, model: 'local-extractive-v2', ml: true, reason: 'on-device' }
}

export async function summarizeMessage(text: string, context: { outgoing?: boolean; sourceType?: string; sourceName?: string } = {}, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  await new Promise<void>(resolve => {
    if ('requestIdleCallback' in window) (window as any).requestIdleCallback(() => resolve(), { timeout: 80 })
    else setTimeout(resolve, 0)
  })
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return localSummary(text, context)
}

export function saveTelegramPost(item: FeedItem) { return request<{ ok: boolean }>('/api/save', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId }) }) }
export function trackSponsoredView(randomId: string) { return request<{ ok: boolean }>('/api/sponsored/view', { method: 'POST', body: JSON.stringify({ randomId }) }) }
export function trackSponsoredClick(randomId: string) { return request<{ ok: boolean }>('/api/sponsored/click', { method: 'POST', body: JSON.stringify({ randomId }) }) }
