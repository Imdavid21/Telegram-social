type TelegramWebApp = {
  viewportHeight?: number
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy') => void
    notificationOccurred?: (type: 'success' | 'error' | 'warning') => void
    selectionChanged?: () => void
  }
  onEvent?: (event: string, callback: () => void) => void
}

declare global {
  interface Window { Telegram?: { WebApp?: TelegramWebApp } }
}

function webApp() { return window.Telegram?.WebApp }

function vibration(ms: number) {
  try { navigator.vibrate?.(ms) } catch {}
}

function impact(style: 'light' | 'medium' | 'heavy', fallbackMs: number) {
  const fn = webApp()?.HapticFeedback?.impactOccurred
  if (fn) fn(style)
  else vibration(fallbackMs)
}

function notification(type: 'success' | 'error' | 'warning', fallbackMs: number) {
  const fn = webApp()?.HapticFeedback?.notificationOccurred
  if (fn) fn(type)
  else vibration(fallbackMs)
}

export const haptics = {
  light() { impact('light', 8) },
  medium() { impact('medium', 12) },
  heavy() { impact('heavy', 18) },
  success() { notification('success', 16) },
  error() { notification('error', 24) },
  selection() {
    const fn = webApp()?.HapticFeedback?.selectionChanged
    if (fn) fn()
    else vibration(6)
  }
}

export function initInteractionEnvironment() {
  const root = document.documentElement
  const updateViewport = () => {
    const tgHeight = Number(webApp()?.viewportHeight || 0)
    const height = tgHeight || window.visualViewport?.height || window.innerHeight
    root.style.setProperty('--tg-viewport-height', `${Math.round(height)}px`)
  }
  updateViewport()
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.addEventListener('resize', updateViewport)
  webApp()?.onEvent?.('viewportChanged', updateViewport)
  return () => {
    window.visualViewport?.removeEventListener('resize', updateViewport)
    window.removeEventListener('resize', updateViewport)
  }
}
