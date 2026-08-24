import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type FlipRect = { top: number; left: number; width: number; height: number }

export function MediaLightbox({ src, sourceRect, onClose }: {
  src: string
  sourceRect: FlipRect
  onClose: () => void
}) {
  const mediaRef = useRef<HTMLImageElement>(null)
  const [active, setActive] = useState(false)

  useLayoutEffect(() => {
    const node = mediaRef.current
    if (!node) return
    node.style.left = `${sourceRect.left}px`
    node.style.top = `${sourceRect.top}px`
    node.style.width = `${sourceRect.width}px`
    node.style.height = `${sourceRect.height}px`
    node.getBoundingClientRect()
    const frame = requestAnimationFrame(() => setActive(true))
    return () => cancelAnimationFrame(frame)
  }, [sourceRect])

  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  function close() {
    setActive(false)
    window.setTimeout(onClose, 320)
  }

  return createPortal(<div className={`sg-lightbox ${active ? 'is-active' : ''}`} role="dialog" aria-modal="true" aria-label="Media preview">
    <button type="button" className="sg-lightbox-backdrop" aria-label="Close media preview" onClick={close} />
    <img ref={mediaRef} className="sg-lightbox-media" src={src} alt="Telegram media preview" />
    <button type="button" className="sg-lightbox-close pressable" onClick={close} aria-label="Close">×</button>
  </div>, document.body)
}
