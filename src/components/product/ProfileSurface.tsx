import { useEffect, useState } from 'react'
import type { Channel, FeedItem, TelegramAccount } from '../../types'
import { loadSettings } from '../../lib/storage'

export function ProfileSurface({account,feed,channels,onSettings,onSaved,onSource}:{account:TelegramAccount|null;feed:FeedItem[];channels:Channel[];onSettings:()=>void;onSaved:()=>void;onSource:(id:string)=>void}){
  const [settings,setSettings]=useState(()=>loadSettings())
  useEffect(()=>{const handler=(event:Event)=>setSettings((event as CustomEvent).detail||loadSettings());window.addEventListener('supergram:settings-changed',handler);return()=>window.removeEventListener('supergram:settings-changed',handler)},[])
  const name=[account?.firstName,account?.lastName].filter(Boolean).join(' ')||'You'
  const initials=(account?.firstName?.[0]||'S')+(account?.lastName?.[0]||'')
  const recent=feed.filter(item=>{const source=channels.find(row=>row.id===item.channelId);return source?.type!=='person'}).slice(0,6)
  const network=channels.filter(source=>source.type!=='person'||settings.showContacts).slice(0,8)
  return <section className="sg2-page sg2-profile"><header className="sg2-profile-head"><span className="sg2-profile-avatar">{account?.avatar?<img src={account.avatar} alt=""/>:initials}</span><div><span className="sg2-eyebrow">Profile</span><h1>{name}</h1>{settings.showTelegramUsername&&account?.username&&<p>@{account.username}</p>}{account?.bio&&<blockquote>{account.bio}</blockquote>}</div><div className="sg2-profile-actions"><button type="button" onClick={onSaved}>Saved</button><button type="button" onClick={onSettings}>Settings</button></div></header>
    <div className="sg2-profile-stats"><span><strong>{channels.length}</strong><small>Sources</small></span><span><strong>{feed.length}</strong><small>Feed objects</small></span><span><strong>{channels.filter(row=>row.type==='group').length}</strong><small>Groups</small></span></div>
    <div className="sg2-module"><div className="sg2-module-title"><strong>Your network</strong><span>{settings.showContacts?'Contacts and communities':'Communities and channels'}</span></div>{network.length?<div className="sg2-entity-strip">{network.map(source=><button type="button" key={source.id} onClick={()=>onSource(source.id)}><span className="sg2-entity-avatar">{source.avatar?<img src={source.avatar} alt=""/>:source.initials}</span><strong>{source.title}</strong><small>{source.type||'Source'}</small></button>)}</div>:<div className="sg2-empty-module">No sources are available under the current privacy settings.</div>}</div>
    <div className="sg2-module"><div className="sg2-module-title"><strong>Recent</strong><span>Private chats are not presented as profile media</span></div><div className="sg2-profile-recent">{recent.map(item=><article key={item.id}><span>{item.media?.kind||'text'}</span><p>{String(item.text||'').slice(0,130)||(item.media?'Media object':'Telegram update')}</p></article>)}</div></div>
  </section>
}
