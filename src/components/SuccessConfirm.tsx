import { useEffect, useRef } from 'react'
import { haptics } from '../lib/interaction'

export function SuccessConfirm({ onComplete }: { onComplete: () => void }) {
  const pathRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    const length = path.getTotalLength()
    path.style.strokeDasharray = `${length}`
    path.style.strokeDashoffset = `${length}`
    const frame = requestAnimationFrame(() => { path.dataset.drawn = 'true' })
    const handleEnd = (event: TransitionEvent) => {
      if (event.propertyName !== 'stroke-dashoffset') return
      haptics.success()
      window.setTimeout(onComplete, 400)
    }
    path.addEventListener('transitionend', handleEnd, { once: true })
    return () => {
      cancelAnimationFrame(frame)
      path.removeEventListener('transitionend', handleEnd)
    }
  }, [onComplete])

  return <span className="sg-success-confirm" aria-label="Saved">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path ref={pathRef} d="M4 12l6 6L20 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
}
