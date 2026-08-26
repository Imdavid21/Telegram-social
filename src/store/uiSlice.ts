import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { loadSettings } from '@/lib/storage'
import type { FeedFilter, UserSettings } from '@/types'
type UIState={filter:FeedFilter;query:string;sourceFilter:string|null;searchOpen:boolean;settingsOpen:boolean;sourceBrowserOpen:boolean;discussionItemId:string|null;settings:UserSettings}
const initialState:UIState={filter:'all',query:'',sourceFilter:null,searchOpen:false,settingsOpen:false,sourceBrowserOpen:false,discussionItemId:null,settings:loadSettings()}
const slice=createSlice({name:'ui',initialState,reducers:{setFilter:(s,a:PayloadAction<FeedFilter>)=>{s.filter=a.payload},setQuery:(s,a:PayloadAction<string>)=>{s.query=a.payload},setSourceFilter:(s,a:PayloadAction<string|null>)=>{s.sourceFilter=a.payload},setSearchOpen:(s,a:PayloadAction<boolean>)=>{s.searchOpen=a.payload},setSettingsOpen:(s,a:PayloadAction<boolean>)=>{s.settingsOpen=a.payload},setSourceBrowserOpen:(s,a:PayloadAction<boolean>)=>{s.sourceBrowserOpen=a.payload},setDiscussionItemId:(s,a:PayloadAction<string|null>)=>{s.discussionItemId=a.payload},setSettings:(s,a:PayloadAction<UserSettings>)=>{s.settings=a.payload}}})
export const {setFilter,setQuery,setSourceFilter,setSearchOpen,setSettingsOpen,setSourceBrowserOpen,setDiscussionItemId,setSettings}=slice.actions
export default slice.reducer
