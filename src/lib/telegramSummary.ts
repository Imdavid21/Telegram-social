import { loadSettings } from './storage'
import { summarizeWithUserOpenAI } from './userOpenAI'

export type SummarySourceType = 'person' | 'group' | 'channel' | 'thread' | 'story' | string
export type SummaryContextMessage = { text:string; outgoing?:boolean; sourceType?:SummarySourceType; timestamp?:number; messageId?:number }
export type TelegramSummary = {
  sourceType:SummarySourceType; headline:string; summary:string; topics:string[]; keyFacts:string[]; decisions:string[]; actionItems:string[]; questions:string[]; deadlines:string[]; entities:string[]; disagreements:string[];
  urgency:'none'|'low'|'medium'|'high'; userActionRequired:boolean; confidence:number; contextMessageIds:number[]; contextUsed:number; model:string; ml:boolean; reason:string
}

export const TELEGRAM_SUMMARY_GUIDELINES = [
  'preserve meaning over compression','never invent missing context','preserve uncertainty and attribution','surface explicit questions requests decisions deadlines and action items','do not turn opinions or marketing claims into facts','distinguish plans from confirmed events','preserve names numbers dates and qualifiers','use prior messages only as context','keep private-chat summarization opt-in','retain access to the original message'
] as const

const ACTION=/\b(must|should|need|needs|requires|required|please|can you|could you|send|share|review|approve|confirm|reply|respond|join|submit|migrate|claim|vote|pay|sign|schedule|book)\b/i
const QUESTION=/\?|\b(can you|could you|would you|do you|did you|are you|is there|when|where|why|how|what|who)\b/i
const DECISION=/\b(decided|agreed|approved|confirmed|finalized|finalised|will proceed|going with|locked in|selected|rejected|cancelled)\b/i
const DISAGREEMENT=/\b(disagree|don't agree|do not agree|against|concern|however|not convinced|push back)\b/i
const DEADLINE=/\b(today|tomorrow|tonight|eod|eow|by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}:\d{2}\s?(?:am|pm)?)\b/i
const SIGNAL=/\b(launch|launched|live|release|released|listing|listed|deadline|vote|proposal|approved|rejected|security|exploit|hack|funding|raised|partnership|acquired|migration|airdrop|snapshot|claim|confirmed|delayed|cancelled|changed|increase|decrease|meeting|call)\b/i

function clean(value:string){return String(value||'').replace(/https?:\/\/\S+/g,' ').replace(/[•▪◦]+/g,' ').replace(/(^|\s)#[\w-]+/g,'$1').replace(/\s+/g,' ').trim()}
function clip(value:string,limit:number){if(value.length<=limit)return value;const part=value.slice(0,limit+1);const cut=part.lastIndexOf(' ');return `${(cut>limit*.65?part.slice(0,cut):part.slice(0,limit)).trim()}…`}
function entitiesFrom(text:string){const hits=text.match(/\$[A-Z0-9]{2,12}|@[A-Za-z0-9_]{3,}|\b[A-Z][A-Za-z0-9.-]{2,}(?:\s+[A-Z][A-Za-z0-9.-]{2,}){0,2}\b/g)||[];return [...new Set(hits)].slice(0,8)}
function sentencesOf(text:string){return clean(text).split(/(?<=[.!?])\s+|\n+/).map(clean).filter(Boolean)}

export function buildTelegramSummary(text:string,context:{sourceType?:SummarySourceType;sourceName?:string;outgoing?:boolean;previousMessages?:Array<string|SummaryContextMessage>}={}):TelegramSummary{
  const sourceType=context.sourceType||'channel'
  const cleaned=clean(text)
  const sentences=sentencesOf(cleaned)
  const scored=sentences.map((sentence,index)=>({sentence,index,score:(index===0?1:0)+(SIGNAL.test(sentence)?4:0)+(/\d|[$₹€£%]/.test(sentence)?2:0)+(ACTION.test(sentence)?2:0)+(QUESTION.test(sentence)?1:0)})).sort((a,b)=>b.score-a.score||a.index-b.index)
  const best=scored[0]?.sentence||cleaned||'Telegram update'
  const headline=clip(best.replace(/^(final\s+notice|important|urgent|breaking|update|announcement)\s*[:\-–—]*\s*/i,'').replace(/[.!?]+$/,''),sourceType==='person'?96:104)
  const support=scored.filter(row=>row.sentence!==best).slice(0,sourceType==='group'?3:2).sort((a,b)=>a.index-b.index).map(row=>row.sentence)
  let summary=clip(support.join(' '),sourceType==='group'?240:220)
  const questions=sentences.filter(s=>QUESTION.test(s)).slice(0,4)
  const decisions=sentences.filter(s=>DECISION.test(s)).slice(0,4)
  const actionItems=sentences.filter(s=>ACTION.test(s)).slice(0,4)
  const deadlines=sentences.filter(s=>DEADLINE.test(s)).slice(0,4)
  const disagreements=sentences.filter(s=>DISAGREEMENT.test(s)).slice(0,3)
  const keyFacts=scored.filter(row=>SIGNAL.test(row.sentence)||/\d|[$₹€£%]/.test(row.sentence)).slice(0,5).map(row=>row.sentence)
  const previous=(context.previousMessages||[]).map((row,index):SummaryContextMessage=>typeof row==='string'?{text:row,messageId:index}:row).filter(row=>clean(row.text)).slice(-8)
  const userActionRequired=!context.outgoing&&(actionItems.length>0||(sourceType==='person'&&questions.length>0))
  const urgency:TelegramSummary['urgency']=/\b(urgent|asap|immediately|today|tonight|security|exploit|hack)\b/i.test(cleaned)?'high':deadlines.length||userActionRequired?'medium':SIGNAL.test(cleaned)?'low':'none'
  if(sourceType==='person'&&userActionRequired&&summary)summary=clip(`${summary} Action may be required from you.`,220)
  return {sourceType,headline,summary,topics:entitiesFrom(cleaned).slice(0,5),keyFacts,decisions,actionItems,questions,deadlines,entities:entitiesFrom(`${cleaned} ${previous.slice(-2).map(row=>row.text).join(' ')}`),disagreements,urgency,userActionRequired,confidence:cleaned?Math.min(.94,.64+sentences.length*.03):.2,contextMessageIds:previous.map(row=>Number(row.messageId||0)).filter(Boolean),contextUsed:previous.length,model:'local-policy-v2',ml:false,reason:'on-device-policy'}
}

export async function summarizeTelegramMessage(text:string,context:Parameters<typeof buildTelegramSummary>[1]={},signal?:AbortSignal){
  if(signal?.aborted)throw new DOMException('Aborted','AbortError')
  const local=buildTelegramSummary(text,context)
  const settings=loadSettings()
  if(settings.summaryProvider!=='openai')return local
  try{return await summarizeWithUserOpenAI(text,context,settings,local,signal) as TelegramSummary}catch(error){
    if(signal?.aborted||(error instanceof DOMException&&error.name==='AbortError'))throw error
    return local
  }
}
