import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence,motion,useReducedMotion } from 'motion/react'
import { motionTheme } from '../lib/motionTheme'
import { CloseIcon } from './Icons'
export type FlipRect={top:number;left:number;width:number;height:number}
export function MediaLightbox({src,sourceRect,alt='Image preview',onClose}:{src:string;sourceRect:FlipRect;alt?:string;onClose:()=>void}){
 const reduced=useReducedMotion()
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[onClose])
 if(typeof document==='undefined')return null
 const initial=reduced?false:{position:'fixed' as const,top:sourceRect.top,left:sourceRect.left,width:sourceRect.width,height:sourceRect.height,opacity:.92,borderRadius:12}
 return createPortal(<AnimatePresence initial={false}><motion.div className="sg-lightbox is-active" role="dialog" aria-modal="true" aria-label="Media preview" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={reduced?{duration:0}:motionTheme.transition.ui}><motion.button type="button" className="sg-lightbox-backdrop" aria-label="Close media preview" onClick={onClose} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}/><motion.img className="sg-lightbox-media" src={src} alt={alt} initial={initial} animate={{position:'fixed',top:'50%',left:'50%',x:'-50%',y:'-50%',width:'auto',height:'auto',maxWidth:'94vw',maxHeight:'92vh',opacity:1,borderRadius:0}} exit={reduced?{opacity:0}:{opacity:0,scale:.98}} transition={reduced?{duration:0}:motionTheme.transition.gentle}/><motion.button autoFocus type="button" className="sg-lightbox-close pressable" onClick={onClose} aria-label="Close media preview" initial={reduced?false:{opacity:0,scale:.9}} animate={{opacity:1,scale:1}} whileTap={reduced?undefined:{scale:.9}} transition={motionTheme.transition.snap}><CloseIcon/></motion.button></motion.div></AnimatePresence>,document.body)
}