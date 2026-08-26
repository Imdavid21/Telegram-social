import { IconButton, Modal } from '@mui/material'
import { useLayoutEffect, useRef, useState } from 'react'
import { CloseIcon } from './Icons'

export type FlipRect = { top: number; left: number; width: number; height: number }

export function MediaLightbox({ src, sourceRect, alt = 'Image preview', onClose }: {
  src: string
  sourceRect: FlipRect
  alt?: string
  onClose: () => void
}) {
  const mediaRef = useRef<HTMLImageElement>(null)
  const [active, setActive] = useState(false)

  useLayoutEffect(() => {
    const node = mediaRef.current
    if (!node) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (reduceMotion) {
      setActive(true)
      return
    }
    node.style.left = `${sourceRect.left}px`
    node.style.top = `${sourceRect.top}px`
    node.style.width = `${sourceRect.width}px`
    node.style.height = `${sourceRect.height}px`
    node.getBoundingClientRect()
    const frame = requestAnimationFrame(() => setActive(true))
    return () => cancelAnimationFrame(frame)
  }, [sourceRect])

  function close() {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (reduceMotion) {
      onClose()
      return
    }
    setActive(false)
    window.setTimeout(onClose, 240)
  }

  return <Modal
    open
    hideBackdrop
    onClose={(_, reason) => { if (reason === 'escapeKeyDown' || reason === 'backdropClick') close() }}
    aria-label="Media preview"
  >
    <div className={`sg-lightbox ${active ? 'is-active' : ''}`} role="dialog" aria-modal="true" aria-label="Media preview">
      <button type="button" className="sg-lightbox-backdrop" aria-label="Close media preview" onClick={close} />
      <img ref={mediaRef} className="sg-lightbox-media" src={src} alt={alt} />
      <IconButton autoFocus type="button" className="sg-lightbox-close pressable" onClick={close} aria-label="Close media preview"><CloseIcon /></IconButton>
    </div>
  </Modal>
}
