import type { Channel, FeedDiagnostics, FeedItem, FeedPage, FeedUpdate, TelegramAccount, TelegramSearchResponse } from '../types'

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

export type CRMHistoryPage = {
  messages: FeedItem[]
  hasMore: boolean
  nextBeforeId: number | null
  total: number
}

export type CRMMutualGroup = {
  id: string
  title: string
  username?: string
  initials?: string
  type: string
  verified?: boolean
  bot?: boolean
  avatar?: string
}

export type CRMContactProfile = {
  id: string
  firstName: string
  lastName: string
  username: string
  usernames: string[]
  phone: string
  bio: string
  premium: boolean
  verified: boolean
  bot: boolean
  scam: boolean
  fake: boolean
  blocked: boolean
  commonChatsCount: number
  voiceMessagesForbidden: boolean
  phoneCallsAvailable?: boolean
  videoCallsAvailable?: boolean
  birthday?: string
  status: { label: string; lastSeenAt?: string }
  mutualGroups: CRMMutualGroup[]
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

export function healthStatus() { return request<HealthState>('/api/health') }
export function authStatus() { return request<{ connected: boolean; user?: TelegramAccount }>('/api/auth/status') }
export function fetchTelegramAccount() { return request<{ user: TelegramAccount }>('/api/account') }
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

export function fetchCRMHistory(sourceId: string, beforeId?: number | null, limit = 60, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: String(Math.min(100, Math.max(20, limit))) })
  if (beforeId) params.set('beforeId', String(beforeId))
  return request<CRMHistoryPage>(`/api/crm/history/${encodeURIComponent(sourceId)}?${params}`, { signal })
}

export function sendCRMMessage(channelId: string, text: string) {
  return request<{ ok: boolean; message: FeedItem }>('/api/crm/message', { method: 'POST', body: JSON.stringify({ channelId, text }) })
}

export function fetchCRMProfile(sourceId: string, signal?: AbortSignal) {
  return request<{ profile: CRMContactProfile }>(`/api/crm/profile/${encodeURIComponent(sourceId)}`, { signal })
}

export function fetchFeedUpdates(after: number, signal?: AbortSignal) {
  return request<{ updates: FeedUpdate[]; syncToken: number }>(`/api/feed/updates?after=${Math.max(0, Number(after || 0))}`, { signal })
}

export function fetchFeedDiagnostics() { return request<FeedDiagnostics>('/api/feed/diagnostics') }

export function searchTelegram(query: string, options: { sourceId?: string; limit?: number } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query.trim(), limit: String(Math.min(80, Math.max(1, options.limit || 50))) })
  if (options.sourceId) params.set('sourceId', options.sourceId)
  return request<TelegramSearchResponse>(`/api/search?${params}`, { signal })
}

export function fetchMediaTicket(endpoint: string, signal?: AbortSignal) {
  if (!endpoint.startsWith('/api/media/ticket/')) throw new Error('Invalid media ticket endpoint.')
  return request<{ url: string; expiresAt: number }>(endpoint, { signal })
}

export { summarizeTelegramMessage as summarizeMessage } from './telegramSummary'

function isHeartEmoji(value?: string) {
  return value === '❤' || value === '❤️' || value === '♥' || value === '♥️'
}

export type ShareTarget = { id: string; title: string; username?: string; initials?: string; accent?: string; avatar?: string }
export async function setTelegramReaction(item: FeedItem, liked: boolean) {
  const result = await request<{ ok: boolean; liked: boolean; reactions?: FeedItem['reactions']; myReaction?: string }>('/api/reaction', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId, liked }) })
  const chosenHeart = Array.isArray(result.reactions) ? result.reactions.some(reaction => Boolean(reaction?.chosen) && isHeartEmoji(reaction?.emoji)) : result.liked
  return { ...result, liked: chosenHeart }
}
export function replyToTelegramPost(item: FeedItem, text: string) { return request<{ ok: boolean; messageId?: number }>('/api/reply', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId, text }) }) }
export function fetchShareTargets() { return request<{ targets: ShareTarget[] }>('/api/share-targets') }
export function forwardTelegramPost(item: FeedItem, targetId: string) { return request<{ ok: boolean }>('/api/forward', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId, targetId }) }) }
export function saveTelegramPost(item: FeedItem) { return request<{ ok: boolean }>('/api/save', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId }) }) }
export function trackSponsoredView(randomId: string) { return request<{ ok: boolean }>('/api/sponsored/view', { method: 'POST', body: JSON.stringify({ randomId }) }) }
export function trackSponsoredClick(randomId: string) { return request<{ ok: boolean }>('/api/sponsored/click', { method: 'POST', body: JSON.stringify({ randomId }) }) }
