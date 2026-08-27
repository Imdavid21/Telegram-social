import { useMemo, useState } from 'react'
import { BrandMark } from './BrandMark'
import { demoChannels, demoFeed } from '../data/demo'
import { BookmarkIcon, HeartIcon, HomeIcon, SearchIcon, SendIcon } from './Icons'
import { Button } from './ui/button'

export function DemoPage({onConnect}:{onConnect:()=>void}){
 const[saved,setSaved]=useState(()=>new Set(demoFeed.filter(item=>item.saved).map(item=>item.id)))
 const[liked,setLiked]=useState(()=>new Set<string>())
 const[view,setView]=useState<'home'|'explore'|'pulse'|'profile'>('home')
 const topics=useMemo(()=>['Hyperliquid','Design systems','Devcon'],[])
 const toggle=(setter:typeof setSaved,current:Set<string>,id:string)=>setter(()=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next})
 const posts=demoFeed.slice(0,5)
 return <div className="demo-page-v3">
  <aside className="demo-v3-nav"><div className="demo-v3-brand"><BrandMark/><strong>Supergram</strong></div><nav><button className={view==='home'?'is-active':''} onClick={()=>setView('home')}><HomeIcon/>Home</button><button className={view==='explore'?'is-active':''} onClick={()=>setView('explore')}><SearchIcon/>Explore</button><button><SendIcon/>Create</button><button className={view==='pulse'?'is-active':''} onClick={()=>setView('pulse')}><span className="demo-v3-pulse">◌</span>Pulse</button><button className={view==='profile'?'is-active':''} onClick={()=>setView('profile')}><span className="demo-v3-avatar">UD</span>Profile</button></nav><Button onClick={onConnect}>Use my Telegram</Button></aside>
  <main className="demo-v3-main">
   <header><span>Interactive preview</span><Button size="sm" onClick={onConnect}>Connect Telegram</Button></header>
   {view==='home'&&<><section className="demo-v3-brief"><small>While you were away</small><h1>7 updates worth knowing</h1><p>Two groups accelerated overnight. One conversation may need your input.</p><div><button>Catch me up</button>{topics.map(topic=><span key={topic}>{topic}</span>)}</div></section><section className="demo-v3-feed">{posts.map(item=>{const source=demoChannels.find(channel=>channel.id===item.channelId);const media=item.media&&item.media.kind!=='album'?item.media:null;return <article key={item.id}><header><span style={{background:source?.accent}}>{source?.initials}</span><div><strong>{source?.title}</strong><small>{source?.type==='group'?'Group':source?.type==='person'?'Person':'Channel'} · now</small></div></header>{media&&<div className="demo-v3-media" style={{background:media.gradient}}><span>{media.label||media.kind}</span></div>}<p>{item.text}</p><footer><button className={liked.has(item.id)?'is-active':''} onClick={()=>toggle(setLiked,liked,item.id)}><HeartIcon/>React</button><button><SendIcon/>Forward</button><button className={saved.has(item.id)?'is-active':''} onClick={()=>toggle(setSaved,saved,item.id)}><BookmarkIcon/>Save</button></footer></article>})}</section></>}
   {view==='explore'&&<section className="demo-v3-surface"><small>Explore</small><h1>Find what your network is moving toward.</h1><div className="demo-v3-topic-grid">{topics.map((topic,index)=><article key={topic}><span>0{index+1}</span><strong>{topic}</strong><small>{index+2} sources · active now</small></article>)}</div></section>}
   {view==='pulse'&&<section className="demo-v3-surface"><small>Pulse · Now</small><h1>What is moving across your world.</h1>{demoChannels.slice(0,5).map((source,index)=><div className="demo-v3-pulse-row" key={source.id}><span>0{index+1}</span><strong>{source.title}</strong><i><b style={{width:`${90-index*13}%`}}/></i><em>{index<2?'Hot':'Active'}</em></div>)}</section>}
   {view==='profile'&&<section className="demo-v3-surface"><small>Profile</small><h1>Your Telegram identity, presented as a publication.</h1><p>Recent media, communities, channels, and public activity live here without turning the page into a rigid photo grid.</p></section>}
  </main>
 </div>
}