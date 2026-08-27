import type { UserSettings } from '../types'
import { buildTelegramSummary } from './telegramSummary'
const KEY='supergram.openai.session-key'
export function hasOpenAIKey(){try{return Boolean(sessionStorage.getItem(KEY))}catch{return false}}
export function saveOpenAIKey(value:string){try{sessionStorage.setItem(KEY,value)}catch{}}
export function clearOpenAIKey(){try{sessionStorage.removeItem(KEY)}catch{}}
function getKey(){try{return sessionStorage.getItem(KEY)||''}catch{return ''}}
export async function summarizeWithUserOpenAI(text:string,context:Parameters<typeof buildTelegramSummary>[1],settings:UserSettings,signal?:AbortSignal){
 const key=getKey(); if(settings.summaryProvider!=='openai'||!key)return buildTelegramSummary(text,context)
 const local=buildTelegramSummary(text,context)
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal,headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model:settings.openAIModel||'gpt-5-mini',store:false,input:[{role:'system',content:'Summarize this Telegram text accurately and compactly. Do not invent facts. Preserve names, dates, numbers, deadlines, decisions, uncertainty, and explicit requests. Return only JSON with headline and summary strings.'},{role:'user',content:text.slice(0,12000)}],text:{format:{type:'json_schema',name:'telegram_summary',strict:true,schema:{type:'object',properties:{headline:{type:'string'},summary:{type:'string'}},required:['headline','summary'],additionalProperties:false}}}})})
 if(!response.ok)throw new Error(`OpenAI summary failed (${response.status})`)
 const data=await response.json(); const raw=String(data?.output_text||data?.output?.[0]?.content?.[0]?.text||'{}'); const parsed=JSON.parse(raw)
 return {...local,headline:String(parsed.headline||local.headline).slice(0,140),summary:String(parsed.summary||local.summary).slice(0,500),model:settings.openAIModel||'gpt-5-mini',ml:true,reason:'user-openai-key'} as any
}
