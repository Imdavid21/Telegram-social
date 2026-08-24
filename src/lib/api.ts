import type { Channel, FeedItem } from '../types'

type FlowState = { step: 'starting'|'processing'|'phone'|'code'|'password'|'done'|'error'; error?: string | null; meta?: Record<string, unknown> }

type HealthState = { ok: boolean; configured: boolean; runtime?: string; version?: string }
type RawFeedState = {
  channels?: unknown
  feed?: unknown
  sources?: unknown
  posts?: unknown
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
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

export async function fetchFeed(): Promise<{ channels: Channel[]; feed: FeedItem[] }> {
  const data = await request<RawFeedState>('/api/feed')

  // Accept both the current response shape and the earlier internal naming so
  // a frontend/backend deployment race can never turn state into undefined.
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
    feed: rawFeed.filter((row): row is FeedItem => Boolean(row && typeof row === 'object'))
  }
}

export function saveTelegramPost(item: FeedItem) { return request<{ ok: boolean }>('/api/save', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId }) }) }

export function trackSponsoredView(randomId: string) { return request<{ ok: boolean }>('/api/sponsored/view', { method: 'POST', body: JSON.stringify({ randomId }) }) }
export function trackSponsoredClick(randomId: string) { return request<{ ok: boolean }>('/api/sponsored/click', { method: 'POST', body: JSON.stringify({ randomId }) }) }
