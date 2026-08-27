import { AnimatePresence, LayoutGroup, MotionConfig, domAnimation, LazyMotion, motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { useState, type MouseEvent, type ReactNode } from 'react'
import { motionTheme } from '../../lib/motionTheme'

export function MotionProvider({children}:{children:ReactNode}){
 return <LazyMotion features={domAnimation} strict><MotionConfig reducedMotion="user" transition={motionTheme.transition.ui}>{children}</MotionConfig></LazyMotion>
}

export function MotionSurface({children,className,...props}:{children:ReactNode;className?:string}&HTMLMotionProps<'div'>){
 const reduced=useReducedMotion()
 return <motion.div className={className} initial={reduced?false:{opacity:0,y:motionTheme.travel.enter,scale:.99}} animate={{opacity:1,y:0,scale:1}} transition={reduced?{duration:0}:motionTheme.transition.ui} {...props}>{children}</motion.div>
}

export function Pressable({children,className,...props}:{children:ReactNode;className?:string}&HTMLMotionProps<'button'>){
 const reduced=useReducedMotion()
 return <motion.button className={className} whileHover={reduced?undefined:{y:-motionTheme.travel.hover}} whileTap={reduced?undefined:{scale:.975}} transition={motionTheme.transition.snap} {...props}>{children}</motion.button>
}

export function IconPressable({children,className,...props}:{children:ReactNode;className?:string}&HTMLMotionProps<'button'>){
 const reduced=useReducedMotion()
 return <motion.button className={className} whileHover={reduced?undefined:{scale:1.04}} whileTap={reduced?undefined:{scale:.9}} transition={motionTheme.transition.snap} {...props}>{children}</motion.button>
}

export function LayoutHighlight({id,className}:{id:string;className?:string}){
 const reduced=useReducedMotion()
 return <motion.span layoutId={reduced?undefined:id} className={className} transition={motionTheme.transition.ui} aria-hidden="true"/>
}

export function AnimatedTabs<T extends string>({items,value,onChange,className=''}:{items:Array<{value:T;label:string}>;value:T;onChange:(value:T)=>void;className?:string}){
 return <LayoutGroup id="sg-tabs"><div className={`sg-motion-tabs ${className}`} role="tablist">{items.map(item=><button type="button" role="tab" aria-selected={value===item.value} key={item.value} className={value===item.value?'is-active':''} onClick={()=>onChange(item.value)}>{value===item.value&&<LayoutHighlight id="sg-tab-active" className="sg-motion-tab-highlight"/>}<span>{item.label}</span></button>)}</div></LayoutGroup>
}

export function Presence({show,children,className}:{show:boolean;children:ReactNode;className?:string}){
 const reduced=useReducedMotion()
 return <AnimatePresence initial={false}>{show&&<motion.div className={className} initial={reduced?false:{opacity:0,y:10,scale:.985}} animate={{opacity:1,y:0,scale:1}} exit={reduced?{opacity:0}:{opacity:0,y:-6,scale:.99}} transition={reduced?{duration:.01}:motionTheme.transition.ui}>{children}</motion.div>}</AnimatePresence>
}

export function ExpandCollapse({open,children,className}:{open:boolean;children:ReactNode;className?:string}){
 const reduced=useReducedMotion()
 return <AnimatePresence initial={false}>{open&&<motion.div className={className} initial={reduced?false:{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={reduced?{opacity:0}:{height:0,opacity:0}} transition={reduced?{duration:0}:motionTheme.transition.ui} style={{overflow:'hidden'}}>{children}</motion.div>}</AnimatePresence>
}

export function Ripple({children,className,onMouseDown,...props}:{children:ReactNode;className?:string}&HTMLMotionProps<'button'>){
 const reduced=useReducedMotion();const[ripples,setRipples]=useState<Array<{id:number;x:number;y:number;size:number}>>([])
 function down(e:MouseEvent<HTMLButtonElement>){onMouseDown?.(e);if(e.defaultPrevented||reduced)return;const rect=e.currentTarget.getBoundingClientRect();const size=Math.max(rect.width,rect.height)*2;const ripple={id:Date.now()+Math.random(),x:e.clientX-rect.left-size/2,y:e.clientY-rect.top-size/2,size};setRipples(rows=>[...rows.slice(-2),ripple]);window.setTimeout(()=>setRipples(rows=>rows.filter(row=>row.id!==ripple.id)),520)}
 return <motion.button className={`sg-motion-ripple ${className||''}`} whileTap={reduced?undefined:{scale:.975}} transition={motionTheme.transition.snap} onMouseDown={down} {...props}>{children}<span className="sg-motion-ripple-layer" aria-hidden="true">{ripples.map(row=><motion.i key={row.id} style={{left:row.x,top:row.y,width:row.size,height:row.size}} initial={{opacity:.22,scale:0}} animate={{opacity:0,scale:1}} transition={{duration:.5,ease:'easeOut'}}/>)}</span></motion.button>
}

export function AnimatedListItem({children,index,className}:{children:ReactNode;index:number;className?:string}){
 const reduced=useReducedMotion()
 return <motion.div layout initial={reduced?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={reduced?{duration:0}:{...motionTheme.transition.gentle,delay:Math.min(index,8)*motionTheme.stagger.tight}} className={className}>{children}</motion.div>
}

export function StaggerGroup({children,className}:{children:ReactNode;className?:string}){
 const reduced=useReducedMotion()
 return <motion.div className={className} initial="hidden" animate="show" variants={{hidden:{},show:{transition:{staggerChildren:reduced?0:motionTheme.stagger.tight}}}}>{children}</motion.div>
}

export function StaggerItem({children,className}:{children:ReactNode;className?:string}){
 const reduced=useReducedMotion()
 return <motion.div className={className} variants={reduced?undefined:{hidden:{opacity:0,y:10},show:{opacity:1,y:0,transition:motionTheme.transition.gentle}}}>{children}</motion.div>
}
