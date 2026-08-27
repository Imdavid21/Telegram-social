import type { SupergramFeedObject } from '../../product/feedObjects'
import { deriveSourcePulse, deriveTopics } from '../../product/feedObjects'

export function PulseSurface({objects,onSource,onTopic}:{objects:SupergramFeedObject[];onSource:(id:string)=>void;onTopic:(name:string)=>void}){
  const sources=deriveSourcePulse(objects).slice(0,8)
  const topics=deriveTopics(objects).slice(0,6)
  const max=Math.max(1,...sources.map(row=>row.velocity))
  const totalUnread=objects.reduce((sum,row)=>sum+(row.item.unread?1:0),0)
  const activeSources=new Set(objects.filter(row=>Date.now()-row.createdAt<24*36e5).map(row=>row.source.id)).size
  return <section className="sg2-page sg2-pulse"><header className="sg2-page-head"><div><span className="sg2-eyebrow">Pulse · Now</span><h1>What is moving across your world.</h1><p>{totalUnread} unread updates across {activeSources} recently active sources.</p></div></header>
    <div className="sg2-pulse-list">{sources.map((row,index)=><button type="button" key={row.source.id} onClick={()=>onSource(row.source.id)}><span className="sg2-pulse-rank">{String(index+1).padStart(2,'0')}</span><span className="sg2-pulse-copy"><strong>{row.source.title}</strong><small>{row.updates} updates · {row.unread} unread</small><i><b style={{width:`${Math.max(8,(row.velocity/max)*100)}%`}}/></i></span><em>{row.velocity>12?'Hot':row.velocity>6?'Active':'Steady'}</em></button>)}</div>
    <div className="sg2-module"><div className="sg2-module-title"><strong>Trending topics</strong><span>Private to you</span></div><div className="sg2-topic-pills">{topics.map(topic=><button type="button" key={topic.name} onClick={()=>onTopic(topic.name)}><strong>{topic.name}</strong><span>{topic.sources} sources</span></button>)}</div></div>
  </section>
}
