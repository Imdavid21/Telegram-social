import type { Channel, FeedItem } from '../types'

type FlowState = { step: 'starting'|'processing'|'phone'|'code'|'password'|'done'|'error'; error?: string | null; meta?: Record<string, unknown> }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      ...init
    })
  } catch {
    throw new Error('Telegram API server is unavailable on this deployment.')
  }

  const contentType = res.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  if (!data) throw new Error('Telegram API server is unavailable on this deployment.')
  return data as T
}

export function healthStatus() {
  return request<{ ok: boolean; configured: boolean }>('/api/health')
}
export function authStatus() {
  return request<{ connected: boolean; user?: { id: string; firstName: string; username?: string } }>('/api/auth/status')
}
export function beginAuth() { return request<FlowState>('/api/auth/begin', { method: 'POST', body: '{}' }) }
export function submitAuth(value: string) { return request<FlowState>('/api/auth/input', { method: 'POST', body: JSON.stringify({ value }) }) }
export function authFlow() { return request<FlowState>('/api/auth/flow') }
export function logoutTelegram() { return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' }) }
export function fetchFeed() { return request<{ channels: Channel[]; feed: FeedItem[] }>('/api/feed') }
export function saveTelegramPost(item: FeedItem) { return request<{ ok: boolean }>('/api/save', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId }) }) }

export function trackSponsoredView(randomId: string) { return request<{ ok: boolean }>('/api/sponsored/view', { method: 'POST', body: JSON.stringify({ randomId }) }) }
export function trackSponsoredClick(randomId: string) { return request<{ ok: boolean }>('/api/sponsored/click', { method: 'POST', body: JSON.stringify({ randomId }) }) }
