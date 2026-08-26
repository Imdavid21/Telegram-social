export type ViewerActionType = 'impression' | 'dwell' | 'save' | 'unsave' | 'open' | 'skip'

export type ViewerAction = {
  type: ViewerActionType
  itemId: string
  channelId: string
  timestamp: number
  value?: number
  media?: boolean
}

const ACTIONS_KEY = 'telegram.social.viewer-actions'
const ACTION_CAP = 1200

export function loadSet(key: 'saved' | 'read'): Set<string> {
  try {
    const raw = localStorage.getItem(`telegram.social.${key}`)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

export function saveSet(key: 'saved' | 'read', value: Set<string>) {
  localStorage.setItem(`telegram.social.${key}`, JSON.stringify([...value]))
}

export function loadViewerActions(): ViewerAction[] {
  try {
    const raw = localStorage.getItem(ACTIONS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(row => row && typeof row === 'object' && typeof row.type === 'string' && typeof row.itemId === 'string' && typeof row.channelId === 'string' && Number.isFinite(Number(row.timestamp))).slice(-ACTION_CAP)
  } catch { return [] }
}

export function recordViewerAction(action: ViewerAction) {
  try {
    const actions = loadViewerActions()
    const next = [...actions, { ...action, timestamp: Number(action.timestamp || Date.now()) }].slice(-ACTION_CAP)
    localStorage.setItem(ACTIONS_KEY, JSON.stringify(next))
  } catch {}
}
