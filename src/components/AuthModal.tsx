import { useEffect,useState } from 'react'
import { AnimatePresence,motion,useReducedMotion } from 'motion/react'
import type { AuthPrompt } from '../types'
import { motionTheme } from '../lib/motionTheme'
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
export function PromptModal({prompt,onSubmit,onCancel}:{prompt:AuthPrompt|null;onSubmit:(value:string)=>void|Promise<void>;onCancel:()=>void}){
 const[value,setValue]=useState('');const[busy,setBusy]=useState(false);const reduced=useReducedMotion();useEffect(()=>{setValue('');setBusy(false)},[prompt?.type]);if(!prompt)return null
 async function submit(e:React.FormEvent){e.preventDefault();if(!value.trim()||busy)return;setBusy(true);try{await onSubmit(value.trim())}finally{setBusy(false)}}
 return <Dialog open={Boolean(prompt)} onOpenChange={v=>!v&&onCancel()}><DialogContent className="max-w-[420px]"><AnimatePresence mode="wait" initial={false}><motion.form key={prompt.type} onSubmit={submit} initial={reduced?false:{opacity:0,x:14}} animate={{opacity:1,x:0}} exit={reduced?{opacity:0}:{opacity:0,x:-10}} transition={reduced?{duration:0}:motionTheme.transition.ui}><DialogHeader><DialogTitle>{prompt.title}</DialogTitle><DialogDescription>{prompt.hint}</DialogDescription></DialogHeader><div className="px-5 py-5"><Input autoFocus value={value} onChange={e=>setValue(e.target.value)} type={prompt.type==='password'?'password':prompt.type==='code'?'text':'tel'} inputMode={prompt.type==='code'?'numeric':prompt.type==='phone'?'tel':undefined} autoComplete={prompt.type==='password'?'current-password':'one-time-code'} /></div><DialogFooter><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={!value.trim()||busy}>{busy?'Checking…':'Continue'}</Button></DialogFooter></motion.form></AnimatePresence></DialogContent></Dialog>
}