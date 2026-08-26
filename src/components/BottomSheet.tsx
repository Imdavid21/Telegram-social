import { IconButton, Modal } from '@mui/material'
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { haptics } from '../lib/interaction'
import { CloseIcon } from './Icons'

const SNAP_RATIOS = [.2, .55, .9]
const VELOCITY_THRESHOLD = .5

function viewportHeight() {
  return window.visualViewport?.height || window.innerHeight
}

function rubberBand(overscroll: number, dimension: number, coefficient = .55) {
  return (1 - 1 / (Math.abs(overscroll) * coefficient / dimension + 1)) * dimension * Math.sign(overscroll)
}

function nearest(value: number, values: number[]) {
  return values.reduce((closest, candidate) => Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest)
}

export function BottomSheet({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const [height, setHeight] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startRef = useRef({ y: 0, height: 0, time: 0 })
  const samples = useRef<Array<{ y: number; time: number }>>([])
  const crossedRef = useRef(false)
  const titleId = useId()
  const snaps = useMemo(() => SNAP_RATIOS.map(ratio => Math.round(viewportHeight() * ratio)), [open])

  useEffect(() => {
    if (!open) return
    setHeight(snaps[1] || Math.round(viewportHeight() * .55))
    document.body.classList.add('sg-sheet-open')
    return () => document.body.classList.remove('sg-sheet-open')
  }, [open, snaps])

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const now = performance.now()
    startRef.current = { y: event.clientY, height, time: now }
    samples.current = [{ y: event.clientY, time: now }]
    crossedRef.current = false
    setDragging(true)
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const now = performance.now()
    samples.current.push({ y: event.clientY, time: now })
    samples.current = samples.current.filter(sample => now - sample.time <= 100)
    const raw = startRef.current.height - (event.clientY - startRef.current.y)
    const min = snaps[0]
    const max = snaps[snaps.length - 1]
    let next = raw
    if (raw < min) next = min + rubberBand(raw - min, min)
    if (raw > max) next = max + rubberBand(raw - max, viewportHeight() - max)
    setHeight(Math.max(0, next))

    const progress = Math.min(1, Math.abs(next - startRef.current.height) / Math.max(1, viewportHeight() * .18))
    if (progress >= 1 && !crossedRef.current) {
      crossedRef.current = true
      haptics.light()
    }
  }

  function pointerUp() {
    if (!dragging) return
    setDragging(false)
    const list = samples.current
    const first = list[0]
    const last = list[list.length - 1]
    const fingerVelocity = first && last && last.time > first.time ? (last.y - first.y) / (last.time - first.time) : 0
    const heightVelocity = -fingerVelocity
    const min = snaps[0]

    if (height < min * .85 && fingerVelocity > 0) {
      onClose()
      return
    }

    let target = nearest(height, snaps)
    if (Math.abs(heightVelocity) > VELOCITY_THRESHOLD) {
      const ordered = [...snaps].sort((a, b) => a - b)
      const current = ordered.findIndex(value => value >= height)
      const index = Math.max(0, current < 0 ? ordered.length - 1 : current)
      const nextIndex = heightVelocity > 0 ? Math.min(ordered.length - 1, index + 1) : Math.max(0, index - 1)
      target = ordered[nextIndex]
    }
    setHeight(target)
    haptics.selection()
  }

  return <Modal
    open={open}
    onClose={(_, reason) => { if (reason === 'escapeKeyDown' || reason === 'backdropClick') onClose() }}
    aria-labelledby={titleId}
    closeAfterTransition={false}
  >
    <div className="sg-sheet-layer" role="presentation">
      <button className="sg-sheet-scrim" type="button" aria-label="Close" onClick={onClose} />
      <section className={`sg-bottom-sheet ${dragging ? 'is-dragging' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ height }}>
        <div className="sg-sheet-drag" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
          <span className="sg-sheet-handle" aria-hidden="true" />
          <strong id={titleId}>{title}</strong>
          <IconButton
            type="button"
            className="sg-sheet-close"
            aria-label={`Close ${title}`}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => { event.stopPropagation(); onClose() }}
          ><CloseIcon /></IconButton>
        </div>
        <div className="sg-sheet-content">{children}</div>
      </section>
    </div>
  </Modal>
}
