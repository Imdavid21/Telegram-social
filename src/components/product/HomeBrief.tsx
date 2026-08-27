import { useEffect, useMemo, useState } from 'react'
import type { SupergramFeedObject } from '../../product/feedObjects'
import { deriveTopics } from '../../product/feedObjects'
import { buildTelegramSummary, summarizeTelegramMessage, type TelegramSummary } from '../../lib/telegramSummary'

type Props={objects:SupergramFeedObject[];onTopic:(topic:string)=>void;onCatchUp:()=>void}
type Mode='catchup'|'decisions'|'actions'|'changes'

function modeText(summary:TelegramSummary,mode:Mode){
  if(mode==='decisions')return summary.decisions.length?summary.decisions.join(' '):'No clear decision was reached in the available context.'
  if(mode==='actions'){const rows=[...summary.actionItems,...summary.deadlines];return rows.length?rows.join(' '):'No explicit action or deadline was detected.'}
  if(mode==='changes')return summary.keyFacts.length?summary.keyFacts.join(' '):summary.summary||'No material change was detected.'
  return summary.summary||summary.headline
}

export function HomeBrief({objects,onTopic,onCatchUp}:Props){
  const [expanded,setExpanded]=useState(false)
  const [mode,setMode]=useState<Mode>('catchup')
  const [summary,setSummary]=useState<TelegramSummary|null>(null)
  const [summarizing,setSummarizing]=useState(false)
  const unread=objects.filter(row=>row.item.unread)
  const groups=new Set(unread.filter(row=>row.source.type==='group').map(row=>row.source.id)).size
  const channels=new Set(unread.filter(row=>row.source.type==='channel').map(row=>row.source.id)).size
  const topics=deriveTopics(unread.length?unread:objects).slice(0,3)
  const focus=useMemo(()=>{
    const sourceCount=new Map<string,number>()
    for(const row of unread.filter(row=>row.source.type!=='person'))sourceCount.set(row.source.id,(sourceCount.get(row.source.id)||0)+1)
    const sourceId=[...sourceCount.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]
    const rows=(sourceId?unread.filter(row=>row.source.id===sourceId):unread.filter(row=>row.source.type!=='person')).slice(0,12)
    return {source:rows[0]?.source,rows}
  },[unread])
  const aggregate=focus.rows.map(row=>row.item.text).filter(Boolean).join('\n')

  useEffect(()=>{
    if(!expanded||aggregate.trim().length<20){setSummary(null);return}
    const controller=new AbortController()
    const previous=focus.rows.slice(1).map(row=>({text:row.item.text,outgoing:row.item.outgoing,sourceType:row.item.sourceType,timestamp:row.item.timestamp,messageId:row.item.messageId}))
    const local=buildTelegramSummary(aggregate,{sourceType:focus.source?.type||'group',sourceName:focus.source?.title,previousMessages:previous})
    setSummary(local);setSummarizing(true)
    void summarizeTelegramMessage(aggregate,{sourceType:focus.source?.type||'group',sourceName:focus.source?.title,previousMessages:previous},controller.signal).then(result=>setSummary(result)).catch(()=>{}).finally(()=>setSummarizing(false))
    return()=>controller.abort()
  },[expanded,aggregate,focus.source?.id])

  if(!objects.length)return null
  return <section className={`sg2-brief ${expanded?'is-expanded':''}`} aria-label="While you were away">
    <div className="sg2-brief-copy"><span className="sg2-eyebrow">While you were away</span><h2>{unread.length?`${unread.length} updates worth knowing`:'You’re caught up on the important stuff'}</h2><p>{unread.length?`${groups} groups and ${channels} channels have new activity. Supergram prioritizes what changed, not every message.`:'Keep exploring topics and media from your network.'}</p></div>
    <div className="sg2-brief-actions"><button type="button" className="sg2-primary" onClick={()=>{setExpanded(value=>!value);onCatchUp()}}>{expanded?'Close catch-up':'Catch me up'}</button>{topics.map(topic=><button type="button" key={topic.name} onClick={()=>onTopic(topic.name)}>{topic.name}<span>{topic.sources} sources</span></button>)}</div>
    {expanded&&focus.source&&<div className="sg2-catchup">
      <div className="sg2-catchup-head"><span><b>AI summary</b><small>Based on {focus.rows.length} recent messages in {focus.source.title}</small></span><em>{summarizing?'Updating…':summary?.ml?'OpenAI · your key':'Local summary'}</em></div>
      <div className="sg2-catchup-modes">{([['catchup','Catch me up'],['decisions','Key decisions'],['actions','What do I need to do?'],['changes','What changed?']] as Array<[Mode,string]>).map(([id,label])=><button type="button" className={mode===id?'is-active':''} key={id} onClick={()=>setMode(id)}>{label}</button>)}</div>
      <h3>{summary?.headline||'Reading the conversation…'}</h3><p>{summary?modeText(summary,mode):'Finding the important parts.'}</p>
      <details><summary>Sources · inspect supporting messages</summary><div className="sg2-catchup-sources">{focus.rows.slice(0,8).map(row=><article key={row.id}><strong>{row.source.title}</strong><p>{String(row.item.text||'').slice(0,260)||'Media message'}</p></article>)}</div></details>
      <small className="sg2-catchup-trust">AI output can be incomplete. Source messages remain the authority.</small>
    </div>}
  </section>
}
