import type { Channel, FeedItem } from '../types'

export type SupergramFeedType = 'photo'|'video'|'carousel'|'text'|'ai_story'|'group_summary'|'topic'|'poll'|'event'|'link'|'voice'|'community'|'creator'|'telegram_import'
export type ProvenanceKind = 'original'|'telegram_channel'|'telegram_group'|'telegram_private'|'telegram_saved'|'ai_generated'|'recommended'

export type SupergramFeedObject = {
  id:string
  type:SupergramFeedType
  item:FeedItem
  source:Channel
  provenance:ProvenanceKind
  private:boolean
  media:boolean
  createdAt:number
  topicHints:string[]
}

const TOKEN=/\b[A-Z][A-Za-z0-9-]{2,20}\b|\$[A-Z0-9]{2,12}|#[A-Za-z0-9_]{3,}/g

export function topicHints(text:string){
  const rows=String(text||'').match(TOKEN)||[]
  return [...new Set(rows.map(value=>value.replace(/^#/,'')).filter(value=>!['The','This','That','With','From','Telegram'].includes(value)))].slice(0,6)
}

export function normalizeFeedObject(item:FeedItem,source:Channel):SupergramFeedObject{
  let type:SupergramFeedType='text'
  const kind=item.media?.kind
  if(kind==='photo')type='photo'
  else if(kind==='video'||kind==='gif')type='video'
  else if(kind==='album')type='carousel'
  else if(kind==='poll')type='poll'
  else if(kind==='voice'||kind==='audio')type='voice'
  else if(item.storyClustered&&Number(item.storySources||0)>=3)type='topic'
  const privateSource=source.type==='person'||Boolean(source.private)
  const provenance:ProvenanceKind=privateSource?'telegram_private':source.type==='group'?'telegram_group':'telegram_channel'
  return {id:item.id,type,item,source,provenance,private:privateSource,media:Boolean(item.media),createdAt:item.timestamp,topicHints:topicHints(item.text)}
}

export function deriveTopics(objects:SupergramFeedObject[]){
  const map=new Map<string,{name:string;count:number;sources:Set<string>;latest:number}>()
  for(const object of objects){
    for(const name of object.topicHints){
      const key=name.toLowerCase()
      const row=map.get(key)||{name,count:0,sources:new Set<string>(),latest:0}
      row.count+=1;row.sources.add(object.source.id);row.latest=Math.max(row.latest,object.createdAt);map.set(key,row)
    }
  }
  return [...map.values()].map(row=>({name:row.name,count:row.count,sources:row.sources.size,latest:row.latest,score:row.count*2+row.sources.size*4+Math.max(0,24-(Date.now()-row.latest)/36e5)})).filter(row=>row.count>=2||row.sources>=2).sort((a,b)=>b.score-a.score).slice(0,12)
}

export function deriveSourcePulse(objects:SupergramFeedObject[]){
  const map=new Map<string,{source:Channel;updates:number;unread:number;latest:number;media:number}>()
  for(const object of objects){
    const row=map.get(object.source.id)||{source:object.source,updates:0,unread:0,latest:0,media:0}
    row.updates+=1;row.unread+=object.item.unread?1:0;row.media+=object.media?1:0;row.latest=Math.max(row.latest,object.createdAt);map.set(object.source.id,row)
  }
  return [...map.values()].map(row=>({...row,velocity:row.updates+row.unread*1.5+row.media*.4+Math.max(0,12-(Date.now()-row.latest)/36e5)})).sort((a,b)=>b.velocity-a.velocity)
}
