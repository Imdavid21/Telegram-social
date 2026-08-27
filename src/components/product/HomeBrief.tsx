import type { SupergramFeedObject } from '../../product/feedObjects'
import { deriveTopics } from '../../product/feedObjects'

type Props={objects:SupergramFeedObject[];onTopic:(topic:string)=>void;onCatchUp:()=>void}

export function HomeBrief({objects,onTopic,onCatchUp}:Props){
  const unread=objects.filter(row=>row.item.unread)
  const groups=new Set(unread.filter(row=>row.source.type==='group').map(row=>row.source.id)).size
  const channels=new Set(unread.filter(row=>row.source.type==='channel').map(row=>row.source.id)).size
  const topics=deriveTopics(unread.length?unread:objects).slice(0,3)
  if(!objects.length)return null
  return <section className="sg2-brief" aria-label="While you were away">
    <div className="sg2-brief-copy"><span className="sg2-eyebrow">While you were away</span><h2>{unread.length?`${unread.length} updates worth knowing`:'You’re caught up on the important stuff'}</h2><p>{unread.length?`${groups} groups and ${channels} channels have new activity. Supergram prioritizes what changed, not every message.`:'Keep exploring topics and media from your network.'}</p></div>
    <div className="sg2-brief-actions"><button type="button" className="sg2-primary" onClick={onCatchUp}>Catch me up</button>{topics.map(topic=><button type="button" key={topic.name} onClick={()=>onTopic(topic.name)}>{topic.name}<span>{topic.sources} sources</span></button>)}</div>
  </section>
}
