import { useEffect, type ReactNode } from 'react'

type AnchorState = { postId: string; offset: number }
const memory = new Map<string, AnchorState>()
const STORAGE_KEY = 'supergram-scroll-anchors-v1'

function keyForButton(button: HTMLButtonElement | null) {
  if (!button) return null
  const label = String(button.getAttribute('aria-label') || button.textContent || '').trim().toLowerCase()
  if (label.includes('unread')) return 'unread'
  if (label.includes('media')) return 'media'
  if (label.includes('saved')) return 'saved'
  if (label.includes('home')) return 'all'
  return null
}

function activeKey() {
  const active = document.querySelector<HTMLButtonElement>('.sg-primary-nav button.is-active, .sg-mobile-nav button.is-active')
  return keyForButton(active) || 'all'
}

function nearestAnchor(): AnchorState | null {
  const rows = [...document.querySelectorAll<HTMLElement>('.sg-virtual-row[data-post-id]')]
  if (!rows.length) return null
  const target = rows.find(row => row.getBoundingClientRect().bottom > 0) || rows[0]
  const postId = target.dataset.postId
  if (!postId) return null
  return { postId, offset: target.getBoundingClientRect().top }
}

function persist() {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(memory))) } catch {}
}

function hydrate() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, AnchorState>
    for (const [key, value] of Object.entries(parsed)) if (value?.postId) memory.set(key, value)
  } catch {}
}

function capture(key: string) {
  const anchor = nearestAnchor()
  if (!anchor) return
  memory.set(key, anchor)
  persist()
}

function restore(key: string) {
  const state = memory.get(key)
  if (!state) return
  const attempt = (remaining: number) => {
    const row = document.querySelector<HTMLElement>(`.sg-virtual-row[data-post-id="${CSS.escape(state.postId)}"]`)
    if (row) {
      const delta = row.getBoundingClientRect().top - state.offset
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior })
      return
    }
    if (remaining > 0) window.setTimeout(() => attempt(remaining - 1), 32)
  }
  requestAnimationFrame(() => requestAnimationFrame(() => attempt(4)))
}

export function ScrollAnchorBridge({ children }: { children: ReactNode }) {
  useEffect(() => {
    hydrate()
    const pointerDown = (event: PointerEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.sg-primary-nav button, .sg-mobile-nav button')
      if (!keyForButton(button)) return
      capture(activeKey())
    }
    const click = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.sg-primary-nav button, .sg-mobile-nav button')
      const key = keyForButton(button)
      if (key) restore(key)
    }
    const pageHide = () => capture(activeKey())
    document.addEventListener('pointerdown', pointerDown, true)
    document.addEventListener('click', click, true)
    window.addEventListener('pagehide', pageHide)
    return () => {
      document.removeEventListener('pointerdown', pointerDown, true)
      document.removeEventListener('click', click, true)
      window.removeEventListener('pagehide', pageHide)
    }
  }, [])

  return children
}
