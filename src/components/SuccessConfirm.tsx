import { useEffect } from 'react'
import { motion,useReducedMotion } from 'motion/react'
import { haptics } from '../lib/interaction'
import { motionTheme } from '../lib/motionTheme'

export function SuccessConfirm({ onComplete }: { onComplete: () => void }) {
  const reduced=useReducedMotion()
  useEffect(()=>{haptics.success();const timer=window.setTimeout(onComplete,reduced?250:850);return()=>window.clearTimeout(timer)},[onComplete,reduced])
  return <motion.span className="sg-success-confirm" aria-label="Saved" initial={reduced?false:{opacity:0,scale:.8}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.9}} transition={reduced?{duration:0}:motionTheme.transition.snap}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><motion.path d="M4 12l6 6L20 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={reduced?false:{pathLength:0,opacity:0}} animate={{pathLength:1,opacity:1}} transition={reduced?{duration:0}:{duration:.38,ease:[.2,.8,.2,1]}}/></svg>
  </motion.span>
}