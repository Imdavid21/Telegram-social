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
    throw new ApiError(`Empty API response from ${url} (${res.status}).`, res.status)
  }

  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code)
  return data as T
}

export function healthStatus() {
  return request<HealthState>('/api/health')
}
export function authStatus() {
  return request<{ connected: boolean; user?: { id: string; firstName: string; username?: string } }>('/api/auth/status')
}
export function beginAuth() { return request<FlowState>('/api/auth/begin', { method: 'POST', body: '{}' }) }
export function submitAuth(value: string) { return request<FlowState>('/api/auth/input', { method: 'POST', body: JSON.stringify({ value }) }) }
export function authFlow() { return request<FlowState>('/api/auth/flow') }
export function logoutTelegram() { return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' }) }

export async function fetchFeed(cursor?: string | null, limit = 40): Promise<FeedPage> {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  params.set('limit', String(limit))
  const data = await request<RawFeedState>(`/api/feed?${params}`)
  const rawChannels = Array.isArray(data?.channels)
    ? data.channels
    : Array.isArray(data?.sources)
      ? data.sources
      : []
  const rawFeed = Array.isArray(data?.feed)
    ? data.feed
    : Array.isArray(data?.posts)
      ? data.posts
      : []

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

export function fetchFeedDiagnostics() {
  return request<FeedDiagnostics>('/api/feed/diagnostics')
}

export function fetchMediaTicket(endpoint: string, signal?: AbortSignal) {
  if (!endpoint.startsWith('/api/media/ticket/')) throw new Error('Invalid media ticket endpoint.')
  return request<{ url: string; expiresAt: number }>(endpoint, { signal })
}

function clipLocal(value: string, limit: number) {
  if (value.length <= limit) return value
  const clipped = value.slice(0, limit + 1)
  const cut = clipped.lastIndexOf(' ')
  return `${(cut > limit * 0.65 ? clipped.slice(0, cut) : clipped.slice(0, limit)).trim()}…`
}

function localExtractiveBrief(text: string, outgoing = false) {
  const cleaned = String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return { headline: 'Telegram update', summary: '', model: 'local-extractive', ml: false, reason: 'on-device' }

  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean)
  const signal = /\b(urgent|breaking|deadline|launch|release|listing|vote|proposal|security|exploit|hack|funding|partnership|today|tomorrow|now)\b/i
  const number = /\d|[$₹€£%]/
  const ranked = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: (index === 0 ? 3 : index === 1 ? 1 : 0) + (signal.test(sentence) ? 4 : 0) + (number.test(sentence) ? 2 : 0) + (sentence.length >= 35 && sentence.length <= 220 ? 1 : 0)
  })).sort((a, b) => b.score - a.score || a.index - b.index)

  const best = ranked[0]?.sentence || cleaned
  const supporting = ranked.filter(row => row.sentence !== best).slice(0, 2).sort((a, b) => a.index - b.index).map(row => row.sentence).join(' ')
  const prefix = outgoing ? 'You: ' : ''
  return {
    headline: clipLocal(`${prefix}${best.replace(/[.!?]+$/, '')}`, 96),
    summary: clipLocal(supporting, 240),
    model: 'local-extractive',
    ml: false,
    reason: 'on-device'
  }
}

export async function summarizeMessage(text: string, context: { outgoing?: boolean; sourceType?: string; sourceName?: string } = {}, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  await new Promise<void>(resolve => window.setTimeout(resolve, 0))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return localExtractiveBrief(text, Boolean(context.outgoing && context.sourceType === 'person'))
}

export function saveTelegramPost(item: FeedItem) {
  return request<{ ok: boolean }>('/api/save', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId }) })
}

export function trackSponsoredView(randomId: string) {
  return request<{ ok: boolean }>('/api/sponsored/view', { method: 'POST', body: JSON.stringify({ randomId }) })
}
export function trackSponsoredClick(randomId: string) {
  return request<{ ok: boolean }>('/api/sponsored/click', { method: 'POST', body: JSON.stringify({ randomId }) })
}
