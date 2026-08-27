import type { Channel, FeedItem, TelegramAccount } from '../../types'

export function ProfileSurface({account,feed,channels,onSettings,onSaved,onSource}:{account:TelegramAccount|null;feed:FeedItem[];channels:Channel[];onSettings:()=>void;onSaved:()=>void;onSource:(id:string)=>void}){
  const name=[account?.firstName,account?.lastName].filter(Boolean).join(' ')||'You'
  const initials=(account?.firstName?.[0]||'S')+(account?.lastName?.[0]||'')
  const recent=feed.slice(0,6)
  return <section className="sg2-page sg2-profile"><header className="sg2-profile-head"><span className="sg2-profile-avatar">{account?.avatar?<img src={account.avatar} alt=""/>:initials}</span><div><span className="sg2-eyebrow">Profile</span><h1>{name}</h1>{account?.username&&<p>@{account.username}</p>}{account?.bio&&<blockquote>{account.bio}</blockquote>}</div><div className="sg2-profile-actions"><button type="button" onClick={onSaved}>Saved</button><button type="button" onClick={onSettings}>Settings</button></div></header>
    <div className="sg2-profile-stats"><span><strong>{channels.length}</strong><small>Sources</small></span><span><strong>{feed.length}</strong><small>Recent objects</small></span><span><strong>{channels.filter(row=>row.type==='group').length}</strong><small>Groups</small></span></div>
    <div className="sg2-module"><div className="sg2-module-title"><strong>Your network</strong><span>Telegram identity, Supergram presentation</span></div><div className="sg2-entity-strip">{channels.slice(0,8).map(source=><button type="button" key={source.id} onClick={()=>onSource(source.id)}><span className="sg2-entity-avatar">{source.avatar?<img src={source.avatar} alt=""/>:source.initials}</span><strong>{source.title}</strong><small>{source.type||'Source'}</small></button>)}</div></div>
    <div className="sg2-module"><div className="sg2-module-title"><strong>Recent</strong><span>A publication-style view of your world</span></div><div className="sg2-profile-recent">{recent.map(item=><article key={item.id}><span>{item.media?.kind||'text'}</span><p>{String(item.text||'').slice(0,130)||(item.media?'Media object':'Telegram update')}</p></article>)}</div></div>
  </section>
}
