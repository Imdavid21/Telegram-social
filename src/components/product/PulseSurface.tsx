import { useEffect, useMemo, useState } from 'react'
import type { SupergramFeedObject } from '../../product/feedObjects'
import { deriveSourcePulse, deriveTopics } from '../../product/feedObjects'
import { loadSettings } from '../../lib/storage'

export function PulseSurface({objects,onSource,onTopic}:{objects:SupergramFeedObject[];onSource:(id:string)=>void;onTopic:(name:string)=>void}){
  const [settings,setSettings]=useState(()=>loadSettings())
  useEffect(()=>{const handler=(event:Event)=>setSettings((event as CustomEvent).detail||loadSettings());window.addEventListener('supergram:settings-changed',handler);return()=>window.removeEventListener('supergram:settings-changed',handler)},[])
  const permitted=useMemo(()=>objects.filter(row=>row.source.type==='group'?settings.useGroupsForRecommendations:row.source.type==='channel'?settings.useChannelActivity:settings.includePrivateChatsInForYou),[objects,settings])
  const sources=deriveSourcePulse(permitted).slice(0,8)
  const topics=settings.allowCrossGroupTopics?deriveTopics(permitted).slice(0,6):[]
  const max=Math.max(1,...sources.map(row=>row.velocity))
  const totalUnread=permitted.reduce((sum,row)=>sum+(row.item.unread?1:0),0)
  const activeSources=new Set(permitted.filter(row=>Date.now()-row.createdAt<24*36e5).map(row=>row.source.id)).size
  return <section className="sg2-page sg2-pulse"><header className="sg2-page-head"><div><span className="sg2-eyebrow">Pulse · Now</span><h1>What is moving across your world.</h1><p>{totalUnread} unread updates across {activeSources} permitted, recently active sources.</p></div></header>
    <div className="sg2-pulse-list">{sources.length?sources.map((row,index)=><button type="button" key={row.source.id} onClick={()=>onSource(row.source.id)}><span className="sg2-pulse-rank">{String(index+1).padStart(2,'0')}</span><span className="sg2-pulse-copy"><strong>{row.source.title}</strong><small>{row.updates} updates · {row.unread} unread</small><i><b style={{width:`${Math.max(8,(row.velocity/max)*100)}%`}}/></i></span><em>{row.velocity>12?'Hot':row.velocity>6?'Active':'Steady'}</em></button>):<div className="sg2-empty-module">No permitted activity to show in Pulse.</div>}</div>
    <div className="sg2-module"><div className="sg2-module-title"><strong>Trending topics</strong><span>{settings.allowCrossGroupTopics?'Private to you':'Cross-group detection disabled'}</span></div>{topics.length?<div className="sg2-topic-pills">{topics.map(topic=><button type="button" key={topic.name} onClick={()=>onTopic(topic.name)}><strong>{topic.name}</strong><span>{topic.sources} sources</span></button>)}</div>:<div className="sg2-empty-module">{settings.allowCrossGroupTopics?'Not enough repeated topic activity yet.':'Enable cross-group topic detection in AI & Data to see network trends.'}</div>}</div>
  </section>
}
