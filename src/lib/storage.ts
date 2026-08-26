import type { UserSettings } from '../types'

export type ViewerActionType =
  | 'impression'
  | 'dwell'
  | 'save'
  | 'unsave'
  | 'open'
  | 'skip'
  | 'favorite_source'
  | 'unfavorite_source'
  | 'more_like_this'
  | 'less_like_this'
  | 'hide_post'
  | 'hide_source'

export type ViewerAction = {
  type: ViewerActionType
  itemId: string
  channelId: string
  timestamp: number
  value?: number
  media?: boolean
}

export const STORAGE_KEYS = {
  settings: 'supergram.settings',
  saved: 'telegram.social.saved',
  read: 'telegram.social.read',
  favorites: 'supergram.favorites',
  hiddenSources: 'supergram.hidden-sources',
  hiddenPosts: 'supergram.hidden-posts',
  viewerActions: 'telegram.social.viewer-actions'
} as const

const ACTION_CAP = 1200

export const DEFAULT_SETTINGS: UserSettings = {
  feedMode: 'for-you',
  themeMode: 'system',
  includePrivateChatsInForYou: true,
  summarizePrivateChats: false,
  autoplay: 'on'
}

function loadStringSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveStringSet(key: string, value: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...value])) } catch {}
}

export function loadSet(key: 'saved' | 'read'): Set<string> {
  return loadStringSet(STORAGE_KEYS[key])
}

export function saveSet(key: 'saved' | 'read', value: Set<string>) {
  saveStringSet(STORAGE_KEYS[key], value)
}

export function loadFavorites() {
  return loadStringSet(STORAGE_KEYS.favorites)
}

export function saveFavorites(value: Set<string>) {
  saveStringSet(STORAGE_KEYS.favorites, value)
}

export function loadHiddenSources() {
  return loadStringSet(STORAGE_KEYS.hiddenSources)
}

export function saveHiddenSources(value: Set<string>) {
  saveStringSet(STORAGE_KEYS.hiddenSources, value)
}

export function loadHiddenPosts() {
  return loadStringSet(STORAGE_KEYS.hiddenPosts)
}

export function saveHiddenPosts(value: Set<string>) {
  saveStringSet(STORAGE_KEYS.hiddenPosts, value)
}

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<UserSettings>
    return {
      feedMode: parsed.feedMode === 'latest' ? 'latest' : 'for-you',
      themeMode: parsed.themeMode === 'light' || parsed.themeMode === 'dark' ? parsed.themeMode : 'system',
      includePrivateChatsInForYou: parsed.includePrivateChatsInForYou !== false,
      summarizePrivateChats: parsed.summarizePrivateChats === true,
      autoplay: parsed.autoplay === 'off' ? 'off' : 'on'
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(value: UserSettings) {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent('supergram:settings-changed', { detail: value }))
  } catch {}
}

export function loadViewerActions(): ViewerAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.viewerActions)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(row => row && typeof row === 'object' && typeof row.type === 'string' && typeof row.itemId === 'string' && typeof row.channelId === 'string' && Number.isFinite(Number(row.timestamp)))
      .slice(-ACTION_CAP)
  } catch {
    return []
  }
}

export function recordViewerAction(action: ViewerAction) {
  try {
    const actions = loadViewerActions()
    const next = [...actions, { ...action, timestamp: Number(action.timestamp || Date.now()) }].slice(-ACTION_CAP)
    localStorage.setItem(STORAGE_KEYS.viewerActions, JSON.stringify(next))
  } catch {}
}

export function resetViewerPersonalization() {
  try { localStorage.removeItem(STORAGE_KEYS.viewerActions) } catch {}
}
