import { loadSettings } from './storage'
import { hasOpenAIKey, summarizeWithUserOpenAI } from './userOpenAI'

export type SummarySourceType = 'person' | 'group' | 'channel' | 'thread' | 'story' | string
export type SummaryContextMessage = { text:string; outgoing?:boolean; sourceType?:SummarySourceType; timestamp?:number; messageId?:number }
export type TelegramSummary = {
  sourceType:SummarySourceType; headline:string; summary:string; topics:string[]; keyFacts:string[]; decisions:string[]; actionItems:string[]; questions:string[]; deadlines:string[]; entities:string[]; disagreements:string[];
  urgency:'none'|'low'|'medium'|'high'; userActionRequired:boolean; confidence:number; contextMessageIds:number[]; contextUsed:number; model:string; ml:boolean; reason:string
}

export const TELEGRAM_SUMMARY_GUIDELINES = [
  'OpenAI summaries only','preserve meaning over compression','never invent missing context','preserve uncertainty and attribution','surface explicit questions requests decisions deadlines and action items','do not turn opinions or marketing claims into facts','distinguish plans from confirmed events','preserve names numbers dates and qualifiers','use prior messages only as context','keep private-chat summarization opt-in','retain access to the original message'
] as const

type SummaryContext={sourceType?:SummarySourceType;sourceName?:string;outgoing?:boolean;previousMessages?:Array<string|SummaryContextMessage>}

export async function summarizeTelegramMessage(text:string,context:SummaryContext={},signal?:AbortSignal):Promise<TelegramSummary>{
  if(signal?.aborted)throw new DOMException('Aborted','AbortError')
  const settings=loadSettings()
  if(!settings.allowAISummaries||!hasOpenAIKey())throw new Error('OpenAI API key required')
  const result=await summarizeWithUserOpenAI(text,context,settings,signal)
  const previous=(context.previousMessages||[]).map((row,index):SummaryContextMessage=>typeof row==='string'?{text:row,messageId:index}:row).slice(-8)
  const userActionRequired=!context.outgoing&&(result.actionItems.length>0||result.questions.length>0||result.deadlines.length>0)
  const urgency:TelegramSummary['urgency']=result.deadlines.length||userActionRequired?'medium':result.keyFacts.length?'low':'none'
  return {
    sourceType:context.sourceType||'channel',headline:result.headline,summary:result.summary,topics:[],keyFacts:result.keyFacts,decisions:result.decisions,actionItems:result.actionItems,questions:result.questions,deadlines:result.deadlines,entities:[],disagreements:result.disagreements,urgency,userActionRequired,confidence:result.confidence,contextMessageIds:previous.map(row=>Number(row.messageId||0)).filter(Boolean),contextUsed:previous.length,model:settings.openAIModel||'gpt-5-mini',ml:true,reason:'user-openai-key'
  }
}
