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

export const haptics = {
  light() { webApp()?.HapticFeedback?.impactOccurred?.('light') ?? vibration(8) },
  medium() { webApp()?.HapticFeedback?.impactOccurred?.('medium') ?? vibration(12) },
  heavy() { webApp()?.HapticFeedback?.impactOccurred?.('heavy') ?? vibration(18) },
  success() { webApp()?.HapticFeedback?.notificationOccurred?.('success') ?? vibration(16) },
  error() { webApp()?.HapticFeedback?.notificationOccurred?.('error') ?? vibration(24) },
  selection() { webApp()?.HapticFeedback?.selectionChanged?.() ?? vibration(6) }
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
