import type { UserSettings } from '../types'
export type ViewerActionType = 'impression'|'dwell'|'save'|'unsave'|'open'|'skip'|'favorite_source'|'unfavorite_source'|'more_like_this'|'less_like_this'|'hide_post'|'hide_source'
export type ViewerAction = { type:ViewerActionType; itemId:string; channelId:string; timestamp:number; value?:number; media?:boolean }
export const STORAGE_KEYS = { settings:'supergram.settings', saved:'telegram.social.saved', read:'telegram.social.read', favorites:'supergram.favorites', hiddenSources:'supergram.hidden-sources', hiddenPosts:'supergram.hidden-posts', viewerActions:'telegram.social.viewer-actions' } as const
const ACTION_CAP=1200
export const DEFAULT_SETTINGS:UserSettings={feedMode:'for-you',themeMode:'system',includePrivateChatsInForYou:true,summarizePrivateChats:false,autoplay:'on',summaryProvider:'local',openAIModel:'gpt-5-mini'}
function loadStringSet(key:string):Set<string>{try{const raw=localStorage.getItem(key);const parsed=raw?JSON.parse(raw):[];return new Set(Array.isArray(parsed)?parsed.filter(v=>typeof v==='string'):[])}catch{return new Set()}}
function saveStringSet(key:string,value:Set<string>){try{localStorage.setItem(key,JSON.stringify([...value]))}catch{}}
export function loadSet(key:'saved'|'read'){return loadStringSet(STORAGE_KEYS[key])}
export function saveSet(key:'saved'|'read',value:Set<string>){saveStringSet(STORAGE_KEYS[key],value)}
export function loadFavorites(){return loadStringSet(STORAGE_KEYS.favorites)}
export function saveFavorites(value:Set<string>){saveStringSet(STORAGE_KEYS.favorites,value)}
export function loadHiddenSources(){return loadStringSet(STORAGE_KEYS.hiddenSources)}
export function saveHiddenSources(value:Set<string>){saveStringSet(STORAGE_KEYS.hiddenSources,value)}
export function loadHiddenPosts(){return loadStringSet(STORAGE_KEYS.hiddenPosts)}
export function saveHiddenPosts(value:Set<string>){saveStringSet(STORAGE_KEYS.hiddenPosts,value)}
export function loadSettings():UserSettings{try{const raw=localStorage.getItem(STORAGE_KEYS.settings);if(!raw)return DEFAULT_SETTINGS;const p=JSON.parse(raw) as Partial<UserSettings>;return{feedMode:p.feedMode==='latest'?'latest':'for-you',themeMode:p.themeMode==='light'||p.themeMode==='dark'?p.themeMode:'system',includePrivateChatsInForYou:p.includePrivateChatsInForYou!==false,summarizePrivateChats:p.summarizePrivateChats===true,autoplay:p.autoplay==='off'?'off':'on',summaryProvider:p.summaryProvider==='openai'?'openai':'local',openAIModel:typeof p.openAIModel==='string'&&p.openAIModel.trim()?p.openAIModel:'gpt-5-mini'}}catch{return DEFAULT_SETTINGS}}
export function saveSettings(value:UserSettings){try{localStorage.setItem(STORAGE_KEYS.settings,JSON.stringify(value));window.dispatchEvent(new CustomEvent('supergram:settings-changed',{detail:value}))}catch{}}
export function loadViewerActions():ViewerAction[]{try{const raw=localStorage.getItem(STORAGE_KEYS.viewerActions);const parsed=raw?JSON.parse(raw):[];if(!Array.isArray(parsed))return[];return parsed.filter(row=>row&&typeof row==='object'&&typeof row.type==='string'&&typeof row.itemId==='string'&&typeof row.channelId==='string'&&Number.isFinite(Number(row.timestamp))).slice(-ACTION_CAP)}catch{return[]}}
export function recordViewerAction(action:ViewerAction){try{const actions=loadViewerActions();localStorage.setItem(STORAGE_KEYS.viewerActions,JSON.stringify([...actions,{...action,timestamp:Number(action.timestamp||Date.now())}].slice(-ACTION_CAP)))}catch{}}
export function resetViewerPersonalization(){try{localStorage.removeItem(STORAGE_KEYS.viewerActions)}catch{}}
