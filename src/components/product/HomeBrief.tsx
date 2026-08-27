import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { SupergramFeedObject } from '../../product/feedObjects'
import { deriveTopics } from '../../product/feedObjects'
import { summarizeTelegramMessage, type TelegramSummary } from '../../lib/telegramSummary'
import { hasOpenAIKey } from '../../lib/userOpenAI'
import { loadSettings } from '../../lib/storage'
import { motionTheme } from '../../lib/motionTheme'

type Props={objects:SupergramFeedObject[];onTopic:(topic:string)=>void;onCatchUp:()=>void}
type Mode='catchup'|'decisions'|'actions'|'changes'

function modeText(summary:TelegramSummary,mode:Mode){
  if(mode==='decisions')return summary.decisions.length?summary.decisions.join(' '):'No clear decision was reached in the available context.'
  if(mode==='actions'){const rows=[...summary.actionItems,...summary.deadlines];return rows.length?rows.join(' '):'No explicit action or deadline was detected.'}
  if(mode==='changes')return summary.keyFacts.length?summary.keyFacts.join(' '):summary.summary||'No material change was detected.'
  return summary.summary||summary.headline
}

export function HomeBrief({objects,onTopic,onCatchUp}:Props){
  const reduced=useReducedMotion()
  const [expanded,setExpanded]=useState(false)
  const [mode,setMode]=useState<Mode>('catchup')
  const [summary,setSummary]=useState<TelegramSummary|null>(null)
  const [summarizing,setSummarizing]=useState(false)
  const [summaryError,setSummaryError]=useState('')
  const [settings,setSettings]=useState(()=>loadSettings())
  const [keyConnected,setKeyConnected]=useState(()=>hasOpenAIKey())
  useEffect(()=>{const handler=(event:Event)=>setSettings((event as CustomEvent).detail||loadSettings());window.addEventListener('supergram:settings-changed',handler);return()=>window.removeEventListener('supergram:settings-changed',handler)},[])
  useEffect(()=>{const handler=()=>setKeyConnected(hasOpenAIKey());window.addEventListener('supergram:openai-key-changed',handler);return()=>window.removeEventListener('supergram:openai-key-changed',handler)},[])
  const permitted=objects.filter(row=>row.source.type==='group'?settings.useGroupsForRecommendations:row.source.type==='channel'?settings.useChannelActivity:true)
  const unread=permitted.filter(row=>row.item.unread)
  const groups=new Set(unread.filter(row=>row.source.type==='group').map(row=>row.source.id)).size
  const channels=new Set(unread.filter(row=>row.source.type==='channel').map(row=>row.source.id)).size
  const topicInput=settings.allowCrossGroupTopics?(unread.length?unread:permitted):[]
  const topics=deriveTopics(topicInput).slice(0,3)
  const focus=useMemo(()=>{
    const sourceCount=new Map<string,number>()
    for(const row of unread.filter(row=>row.source.type!=='person'))sourceCount.set(row.source.id,(sourceCount.get(row.source.id)||0)+1)
    const sourceId=[...sourceCount.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]
    const rows=(sourceId?unread.filter(row=>row.source.id===sourceId):unread.filter(row=>row.source.type!=='person')).slice(0,12)
    return {source:rows[0]?.source,rows}
  },[unread])
  const aggregate=focus.rows.map(row=>row.item.text).filter(Boolean).join('\n')
  const aiReady=settings.allowAISummaries&&keyConnected

  useEffect(()=>{
    if(!aiReady||!expanded||aggregate.trim().length<20){setSummary(null);setSummaryError('');return}
    const controller=new AbortController()
    const previous=focus.rows.slice(1).map(row=>({text:row.item.text,outgoing:row.item.outgoing,sourceType:row.item.sourceType,timestamp:row.item.timestamp,messageId:row.item.messageId}))
    setSummary(null);setSummaryError('');setSummarizing(true)
    void summarizeTelegramMessage(aggregate,{sourceType:focus.source?.type||'group',sourceName:focus.source?.title,previousMessages:previous},controller.signal).then(result=>setSummary(result)).catch(error=>{if(!controller.signal.aborted)setSummaryError(String((error as Error)?.message||'OpenAI summary failed.'))}).finally(()=>{if(!controller.signal.aborted)setSummarizing(false)})
    return()=>controller.abort()
  },[aiReady,expanded,aggregate,focus.source?.id])

  if(!permitted.length)return null
  const summaryHeadline=summary?.headline||(summarizing?'Reading the conversation…':'Summary unavailable')
  return <motion.section layout className={`sg2-brief ${expanded?'is-expanded':''}`} aria-label="While you were away" transition={reduced?{duration:0}:motionTheme.transition.gentle}>
    <div className="sg2-brief-copy"><span className="sg2-eyebrow">While you were away</span><h2>{unread.length?`${unread.length} updates worth knowing`:'You’re caught up on the important stuff'}</h2><p>{aiReady?`${groups} groups and ${channels} channels have new activity. OpenAI can compress the important context.`:'No OpenAI key connected. Supergram is prioritizing media instead of generating text summaries.'}</p></div>
    <div className="sg2-brief-actions">{aiReady?<motion.button whileTap={reduced?undefined:{scale:.975}} transition={motionTheme.transition.snap} type="button" className="sg2-primary" onClick={()=>{setExpanded(value=>!value);onCatchUp()}}>{expanded?'Close catch-up':'Catch me up'}</motion.button>:<button type="button" className="sg2-primary" disabled>Add OpenAI key for summaries</button>}{topics.map((topic,index)=><motion.button initial={reduced?false:{opacity:0,x:10}} animate={{opacity:1,x:0}} transition={reduced?{duration:0}:{...motionTheme.transition.gentle,delay:index*motionTheme.stagger.tight}} type="button" key={topic.name} onClick={()=>onTopic(topic.name)}>{topic.name}<span>{topic.sources} sources</span></motion.button>)}</div>
    <AnimatePresence initial={false}>{expanded&&aiReady&&focus.source&&<motion.div className="sg2-catchup" initial={reduced?false:{opacity:0,y:14,height:0}} animate={{opacity:1,y:0,height:'auto'}} exit={reduced?{opacity:0}:{opacity:0,y:-8,height:0}} transition={reduced?{duration:0}:motionTheme.transition.gentle}>
      <div className="sg2-catchup-head"><span><b>AI summary</b><small>Based on {focus.rows.length} recent messages in {focus.source.title}</small></span><em>{summarizing?'Reading with OpenAI…':'OpenAI · your key'}</em></div>
      <div className="sg2-catchup-modes">{([['catchup','Catch me up'],['decisions','Key decisions'],['actions','What do I need to do?'],['changes','What changed?']] as Array<[Mode,string]>).map(([id,label])=><button type="button" className={mode===id?'is-active':''} key={id} onClick={()=>setMode(id)}>{mode===id&&<motion.i layoutId="sg-catchup-mode" className="sg2-catchup-highlight" transition={motionTheme.transition.ui}/>}<span>{label}</span></button>)}</div>
      <AnimatePresence mode="wait" initial={false}><motion.div key={`${mode}:${summarizing}:${Boolean(summaryError)}`} initial={reduced?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={reduced?{opacity:0}:{opacity:0,y:-6}} transition={reduced?{duration:0}:motionTheme.transition.ui}><h3>{summaryHeadline}</h3>{summary?<p>{modeText(summary,mode)}</p>:summaryError?<p>{summaryError} Check your API key or OpenAI quota, then try again.</p>:<p>Finding the important parts.</p>}</motion.div></AnimatePresence>
      <details><summary>Sources · inspect supporting messages</summary><div className="sg2-catchup-sources">{focus.rows.slice(0,8).map(row=><article key={row.id}><strong>{row.source.title}</strong><p>{String(row.item.text||'').slice(0,260)||'Media message'}</p></article>)}</div></details>
      <small className="sg2-catchup-trust">AI output can be incomplete. Source messages remain the authority.</small>
    </motion.div>}</AnimatePresence>
  </motion.section>
}