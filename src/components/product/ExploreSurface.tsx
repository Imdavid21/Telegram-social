import { useEffect, useMemo, useState } from 'react'
import type { SupergramFeedObject } from '../../product/feedObjects'
import { deriveTopics } from '../../product/feedObjects'
import { loadSettings } from '../../lib/storage'

export function ExploreSurface({objects,onSearch,onTopic,onSource}:{objects:SupergramFeedObject[];onSearch:()=>void;onTopic:(name:string)=>void;onSource:(id:string)=>void}){
  const [settings,setSettings]=useState(()=>loadSettings())
  useEffect(()=>{const handler=(event:Event)=>setSettings((event as CustomEvent).detail||loadSettings());window.addEventListener('supergram:settings-changed',handler);return()=>window.removeEventListener('supergram:settings-changed',handler)},[])
  const permitted=useMemo(()=>objects.filter(row=>row.source.type==='group'?settings.useGroupsForRecommendations:row.source.type==='channel'?settings.useChannelActivity:settings.includePrivateChatsInForYou),[objects,settings])
  const topics=settings.allowCrossGroupTopics?deriveTopics(permitted):[]
  const media=permitted.filter(row=>row.media&&!row.private).slice(0,8)
  const sources=[...new Map(permitted.filter(row=>!row.private).map(row=>[row.source.id,row.source])).values()].slice(0,8)
  return <section className="sg2-page sg2-explore"><header className="sg2-page-head"><div><span className="sg2-eyebrow">Explore</span><h1>Find what your network is moving toward.</h1></div><button className="sg2-search-launch" type="button" onClick={onSearch}>Search people, topics, groups, media…</button></header>
    <div className="sg2-module"><div className="sg2-module-title"><strong>Trending around you</strong><span>{settings.allowCrossGroupTopics?'Private cross-source intelligence':'Cross-group topics disabled'}</span></div><div className="sg2-topic-grid">{topics.length?topics.slice(0,6).map((topic,index)=><button type="button" key={topic.name} onClick={()=>onTopic(topic.name)}><span>{String(index+1).padStart(2,'0')}</span><strong>{topic.name}</strong><small>{topic.sources} sources · {topic.count} mentions</small></button>):<div className="sg2-empty-module">{settings.allowCrossGroupTopics?'Topics will emerge as your feed accumulates enough context.':'Enable cross-group topic detection in AI & Data to see private network trends.'}</div>}</div></div>
    <div className="sg2-module"><div className="sg2-module-title"><strong>People and communities</strong><span>Public or shared sources only</span></div><div className="sg2-entity-strip">{sources.map(source=><button type="button" key={source.id} onClick={()=>onSource(source.id)}><span className="sg2-entity-avatar">{source.avatar?<img src={source.avatar} alt=""/>:source.initials}</span><strong>{source.title}</strong><small>{source.type==='person'?'Person':source.type==='group'?'Community':'Channel'}</small></button>)}</div></div>
    <div className="sg2-module"><div className="sg2-module-title"><strong>Media being shared</strong><span>Private chats are excluded</span></div><div className="sg2-media-grid">{media.map(row=><article key={row.id}><div className="sg2-media-placeholder"><span>{row.type}</span></div><strong>{row.source.title}</strong><p>{String(row.item.text||'').slice(0,100)||'Media from Telegram'}</p></article>)}</div></div>
  </section>
}
