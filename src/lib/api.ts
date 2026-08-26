import type { Channel, FeedDiagnostics, FeedItem, FeedPage, FeedUpdate, TelegramAccount } from '../types'

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
  return request<{ connected: boolean; user?: TelegramAccount }>('/api/auth/status')
}
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
const SUMMARY_STOP = new Set('the a an and or but if then than to of in on at for from by with as is are was were be been being this that these those it its they their them we our you your i my me will would can could should may might do does did have has had not no yes into over under after before about around through up down out just very more most less new latest final notice important urgent breaking update'.split(/\s+/))
function cleanSummaryText(value: string) { return String(value || '').replace(/https?:\/\/\S+/g, ' ').replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, ' ').replace(/[•▪◦]+/g, ' ').replace(/\s+/g, ' ').trim() }
function summaryTokens(value: string) { return cleanSummaryText(value).toLowerCase().match(/[$@#]?[a-z0-9][a-z0-9._-]*/g)?.filter(token => token.length > 2 && !SUMMARY_STOP.has(token)) || [] }
function tokenOverlap(a: string, b: string) { const left = new Set(summaryTokens(a)); const right = new Set(summaryTokens(b)); if (!left.size || !right.size) return 0; let common = 0; for (const token of left) if (right.has(token)) common += 1; return common / Math.max(1, Math.min(left.size, right.size)) }
function contextSubject(previousMessages: string[], sourceName = '') { for (const value of [...previousMessages].reverse()) { const cleaned = cleanSummaryText(value); const cash = cleaned.match(/\$[A-Z0-9]{2,12}(?:\s+V\d+)?/); if (cash) return cash[0]; const proper = cleaned.match(/\b[A-Z][A-Za-z0-9.-]{2,}(?:\s+[A-Z][A-Za-z0-9.-]{2,}){0,2}\b/); if (proper && !/^(Final|Important|Urgent|Breaking|Update)$/i.test(proper[0])) return proper[0] } return sourceName || '' }
function normalizeHeadline(value: string, fallbackSubject = '') { let text = cleanSummaryText(value).replace(/^(final\s+notice|important|urgent|breaking|update|announcement)\s*[:\-–—]*\s*/i, '').replace(/^[\W_]+/, '').replace(/[.!?]+$/, '').trim(); if (/^(it|this|that|they|we)\b/i.test(text) && fallbackSubject) text = `${fallbackSubject}: ${text}`; if (text && text === text.toUpperCase() && /[A-Z]/.test(text)) { text = text.toLowerCase().replace(/^./, c => c.toUpperCase()); text = text.replace(/\$[a-z0-9]+/g, m => m.toUpperCase()) } return clipLocal(text || fallbackSubject || 'Telegram update', 102) }
export function buildContextualBrief(text: string, context: { previousMessages?: string[]; sourceName?: string; outgoing?: boolean; sourceType?: string } = {}) {
  const cleaned = cleanSummaryText(text)
  const previousMessages = (context.previousMessages || []).map(cleanSummaryText).filter(Boolean).slice(-5)
  if (!cleaned) return { headline: 'Telegram update', summary: '', model: 'local-context-v2', ml: false, reason: 'on-device-context', contextUsed: previousMessages.length }
  const contextTokens = new Set(summaryTokens(previousMessages.join(' ')))
  const sentences = cleaned.split(/(?<=[.!?])\s+|\n+/).map(row => row.trim()).filter(Boolean)
  const signal = /\b(launch|launched|live|release|released|listing|listed|deadline|vote|proposal|approved|rejected|security|exploit|hack|funding|raised|partnership|acquired|migration|migrate|airdrop|snapshot|claim|opens|closes|starts|ends|today|tomorrow|now)\b/i
  const number = /\d|[$₹€£%]/; const action = /\b(must|should|need|needs|requires|required|available|live|open|closed|confirmed|delayed|cancelled|added|removed|changed|increased|decreased)\b/i
  const ranked = sentences.map((sentence, index) => { const toks = summaryTokens(sentence); const novel = toks.length ? toks.filter(token => !contextTokens.has(token)).length / toks.length : 0; const repeated = previousMessages.reduce((max, prior) => Math.max(max, tokenOverlap(sentence, prior)), 0); return { sentence, index, novel, repeated, score: novel * 5 + (signal.test(sentence) ? 3 : 0) + (number.test(sentence) ? 1.8 : 0) + (action.test(sentence) ? 1.5 : 0) + (index == 0 ? .7 : 0) - repeated * 3 } }).sort((x, y) => y.score - x.score || x.index - y.index)
  const best = ranked[0] || { sentence: cleaned, repeated: 0, novel: 1, index: 0, score: 0 }
  const subject = contextSubject(previousMessages, context.sourceName || '')
  let headline = normalizeHeadline(best.sentence, subject)
  const migration = cleaned.match(/(\$[A-Z0-9]{2,12}(?:\s+V\d+)?)?[^.!?]{0,45}\bmigration\b[^.!?]{0,55}\blive\b/i)
  if (migration) { const token = migration[1] || subject; const holderAction = /\bholders?\b[^.!?]{0,70}\bmigrat(?:e|ion)\b/i.test(cleaned); headline = clipLocal(`${token ? `${token} ` : ''}migration is live${holderAction ? '; holders are told to migrate' : ''}`.trim(), 102) }
  const support = ranked.filter(row => row.sentence !== best.sentence && row.novel >= .3 && row.repeated < .8).slice(0, 2).sort((x, y) => x.index - y.index).map(row => row.sentence).join(' ')
  const maxRepeat = previousMessages.reduce((max, prior) => Math.max(max, tokenOverlap(cleaned, prior)), 0)
  let summary = clipLocal(support || sentences.filter(sentence => sentence !== best.sentence).slice(0, 2).join(' '), 220)
  if (maxRepeat >= .72 && summary) summary = `Follow-up to an earlier message. ${summary}`
  else if (maxRepeat >= .72) summary = 'This largely repeats an earlier message from the same source.'
  const prefix = context.outgoing && context.sourceType === 'person' ? 'You: ' : ''
  return { headline: `${prefix}${headline}`, summary, model: 'local-context-v2', ml: false, reason: previousMessages.length ? 'on-device-context' : 'on-device', contextUsed: previousMessages.length }
}
export async function summarizeMessage(text: string, context: { outgoing?: boolean; sourceType?: string; sourceName?: string; previousMessages?: string[] } = {}, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  await new Promise<void>(resolve => window.setTimeout(resolve, 0))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return buildContextualBrief(text, context)
}

export type ShareTarget = { id: string; title: string; username?: string; initials?: string; accent?: string; avatar?: string }
export function setTelegramReaction(item: FeedItem, liked: boolean) { return request<{ ok: boolean; liked: boolean }>('/api/reaction', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId, liked }) }) }
export function replyToTelegramPost(item: FeedItem, text: string) { return request<{ ok: boolean; messageId?: number }>('/api/reply', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId, text }) }) }
export function fetchShareTargets() { return request<{ targets: ShareTarget[] }>('/api/share-targets') }
export function forwardTelegramPost(item: FeedItem, targetId: string) { return request<{ ok: boolean }>('/api/forward', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId, targetId }) }) }

export function saveTelegramPost(item: FeedItem) {
  return request<{ ok: boolean }>('/api/save', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId }) })
}

export function trackSponsoredView(randomId: string) {
  return request<{ ok: boolean }>('/api/sponsored/view', { method: 'POST', body: JSON.stringify({ randomId }) })
}
export function trackSponsoredClick(randomId: string) {
  return request<{ ok: boolean }>('/api/sponsored/click', { method: 'POST', body: JSON.stringify({ randomId }) })
}
