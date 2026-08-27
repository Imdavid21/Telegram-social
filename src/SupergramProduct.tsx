import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Channel, FeedItem, FeedPage, FeedUpdate, TelegramAccount, TelegramSearchResponse, UserSettings } from './types'
import { authStatus, fetchFeed, fetchFeedUpdates, logoutTelegram, searchTelegram } from './lib/api'
import { loadFavorites, loadHiddenPosts, loadHiddenSources, loadSet, loadSettings, recordViewerAction, saveFavorites, saveHiddenPosts, saveHiddenSources, saveSet, saveSettings } from './lib/storage'
import { normalizeFeedObject } from './product/feedObjects'
import { FeedCard } from './components/FeedCard'
import { VirtualFeed } from './components/VirtualFeed'
import { SourceBrowser } from './components/SourceBrowser'
import { SettingsDialog } from './components/SettingsDialog'
import { SocialComposer } from './components/SocialComposer'
import { SavedCollections } from './components/SavedCollections'
import { BrandMark } from './components/BrandMark'
import { HomeBrief } from './components/product/HomeBrief'
import { ExploreSurface } from './components/product/ExploreSurface'
import { PulseSurface } from './components/product/PulseSurface'
import { ProfileSurface } from './components/product/ProfileSurface'
import { BookmarkIcon, CloseIcon, HomeIcon, ImageIcon, MessageIcon, SearchIcon, SendIcon, SettingsIcon } from './components/Icons'

const PAGE_SIZE=40
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
type Destination='home'|'explore'|'pulse'|'profile'
type HomeMode='for-you'|'following'|'groups'

function initials(value?:string){return String(value||'SG').split(/\s+/).filter(Boolean).slice(0,2).map(row=>row[0]?.toUpperCase()).join('')||'SG'}
function mergeChannels(current:Channel[],incoming:Channel[]){const map=new Map(current.map(row=>[row.id,row]));for(const row of incoming||[])if(row?.id)map.set(row.id,{...map.get(row.id),...row});return [...map.values()]}
function mergeFeed(current:FeedItem[],incoming:FeedItem[]){const map=new Map(current.map(row=>[row.id,row]));const saved=loadSet('saved');const read=loadSet('read');for(const row of incoming||[]){if(!row?.id)continue;const old=map.get(row.id);map.set(row.id,{...old,...row,text:String(row.text||''),reactions:Array.isArray(row.reactions)?row.reactions:[],saved:old?.saved??saved.has(row.id)||Boolean(row.saved),unread:old?.unread===false||read.has(row.id)?false:Boolean(row.unread)})}return [...map.values()].sort((a,b)=>b.timestamp-a.timestamp||b.id.localeCompare(a.id))}
function searchExcerpt(text:string){const value=String(text||'').replace(/\s+/g,' ').trim();return value.length>180?`${value.slice(0,177)}…`:value}

export default function SupergramProduct(){
  const [destination,setDestination]=useState<Destination>('home')
  const [homeMode,setHomeMode]=useState<HomeMode>('for-you')
  const [account,setAccount]=useState<TelegramAccount|null>(null)
  const [channels,setChannels]=useState<Channel[]>([])
  const [feed,setFeed]=useState<FeedItem[]>([])
  const [settings,setSettings]=useState<UserSettings>(()=>loadSettings())
  const [favorites,setFavorites]=useState<Set<string>>(()=>loadFavorites())
  const [hiddenSources,setHiddenSources]=useState<Set<string>>(()=>loadHiddenSources())
  const [hiddenPosts,setHiddenPosts]=useState<Set<string>>(()=>loadHiddenPosts())
  const [sourceFilter,setSourceFilter]=useState<string|null>(null)
  const [sourceBrowserOpen,setSourceBrowserOpen]=useState(false)
  const [settingsOpen,setSettingsOpen]=useState(false)
  const [composerOpen,setComposerOpen]=useState(false)
  const [savedOpen,setSavedOpen]=useState(false)
  const [searchOpen,setSearchOpen]=useState(false)
  const [query,setQuery]=useState('')
  const [remoteSearch,setRemoteSearch]=useState<TelegramSearchResponse|null>(null)
  const [searchBusy,setSearchBusy]=useState(false)
  const [searchError,setSearchError]=useState('')
  const [loading,setLoading]=useState(true)
  const [loadingMore,setLoadingMore]=useState(false)
  const [hasMore,setHasMore]=useState(false)
  const [nextCursor,setNextCursor]=useState<string|null>(null)
  const [error,setError]=useState('')
  const [queued,setQueued]=useState<FeedItem[]>([])
  const [rankingRevision,setRankingRevision]=useState(0)
  const syncToken=useRef(0)
  const feedRef=useRef<FeedItem[]>([])
  const sentinel=useRef<HTMLDivElement>(null)
  const searchInput=useRef<HTMLInputElement>(null)
  const searchAbort=useRef<AbortController|null>(null)

  const channelMap=useMemo(()=>new Map(channels.map(row=>[row.id,row])),[channels])
  const objects=useMemo(()=>feed.flatMap(item=>{const source=channelMap.get(item.channelId);return source?[normalizeFeedObject(item,source)]:[]}),[feed,channelMap])
  const unread=feed.reduce((sum,row)=>sum+(row.unread?1:0),0)
  const savedItems=feed.filter(row=>row.saved)

  useEffect(()=>{feedRef.current=feed},[feed])
  useEffect(()=>{void bootstrap()},[])
  useEffect(()=>{if(searchOpen)window.setTimeout(()=>searchInput.current?.focus(),40);else searchAbort.current?.abort()},[searchOpen])

  function applyPage(page:FeedPage,replace=false){setChannels(current=>replace?mergeChannels([],page.channels):mergeChannels(current,page.channels));setFeed(current=>replace?mergeFeed([],page.feed):mergeFeed(current,page.feed));setNextCursor(page.nextCursor);setHasMore(page.hasMore);syncToken.current=Math.max(syncToken.current,page.syncToken)}
  async function bootstrap(){setLoading(true);setError('');try{const status=await authStatus();if(!status.connected){location.href='/';return}setAccount(status.user||null);applyPage(await fetchFeed(null,PAGE_SIZE),true)}catch(e){setError(String((e as Error)?.message||'Could not load your world.'))}finally{setLoading(false)}}
  async function refresh(){try{const page=await fetchFeed(null,PAGE_SIZE);const ids=new Set(feedRef.current.map(row=>row.id));const fresh=page.feed.filter(row=>!ids.has(row.id));const existing=page.feed.filter(row=>ids.has(row.id));setChannels(current=>mergeChannels(current,page.channels));setFeed(current=>mergeFeed(current,existing));if(fresh.length&&window.scrollY>420)setQueued(current=>mergeFeed(current,fresh));else if(fresh.length)setFeed(current=>mergeFeed(current,fresh));setNextCursor(page.nextCursor);setHasMore(page.hasMore);syncToken.current=Math.max(syncToken.current,page.syncToken)}catch(e){setError(String((e as Error)?.message||'Could not refresh.'))}}
  const loadMore=useCallback(async()=>{if(!hasMore||!nextCursor||loadingMore)return;setLoadingMore(true);try{applyPage(await fetchFeed(nextCursor,PAGE_SIZE))}catch{setError('Could not load older activity.')}finally{setLoadingMore(false)}},[hasMore,nextCursor,loadingMore])
  useEffect(()=>{const el=sentinel.current;if(!el||!hasMore)return;const observer=new IntersectionObserver(rows=>{if(rows.some(row=>row.isIntersecting))void loadMore()},{rootMargin:'1400px'});observer.observe(el);return()=>observer.disconnect()},[hasMore,loadMore])

  useEffect(()=>{const controller=new AbortController();let active=true;const loop=async()=>{while(active&&!controller.signal.aborted){try{const result=await fetchFeedUpdates(syncToken.current,controller.signal);syncToken.current=Math.max(syncToken.current,Number(result.syncToken||0));if(result.updates?.length){const sourceRows=result.updates.flatMap(row=>row.type==='source'?[row.source]:row.type==='upsert'&&row.source?[row.source]:[]);if(sourceRows.length)setChannels(current=>mergeChannels(current,sourceRows));const deleted=result.updates.filter((row):row is Extract<FeedUpdate,{type:'delete'}>=>row.type==='delete');const upserts=result.updates.filter((row):row is Extract<FeedUpdate,{type:'upsert'}>=>row.type==='upsert');if(deleted.length)setFeed(current=>current.filter(item=>!deleted.some(row=>row.messageIds.includes(item.messageId)&&(!row.sourceId||row.sourceId===item.channelId))));if(upserts.length){const ids=new Set(feedRef.current.map(row=>row.id));const old=upserts.filter(row=>ids.has(row.post.id)).map(row=>row.post);const fresh=upserts.filter(row=>!ids.has(row.post.id)).map(row=>row.post);if(old.length)setFeed(current=>mergeFeed(current,old));if(fresh.length&&window.scrollY>420)setQueued(current=>mergeFeed(current,fresh));else if(fresh.length)setFeed(current=>mergeFeed(current,fresh))}}}catch{if(!active||controller.signal.aborted)break;await wait(2500)}}};void loop();return()=>{active=false;controller.abort()}},[])

  const visible=useMemo(()=>feed.filter(item=>{const source=channelMap.get(item.channelId);if(!source||hiddenPosts.has(item.id)||hiddenSources.has(source.id))return false;if(sourceFilter&&item.channelId!==sourceFilter)return false;if(homeMode==='groups'&&source.type!=='group')return false;if(homeMode==='for-you'&&!settings.includePrivateChatsInForYou&&source.type==='person')return false;if(item.outgoing&&(source.type==='person'||source.type==='group'))return false;return true}),[feed,channelMap,hiddenPosts,hiddenSources,sourceFilter,homeMode,settings.includePrivateChatsInForYou])

  function toggleSave(item:FeedItem){const next=!item.saved;setFeed(current=>current.map(row=>row.id===item.id?{...row,saved:next}:row));const saved=loadSet('saved');next?saved.add(item.id):saved.delete(item.id);saveSet('saved',saved)}
  function markRead(item:FeedItem){if(!item.unread)return;setFeed(current=>current.map(row=>row.id===item.id?{...row,unread:false}:row));const read=loadSet('read');read.add(item.id);saveSet('read',read)}
  function toggleFavorite(source:Channel){setFavorites(current=>{const next=new Set(current);next.has(source.id)?next.delete(source.id):next.add(source.id);saveFavorites(next);return next})}
  function hideSource(source:Channel){setHiddenSources(current=>{const next=new Set(current);next.add(source.id);saveHiddenSources(next);return next})}
  function hidePost(item:FeedItem){setHiddenPosts(current=>{const next=new Set(current);next.add(item.id);saveHiddenPosts(next);return next})}
  function feedback(item:FeedItem,type:'more_like_this'|'less_like_this'){recordViewerAction({type,itemId:item.id,channelId:item.channelId,timestamp:Date.now(),media:Boolean(item.media)});setRankingRevision(value=>value+1)}
  function openSource(id:string){setSourceFilter(id);setDestination('home');setSourceBrowserOpen(false);requestAnimationFrame(()=>scrollTo({top:0,behavior:'smooth'}))}
  function openTopic(name:string){setQuery(name);setDestination('explore');setSearchOpen(true)}
  function updateSettings(next:UserSettings){setSettings(next);saveSettings(next);setRankingRevision(value=>value+1)}
  async function runSearch(){const value=query.trim();if(value.length<2)return;searchAbort.current?.abort();const controller=new AbortController();searchAbort.current=controller;setSearchBusy(true);setSearchError('');try{setRemoteSearch(await searchTelegram(value,{limit:50},controller.signal))}catch(e){if(!controller.signal.aborted)setSearchError(String((e as Error)?.message||'Search failed.'))}finally{if(searchAbort.current===controller)setSearchBusy(false)}}
  async function logout(){await logoutTelegram().catch(()=>{});location.href='/'}

  const openModal=(target:'search'|'sources'|'settings'|'composer'|'saved')=>{setSearchOpen(target==='search');setSourceBrowserOpen(target==='sources');setSettingsOpen(target==='settings');setComposerOpen(target==='composer');setSavedOpen(target==='saved')}

  if(loading)return <main className="sg2-loading" aria-busy="true"><BrandMark/><strong>Building your feed</strong><span>Finding people · Understanding groups · Finding topics</span></main>

  return <div className="sg2-app">
    <aside className="sg2-nav"><a className="sg2-brand" href="/" aria-label="Supergram"><BrandMark/><strong>Supergram</strong></a><nav aria-label="Primary navigation">
      <button className={destination==='home'?'is-active':''} onClick={()=>setDestination('home')}><HomeIcon/><span>Home</span></button>
      <button className={destination==='explore'?'is-active':''} onClick={()=>setDestination('explore')}><SearchIcon/><span>Explore</span></button>
      <button className="sg2-create" onClick={()=>openModal('composer')}><SendIcon/><span>Create</span></button>
      <button className={destination==='pulse'?'is-active':''} onClick={()=>setDestination('pulse')}><span className="sg2-pulse-icon">◌</span><span>Pulse</span>{unread>0&&<b>{unread>99?'99+':unread}</b>}</button>
      <button className={destination==='profile'?'is-active':''} onClick={()=>setDestination('profile')}><span className="sg2-me">{account?.avatar?<img src={account.avatar} alt=""/>:initials(account?.firstName)}</span><span>Profile</span></button>
    </nav><div className="sg2-nav-bottom"><button onClick={()=>openModal('saved')}><BookmarkIcon/><span>Saved</span></button><button onClick={()=>openModal('settings')}><SettingsIcon/><span>Settings</span></button></div></aside>

    <main className="sg2-main"><header className="sg2-topbar"><a className="sg2-mobile-brand" href="/"><BrandMark/><strong>Supergram</strong></a><div className="sg2-top-actions"><button onClick={()=>openModal('search')} aria-label="Search"><SearchIcon/></button><button onClick={()=>openModal('sources')} aria-label="Telegram conversations"><MessageIcon/>{unread>0&&<i/>}</button></div></header>
      {error&&<div className="sg2-error" role="alert"><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss"><CloseIcon/></button></div>}
      {destination==='home'&&<section className="sg2-home"><div className="sg2-home-tabs" role="tablist"><button className={homeMode==='for-you'?'is-active':''} onClick={()=>setHomeMode('for-you')}>For You</button><button className={homeMode==='following'?'is-active':''} onClick={()=>setHomeMode('following')}>Following</button><button className={homeMode==='groups'?'is-active':''} onClick={()=>setHomeMode('groups')}>Groups</button>{sourceFilter&&<button className="sg2-source-chip" onClick={()=>setSourceFilter(null)}>{channelMap.get(sourceFilter)?.title||'Source'} ×</button>}</div>
        <HomeBrief objects={objects} onCatchUp={()=>{setHomeMode('groups');scrollTo({top:0,behavior:'smooth'})}} onTopic={openTopic}/>
        {queued.length>0&&<button className="sg2-new" onClick={()=>{setFeed(current=>mergeFeed(current,queued));setQueued([]);scrollTo({top:0,behavior:'smooth'})}}>{queued.length} new updates</button>}
        <section className="sg2-feed" aria-label="Personalized feed">{visible.length?<VirtualFeed items={visible} mode={homeMode==='for-you'?'for-you':'latest'} favoriteSources={favorites} rankingRevision={rankingRevision} renderItem={(item,index)=>{const source=channelMap.get(item.channelId);if(!source)return null;return <FeedCard item={item} channel={source} feedMode={homeMode==='for-you'?'for-you':'latest'} favoriteSource={favorites.has(source.id)} summarizePrivateChats={settings.summarizePrivateChats} summaryContext={feed.filter(row=>row.channelId===item.channelId&&row.timestamp<item.timestamp).slice(-8).map(row=>({text:row.text,outgoing:row.outgoing,sourceType:row.sourceType,timestamp:row.timestamp,messageId:row.messageId}))} onSave={toggleSave} onRead={markRead} onFavoriteSource={toggleFavorite} onHideSource={hideSource} onHidePost={hidePost} onFeedback={feedback} onSourceOpen={row=>{setSourceBrowserOpen(true);setSourceFilter(row.id)}} onDiscussionOpen={()=>{}} index={index}/>}}/>:<div className="sg2-empty"><strong>No feed objects here yet</strong><span>Try another feed mode, clear the source filter, or refresh Telegram.</span><button onClick={()=>{setSourceFilter(null);void refresh()}}>Refresh</button></div>}<div ref={sentinel}/>{loadingMore&&<div className="sg2-feed-more">Loading earlier activity…</div>}</section>
      </section>}
      {destination==='explore'&&<ExploreSurface objects={objects} onSearch={()=>openModal('search')} onTopic={openTopic} onSource={openSource}/>} 
      {destination==='pulse'&&<PulseSurface objects={objects} onSource={openSource} onTopic={openTopic}/>} 
      {destination==='profile'&&<ProfileSurface account={account} feed={feed} channels={channels} onSettings={()=>openModal('settings')} onSaved={()=>openModal('saved')} onSource={openSource}/>} 
    </main>

    <aside className="sg2-context" aria-label="Live context"><div className="sg2-context-block"><span className="sg2-eyebrow">Right now</span><strong>{unread?`${unread} unread updates`:'Caught up'}</strong><p>{channels.filter(row=>Number(row.unread||0)>0).length} sources have unread activity.</p></div><div className="sg2-context-block"><strong>Active sources</strong>{channels.filter(row=>Number(row.unread||0)>0).sort((a,b)=>Number(b.unread||0)-Number(a.unread||0)).slice(0,5).map(source=><button key={source.id} onClick={()=>openSource(source.id)}><span>{source.avatar?<img src={source.avatar} alt=""/>:source.initials}</span><em>{source.title}</em><b>{Number(source.unread||0)>99?'99+':source.unread}</b></button>)}</div><button className="sg2-context-search" onClick={()=>openModal('search')}>Search your world <SearchIcon/></button></aside>

    <nav className="sg2-mobile-nav" aria-label="Primary navigation"><button className={destination==='home'?'is-active':''} onClick={()=>setDestination('home')}><HomeIcon/><span>Home</span></button><button className={destination==='explore'?'is-active':''} onClick={()=>setDestination('explore')}><SearchIcon/><span>Explore</span></button><button className="sg2-create" onClick={()=>openModal('composer')}><SendIcon/><span>Create</span></button><button className={destination==='pulse'?'is-active':''} onClick={()=>setDestination('pulse')}><span className="sg2-pulse-icon">◌</span><span>Pulse</span></button><button className={destination==='profile'?'is-active':''} onClick={()=>setDestination('profile')}><span className="sg2-me">{account?.avatar?<img src={account.avatar} alt=""/>:initials(account?.firstName)}</span><span>Profile</span></button></nav>

    {searchOpen&&<div className="sg2-overlay" role="dialog" aria-modal="true" aria-label="Search"><button className="sg2-scrim" onClick={()=>setSearchOpen(false)} aria-label="Close search"/><section className="sg2-search"><header><strong>Search your world</strong><button onClick={()=>setSearchOpen(false)} aria-label="Close"><CloseIcon/></button></header><label><SearchIcon/><input ref={searchInput} value={query} onChange={e=>{setQuery(e.target.value);setRemoteSearch(null);setSearchError('')}} onKeyDown={e=>{if(e.key==='Enter')void runSearch()}} placeholder="People, topics, groups, channels, media…"/></label><button className="sg2-primary" disabled={query.trim().length<2||searchBusy} onClick={()=>void runSearch()}>{searchBusy?'Searching…':'Search Telegram context'}</button>{searchError&&<p className="sg2-search-error">{searchError}</p>}{remoteSearch&&<div className="sg2-search-results"><div><strong>Telegram context</strong><span>{remoteSearch.results.length} results</span></div>{remoteSearch.results.slice(0,20).map(item=><button key={item.id} onClick={()=>{setSearchOpen(false);openSource(item.channelId)}}><strong>{channelMap.get(item.channelId)?.title||'Telegram'}</strong><p>{searchExcerpt(item.text)||(item.media?`${item.media.kind} media`:'Update')}</p></button>)}{!remoteSearch.results.length&&<p>No matches in permitted Telegram history.</p>}</div>}</section></div>}
    <SourceBrowser open={sourceBrowserOpen} channels={channels} favorites={favorites} selectedSource={sourceFilter} onClose={()=>setSourceBrowserOpen(false)} onSelect={id=>openSource(id||'')} onFavorite={toggleFavorite}/>
    <SettingsDialog open={settingsOpen} settings={settings} account={account} favoriteCount={favorites.size} hiddenSourceCount={hiddenSources.size} onClose={()=>setSettingsOpen(false)} onChange={updateSettings} onResetPersonalization={()=>{setHiddenSources(new Set());setHiddenPosts(new Set());saveHiddenSources(new Set());saveHiddenPosts(new Set())}} onLogout={()=>void logout()}/>
    <SocialComposer open={composerOpen} channels={channels} onClose={()=>setComposerOpen(false)}/>
    <SavedCollections open={savedOpen} savedItems={savedItems} onClose={()=>setSavedOpen(false)}/>
  </div>
}
