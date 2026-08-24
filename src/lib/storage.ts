export function loadSet(key: 'saved' | 'read'): Set<string> {
  try {
    const raw = localStorage.getItem(`telegram.social.${key}`)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

export function saveSet(key: 'saved' | 'read', value: Set<string>) {
  localStorage.setItem(`telegram.social.${key}`, JSON.stringify([...value]))
}
