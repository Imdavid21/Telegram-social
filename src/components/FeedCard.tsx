import { useEffect, useMemo, useRef, useState } from 'react'
import type { Channel, FeedItem, FeedMode, StoryMember } from '../types'
import { BookmarkIcon, EyeIcon, HeartIcon, LockIcon, MessageIcon, MoreIcon, SearchIcon, SendIcon } from './Icons'
import { MediaRenderer } from './MediaRenderer'
import { BottomSheet } from './BottomSheet'
import { haptics } from '../lib/interaction'
import { fetchShareTargets, forwardTelegramPost, replyToTelegramPost, setTelegramReaction, type ShareTarget } from '../lib/api'
import { recordViewerAction, type ViewerActionType } from '../lib/storage'
import { getRankingReasons } from '../lib/ranking'

type StoryEntry={member:StoryMember;channel:Channel}
function timeAgo(timestamp:number){const mins=Math.max(1,Math.floor((Date.now()-Number(timestamp||0))/60000));if(mins<60)return`${mins}m`;const hours=Math.floor(mins/60);if(hours<24)return`${hours}h`;const days=Math.floor(hours/24);return days<7?`${days}d`:new Date(timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric'})}
function isHeart(value?:string){return value==='❤'||value==='❤️'||value==='♥'||value==='♥️'}
function clean(value:string){return String(value||'').replace(/\s+/g,' ').trim()}
function clip(value:string,limit=180){const text=clean(value);return text.length>limit?`${text.slice(0,limit-1).trim()}…`:text}
function telegramPostUrl(channel:Channel|undefined,messageId?:number){return channel?.username&&messageId?`https://t.me/${encodeURIComponent(channel.username)}/${Number(messageId)}`:null}
function sourceKind(channel:Channel){if(channel.type==='person')return'Private';if(channel.type==='group')return'Community';return'Channel'}
function avatarText(channel:Channel){return String(channel.initials||channel.title?.slice(0,2)||'SG').toUpperCase()}
function SourceAvatar({channel}:{channel:Channel}){const[failed,setFailed]=useState(false);return <span className="sg2-post-avatar" style={{background:channel.accent||'#202020'}}>{channel.avatar&&!failed?<img src={channel.avatar} alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:avatarText(channel)}</span>}

export function FeedCard({item,channel,feedMode,favoriteSource,storyEntries=[],onSave,onRead,onFavoriteSource,onHideSource,onHidePost,onFeedback,onSourceOpen,onDiscussionOpen,index=0}:{item:FeedItem;channel:Channel;feedMode:FeedMode;favoriteSource:boolean;summarizePrivateChats:boolean;storyEntries?:StoryEntry[];summaryContext?:unknown[];onSave:(item:FeedItem)=>void;onRead:(item:FeedItem)=>void;onFavoriteSource:(channel:Channel)=>void;onHideSource:(channel:Channel)=>void;onHidePost:(item:FeedItem)=>void;onFeedback:(item:FeedItem,type:Extract<ViewerActionType,'more_like_this'|'less_like_this'>)=>void;onSourceOpen?:(channel:Channel)=>void;onDiscussionOpen?:(item:FeedItem)=>void;index?:number}){
 const root=useRef<HTMLElement>(null)
 const dwell=useRef<number|null>(null)
 const impressed=useRef(false)
 const[expanded,setExpanded]=useState(false)
 const[liked,setLiked]=useState(()=>isHeart(item.myReaction)||item.reactions?.some(row=>row.chosen&&isHeart(row.emoji))||false)
 const[reactions,setReactions]=useState(()=>Array.isArray(item.reactions)?item.reactions:[])
 const[likeBusy,setLikeBusy]=useState(false)
 const[replyOpen,setReplyOpen]=useState(false)
 const[replyText,setReplyText]=useState('')
 const[replyBusy,setReplyBusy]=useState(false)
 const[shareOpen,setShareOpen]=useState(false)
 const[shareTargets,setShareTargets]=useState<ShareTarget[]>([])
 const[shareQuery,setShareQuery]=useState('')
 const[shareBusy,setShareBusy]=useState('')
 const[shareLoading,setShareLoading]=useState(false)
 const[moreOpen,setMoreOpen]=useState(false)
 const[whyOpen,setWhyOpen]=useState(false)
 const[sourcesOpen,setSourcesOpen]=useState(false)
 const[error,setError]=useState('')
 const media=item.media&&typeof item.media==='object'?item.media:undefined
 const text=String(item.text||'')
 const isLong=text.length>560
 const visibleText=!expanded&&isLong?`${text.slice(0,560).trimEnd()}…`:text
 const privateSource=channel.type==='person'||Boolean(channel.private)
 const storySources=Math.max(Number(item.storySources||0),storyEntries.length)
 const rankingReasons=useMemo(()=>feedMode==='latest'?[{type:'latest' as const,label:'Shown in chronological order'}]:getRankingReasons(item,{favoriteSources:favoriteSource?new Set([channel.id]):undefined}),[feedMode,item,favoriteSource,channel.id])
 const targets=useMemo(()=>{const q=shareQuery.trim().toLowerCase();return q?shareTargets.filter(row=>`${row.title} ${row.username||''}`.toLowerCase().includes(q)):shareTargets},[shareTargets,shareQuery])

 useEffect(()=>{setReactions(Array.isArray(item.reactions)?item.reactions:[]);setLiked(isHeart(item.myReaction)||item.reactions?.some(row=>row.chosen&&isHeart(row.emoji))||false)},[item.id,item.myReaction,item.reactions])
 useEffect(()=>{const el=root.current;if(!el||typeof IntersectionObserver==='undefined')return;const observer=new IntersectionObserver(entries=>{const visible=Boolean(entries[0]?.isIntersecting&&entries[0].intersectionRatio>=.55);if(visible){if(!impressed.current){impressed.current=true;recordViewerAction({type:'impression',itemId:item.id,channelId:item.channelId,timestamp:Date.now(),media:Boolean(media)})}if(dwell.current===null)dwell.current=Date.now()}else if(dwell.current!==null){const seconds=(Date.now()-dwell.current)/1000;dwell.current=null;if(seconds>=1.5)recordViewerAction({type:'dwell',itemId:item.id,channelId:item.channelId,timestamp:Date.now(),value:seconds,media:Boolean(media)});else recordViewerAction({type:'skip',itemId:item.id,channelId:item.channelId,timestamp:Date.now(),value:seconds,media:Boolean(media)})}},{threshold:[.2,.55,.85]});observer.observe(el);return()=>observer.disconnect()},[item.id,item.channelId,media])

 async function toggleLike(){if(likeBusy)return;const next=!liked;setLiked(next);setLikeBusy(true);setError('');haptics.light();try{const result=await setTelegramReaction(item,next);setLiked(Boolean(result.liked));if(Array.isArray(result.reactions))setReactions(result.reactions)}catch(e){setLiked(!next);setError(String((e as Error)?.message||'Could not update the reaction.'));haptics.error()}finally{setLikeBusy(false)}}
 function openDiscussion(){onDiscussionOpen?.(item);setError('');setReplyOpen(true);recordViewerAction({type:'open',itemId:item.id,channelId:item.channelId,timestamp:Date.now(),media:Boolean(media)})}
 async function sendReply(){const value=replyText.trim();if(!value||replyBusy)return;setReplyBusy(true);setError('');try{await replyToTelegramPost(item,value);setReplyText('');setReplyOpen(false);haptics.success()}catch(e){setError(String((e as Error)?.message||'Could not send the reply.'));haptics.error()}finally{setReplyBusy(false)}}
 async function openShare(){if(item.noForwards)return;setShareOpen(true);if(shareTargets.length||shareLoading)return;setShareLoading(true);setError('');try{const result=await fetchShareTargets();setShareTargets(Array.isArray(result.targets)?result.targets:[])}catch(e){setError(String((e as Error)?.message||'Could not load Telegram destinations.'))}finally{setShareLoading(false)}}
 async function forward(targetId:string){if(shareBusy)return;setShareBusy(targetId);setError('');try{await forwardTelegramPost(item,targetId);setShareOpen(false);recordViewerAction({type:'open',itemId:item.id,channelId:item.channelId,timestamp:Date.now(),media:Boolean(media)});haptics.success()}catch(e){setError(String((e as Error)?.message||'Could not forward this object.'));haptics.error()}finally{setShareBusy('')}}
 function save(){recordViewerAction({type:item.saved?'unsave':'save',itemId:item.id,channelId:item.channelId,timestamp:Date.now(),media:Boolean(media)});onSave(item);haptics.light()}
 function feedback(type:'more_like_this'|'less_like_this'){onFeedback(item,type);setMoreOpen(false);haptics.selection()}

 return <article ref={root} className={`sg2-post ${media?'has-media':'is-text'} ${item.unread?'is-unread':''}`} data-feed-index={index}>
  <header className="sg2-post-head"><button className="sg2-post-source" type="button" onClick={()=>onSourceOpen?.(channel)}><SourceAvatar channel={channel}/><span><strong>{channel.title}{channel.verified?' ✓':''}</strong><small>{sourceKind(channel)} · {timeAgo(item.timestamp)}{item.edited?' · edited':''}{storySources>1?` · ${storySources} sources`:''}</small></span></button>{privateSource&&<span className="sg2-private-label"><LockIcon/>Private</span>}{channel.scam&&<span className="sg2-warning">Scam</span>}{channel.fake&&<span className="sg2-warning">Fake</span>}<button className="sg2-post-more" type="button" onClick={()=>setMoreOpen(true)} aria-label="Post options"><MoreIcon/></button></header>
  {media&&<div className="sg2-post-media"><MediaRenderer media={media}/></div>}
  {visibleText&&<div className={`sg2-post-copy ${media?'':'is-editorial'}`}>{!media&&<span className="sg2-eyebrow">{sourceKind(channel)} update</span>}<p>{visibleText}</p>{isLong&&<button type="button" onClick={()=>setExpanded(value=>!value)}>{expanded?'Show less':'Read more'}</button>}</div>}
  {storySources>1&&<button className="sg2-provenance" type="button" onClick={()=>setSourcesOpen(true)}><span>Shared across {storySources} sources</span><small>Inspect provenance</small></button>}
  <div className="sg2-post-actions"><button className={liked?'is-active':''} disabled={likeBusy} onClick={()=>void toggleLike()}><HeartIcon/><span>React</span></button><button onClick={openDiscussion}><MessageIcon/><span>Reply</span>{Number(item.comments||0)>0&&<b>{item.comments}</b>}</button><button disabled={item.noForwards} onClick={()=>void openShare()}><SendIcon/><span>Forward</span></button><button className={item.saved?'is-active':''} onClick={save}><BookmarkIcon/><span>Save</span></button></div>
  {(reactions.length>0||item.views)&&<div className="sg2-post-social">{reactions.length>0&&<span>{reactions.slice(0,4).map((row,i)=><em key={`${row.emoji}-${i}`}>{row.emoji} {row.count}</em>)}</span>}{item.views&&<small>{item.views} views</small>}</div>}
  {error&&<div className="sg2-post-error" role="status">{error}</div>}

  <BottomSheet open={replyOpen} onClose={()=>setReplyOpen(false)} title="Reply"><div className="sg2-reply"><blockquote><strong>{channel.title}</strong><span>{clip(text,130)||(media?'Media object':'Original update')}</span></blockquote><textarea value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="Reply in the Telegram conversation…" autoFocus onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter')void sendReply()}}/><button disabled={!replyText.trim()||replyBusy} onClick={()=>void sendReply()}>{replyBusy?'Sending…':'Send reply'}</button><small>This reply is sent to the original Telegram conversation.</small></div></BottomSheet>
  <BottomSheet open={shareOpen} onClose={()=>setShareOpen(false)} title="Forward to Telegram"><div className="sg2-share"><label><SearchIcon/><input value={shareQuery} onChange={e=>setShareQuery(e.target.value)} placeholder="Search destinations"/></label>{shareLoading?<p>Loading destinations…</p>:targets.length?targets.map(target=><button key={target.id} disabled={Boolean(shareBusy)} onClick={()=>void forward(target.id)}><span>{target.avatar?<img src={target.avatar} alt=""/>:target.initials||target.title.slice(0,2).toUpperCase()}</span><strong>{target.title}</strong><em>{shareBusy===target.id?'Sending…':'Send'}</em></button>):<p>No Telegram destinations found.</p>}</div></BottomSheet>
  <BottomSheet open={whyOpen} onClose={()=>setWhyOpen(false)} title="Why you’re seeing this"><div className="sg2-why">{rankingReasons.map(reason=><div key={reason.type}><strong>{reason.label}</strong></div>)}{feedMode==='for-you'&&<div className="sg2-why-actions"><button onClick={()=>feedback('more_like_this')}>More like this</button><button onClick={()=>feedback('less_like_this')}>Less like this</button></div>}</div></BottomSheet>
  <BottomSheet open={sourcesOpen} onClose={()=>setSourcesOpen(false)} title="Source context"><div className="sg2-source-evidence">{storyEntries.length?storyEntries.map(({member,channel:source})=>{const url=telegramPostUrl(source,member.messageId);return <article key={`${member.channelId}:${member.messageId}`}><SourceAvatar channel={source}/><div><strong>{source.title}</strong><p>{clip(member.text,200)||'Media object'}</p></div>{url&&<a href={url} target="_blank" rel="noreferrer">Open</a>}</article>}):<p>Supporting source messages are not available for this object.</p>}</div></BottomSheet>
  <BottomSheet open={moreOpen} onClose={()=>setMoreOpen(false)} title="Post options"><div className="sg2-option-list"><button onClick={()=>{setMoreOpen(false);setWhyOpen(true)}}><EyeIcon/><span><strong>Why you’re seeing this</strong><small>See the signals behind this object</small></span></button>{storySources>1&&<button onClick={()=>{setMoreOpen(false);setSourcesOpen(true)}}><MessageIcon/><span><strong>Inspect sources</strong><small>Review the Telegram context behind this object</small></span></button>}<button onClick={()=>{onFavoriteSource(channel);setMoreOpen(false)}}><BookmarkIcon/><span><strong>{favoriteSource?'Remove favorite':'Favorite source'}</strong><small>Adjust how easy this source is to find</small></span></button>{item.unread&&<button onClick={()=>{onRead(item);setMoreOpen(false)}}><EyeIcon/><span><strong>Mark read in Supergram</strong><small>Does not change Telegram read receipts</small></span></button>}<button onClick={()=>{save();setMoreOpen(false)}}><BookmarkIcon/><span><strong>{item.saved?'Remove from Saved':'Save in Supergram'}</strong><small>Your Supergram save is separate from Telegram Saved Messages</small></span></button>{!item.noForwards&&<button onClick={()=>{setMoreOpen(false);void openShare()}}><SendIcon/><span><strong>Forward</strong><small>Send the original object through Telegram</small></span></button>}{feedMode==='for-you'&&<button onClick={()=>{onHideSource(channel);setMoreOpen(false)}}><LockIcon/><span><strong>Mute source in For You</strong><small>Keep it out of recommendations on this device</small></span></button>}<button onClick={()=>{onHidePost(item);setMoreOpen(false)}}><EyeIcon/><span><strong>Hide this object</strong><small>Remove it from Supergram on this device</small></span></button>{telegramPostUrl(channel,item.messageId)&&<a href={telegramPostUrl(channel,item.messageId)!} target="_blank" rel="noreferrer"><MessageIcon/><span><strong>Open in Telegram</strong><small>View the original source</small></span></a>}</div></BottomSheet>
 </article>
}
