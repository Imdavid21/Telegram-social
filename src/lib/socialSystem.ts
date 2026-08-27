import type { ActivityItem, Audience, PostDraft, SavedCollection, SocialIdentity } from '../types'

const PREFIX = 'supergram:social:'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value))
}

export function loadCloseFriends() { return new Set(read<string[]>('close-friends', [])) }
export function saveCloseFriends(ids: Set<string>) { write('close-friends', [...ids]) }
export function loadBlocked() { return new Set(read<string[]>('blocked', [])) }
export function saveBlocked(ids: Set<string>) { write('blocked', [...ids]) }
export function loadMuted() { return new Set(read<string[]>('muted', [])) }
export function saveMuted(ids: Set<string>) { write('muted', [...ids]) }

export function loadActivities(): ActivityItem[] {
  return read<ActivityItem[]>('activity', []).sort((a, b) => b.createdAt - a.createdAt)
}
export function saveActivities(items: ActivityItem[]) { write('activity', items.slice(0, 500)) }
export function markActivityRead(id: string) {
  saveActivities(loadActivities().map(item => item.id === id ? { ...item, read: true } : item))
}

export function loadCollections(): SavedCollection[] { return read<SavedCollection[]>('collections', []) }
export function saveCollections(items: SavedCollection[]) { write('collections', items) }
export function addToCollection(collectionId: string, itemId: string) {
  const now = Date.now()
  saveCollections(loadCollections().map(collection => collection.id === collectionId
    ? { ...collection, itemIds: [...new Set([...collection.itemIds, itemId])], updatedAt: now }
    : collection))
}

export function createCollection(name: string): SavedCollection {
  const collection = { id: crypto.randomUUID(), name: name.trim(), itemIds: [], updatedAt: Date.now() }
  saveCollections([collection, ...loadCollections()])
  return collection
}

export function loadDrafts(): PostDraft[] { return read<PostDraft[]>('drafts', []) }
export function saveDraft(draft: Omit<PostDraft, 'updatedAt'>) {
  const drafts = loadDrafts().filter(item => item.id !== draft.id)
  write('drafts', [{ ...draft, updatedAt: Date.now() }, ...drafts])
}
export function deleteDraft(id: string) { write('drafts', loadDrafts().filter(item => item.id !== id)) }

export function createEmptyDraft(audience: Audience = 'everyone'): PostDraft {
  return { id: crypto.randomUUID(), text: '', audience, media: [], updatedAt: Date.now() }
}

export function relationshipContext(identity: SocialIdentity) {
  const blocked = loadBlocked().has(identity.id)
  const muted = loadMuted().has(identity.id)
  const closeFriend = loadCloseFriends().has(identity.id)
  return { blocked, muted, closeFriend }
}

export function canSurfaceIdentity(identity: SocialIdentity) {
  return !loadBlocked().has(identity.id)
}

export function canonicalSocialRoute(type: string, id: string) {
  const safe = encodeURIComponent(id)
  if (type === 'person') return `/@${safe}`
  if (type === 'post') return `/post/${safe}`
  if (type === 'channel') return `/channel/${safe}`
  if (type === 'community') return `/community/${safe}`
  if (type === 'event') return `/event/${safe}`
  return `/${encodeURIComponent(type)}/${safe}`
}