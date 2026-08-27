import { useMemo, useState } from 'react'
import type { Audience, Channel, FeedItem, PostDraft, TelegramSearchResponse } from '../types'
import { createEmptyDraft, deleteDraft, loadDrafts, saveDraft } from '../lib/socialSystem'
import { loadSettings } from '../lib/storage'
import { searchTelegram } from '../lib/api'
import { transformWithUserOpenAI, type TransformMode } from '../lib/userOpenAI'
import { CloseIcon, ImageIcon, SearchIcon, SendIcon } from './Icons'

type Props={open:boolean;channels:Channel[];onClose:()=>void}
type CreateMode='post'|'import'|'transform'
const transforms:Array<[TransformMode,string]>=[['summary','Summary'],['story','AI Story'],['carousel','Carousel'],['thread','Thread'],['quote','Quote cards'],['caption','Caption'],['video-script','Video script']]

function excerpt(item:FeedItem){const text=String(item.text||'').replace(/\s+/g,' ').trim();return text.slice(0,180)||(item.media?`${item.media.kind} from Telegram`:'Telegram update')}

export function SocialComposer({open,channels,onClose}:Props){
 const[draft,setDraft]=useState<PostDraft>(()=>createEmptyDraft())
 const[drafts,setDrafts]=useState(()=>loadDrafts())
 const[mode,setMode]=useState<CreateMode>('post')
 const[search,setSearch]=useState('')
 const[results,setResults]=useState<TelegramSearchResponse|null>(null)
 const[searching,setSearching]=useState(false)
 const[selected,setSelected]=useState<FeedItem|null>(null)
 const[transformMode,setTransformMode]=useState<TransformMode>('story')
 const[transforming,setTransforming]=useState(false)
 const[status,setStatus]=useState('')
 const channelMap=useMemo(()=>new Map([...(results?.channels||[]),...channels].map(row=>[row.id,row])),[results,channels])
 if(!open)return null
 const update=(patch:Partial<PostDraft>)=>setDraft(current=>({...current,...patch,updatedAt:Date.now()}))
 const persist=()=>{saveDraft(draft);setDrafts(loadDrafts());setStatus('Draft saved on this device.')}
 const reset=()=>{setDraft(createEmptyDraft());setSelected(null);setStatus('')}
 const runSearch=async()=>{if(search.trim().length<2)return;setSearching(true);setStatus('');try{setResults(await searchTelegram(search.trim(),{limit:30}))}catch(e){setStatus(String((e as Error)?.message||'Could not search Telegram.'))}finally{setSearching(false)}}
 const importItem=(item:FeedItem)=>{setSelected(item);setDraft(current=>({...current,text:String(item.text||''),updatedAt:Date.now()}));setMode('transform');setStatus('Imported into an editable draft. Nothing is published automatically.')}
 const transform=async()=>{const input=draft.text.trim();if(!input)return;setTransforming(true);setStatus('');try{const result=await transformWithUserOpenAI(input,transformMode,loadSettings());update({text:result.output});setStatus('Transformed with OpenAI using your key. Review before saving.')}catch(e){setStatus(String((e as Error)?.message||'Could not transform this draft.'))}finally{setTransforming(false)}}
 return <div className="sg-social-modal sg2-create-modal" role="dialog" aria-modal="true" aria-label="Create"><button className="sg-social-backdrop" type="button" onClick={onClose} aria-label="Close composer"/><section className="sg-composer-panel sg2-composer"><header><div><strong>Create</strong><span>Make something new or transform Telegram context into an editable draft.</span></div><button type="button" onClick={onClose} aria-label="Close"><CloseIcon/></button></header>
  <nav className="sg2-create-tabs" aria-label="Create modes"><button className={mode==='post'?'is-active':''} onClick={()=>setMode('post')}>Post</button><button className={mode==='import'?'is-active':''} onClick={()=>setMode('import')}>From Telegram</button><button className={mode==='transform'?'is-active':''} onClick={()=>setMode('transform')}>AI Transform</button></nav>
  {mode==='import'?<div className="sg2-import"><label><SearchIcon/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void runSearch()}} placeholder="Search Telegram messages, channels, or groups"/></label><button className="sg2-primary" disabled={searching||search.trim().length<2} onClick={()=>void runSearch()}>{searching?'Searching…':'Search Telegram'}</button>{results&&<div className="sg2-import-results">{results.results.length?results.results.map(item=>{const source=channelMap.get(item.channelId);return <button key={item.id} onClick={()=>importItem(item)}><span><strong>{source?.title||'Telegram'}</strong><small>{source?.type==='group'?'Group':source?.type==='person'?'Private source':'Channel'}</small></span><p>{excerpt(item)}</p><em>Import</em></button>}):<p>No matching Telegram content.</p>}</div>}</div>:<>
   {selected&&<div className="sg2-imported-source"><span>Imported from</span><strong>{channelMap.get(selected.channelId)?.title||'Telegram'}</strong><button onClick={()=>setSelected(null)}>Remove source</button></div>}
   <textarea autoFocus value={draft.text} maxLength={12000} onChange={event=>update({text:event.target.value})} placeholder={mode==='transform'?'Paste or import source material to transform…':'Share an update…'}/>
   {mode==='transform'&&<div className="sg2-transform"><div className="sg2-transform-modes">{transforms.map(([id,label])=><button key={id} className={transformMode===id?'is-active':''} onClick={()=>setTransformMode(id)}>{label}</button>)}</div><button className="sg2-primary" disabled={!draft.text.trim()||transforming} onClick={()=>void transform()}>{transforming?'Transforming…':'Transform draft'}</button><small>AI transforms require your OpenAI API key. Telegram content is treated as untrusted source material, output remains editable, and nothing is auto-published.</small></div>}
   <div className="sg-composer-row"><label>Audience<select value={draft.audience} onChange={event=>update({audience:event.target.value as Audience})}><option value="everyone">Everyone</option><option value="followers">Followers</option><option value="close-friends">Close Friends</option><option value="selected">Selected people</option></select></label><label>Optional Telegram destination<select value={draft.destinationId||''} onChange={event=>update({destinationId:event.target.value||undefined})}><option value="">None</option>{channels.filter(channel=>channel.type!=='person').slice(0,40).map(channel=><option value={channel.id} key={channel.id}>{channel.title}</option>)}</select></label></div>
   <div className="sg-composer-tools"><button type="button" disabled title="Media publishing requires the server-backed post upload path"><ImageIcon/>Media</button><label>Planned publish time<input type="datetime-local" onChange={event=>update({scheduledAt:event.target.value?new Date(event.target.value).getTime():undefined})}/></label></div>
   <p className="sg-composer-capability">Public Supergram publishing remains disabled until the server-backed post endpoint exists. Saving here creates a local draft only.</p><footer><button type="button" onClick={reset}>New draft</button><button className="sg-primary-action" type="button" disabled={!draft.text.trim()} onClick={persist}><SendIcon/>Save draft</button></footer>
  </>}
  {status&&<p className="sg2-create-status" role="status">{status}</p>}
  {drafts.length>0&&<aside className="sg-draft-list"><strong>Drafts</strong>{drafts.slice(0,5).map(item=><div key={item.id}><button type="button" onClick={()=>{setDraft(item);setMode('post')}}>{item.text.slice(0,70)||'Untitled draft'}</button><button type="button" onClick={()=>{deleteDraft(item.id);setDrafts(loadDrafts());if(item.id===draft.id)reset()}} aria-label="Delete draft">×</button></div>)}</aside>}
 </section></div>
}