export type SummarySourceType = 'person' | 'group' | 'channel' | 'thread' | 'story' | string

export type SummaryContextMessage = {
  text: string
  outgoing?: boolean
  sourceType?: SummarySourceType
  timestamp?: number
  messageId?: number
}

export type TelegramSummary = {
  sourceType: SummarySourceType
  headline: string
  summary: string
  topics: string[]
  keyFacts: string[]
  decisions: string[]
  actionItems: string[]
  questions: string[]
  deadlines: string[]
  entities: string[]
  disagreements: string[]
  urgency: 'none' | 'low' | 'medium' | 'high'
  userActionRequired: boolean
  confidence: number
  contextMessageIds: number[]
  contextUsed: number
  model: 'local-policy-v1'
  ml: false
  reason: 'on-device-policy'
}

// Internal policy contract. These rules are intentionally explicit so future model-backed
// summarizers can be evaluated against the same Telegram-specific behavior.
export const TELEGRAM_SUMMARY_GUIDELINES = [
  'identify source type first','use source-specific summarization','preserve meaning over compression','never invent missing context','separate facts from inference','prefer omission over uncertain claims','preserve uncertainty','preserve disagreement','resolve reply context when available','resolve pronouns only at high confidence','keep ambiguity when unresolved','treat quotes as context','distinguish forwarded material','preserve attribution','never convert one opinion into group consensus','private chats optimize for user need','surface direct questions','surface requests','surface commitments','surface deadlines','surface meeting times','surface unanswered questions','surface decisions awaiting user','surface prior user promises','deprioritize greetings','groups optimize for change decisions attention','cluster group discussion by topic','merge repetition without losing attribution','separate proposals from decisions','detect unresolved disagreement','detect action items','attach owners when explicit','retain action deadlines','identify unanswered questions','identify changes of position','suppress acknowledgements','treat agreement carefully','never claim everyone agreed without evidence','do not infer authority from volume','collapse duplicate links','mention material attachments','treat reactions as weak signals','channels optimize for what is new and why it matters','identify primary announcement','lead with development before background','prefer concrete information','remove promotional filler','preserve numbers and dates','do not casually round figures','preserve numeric qualifiers','distinguish announced from shipped','distinguish plans from confirmed events','distinguish rumours from confirmed information','preserve external attribution','do not convert marketing claims into facts','surface eligibility and restrictions','lead long channel posts with conclusion','news answers what happened first','then explain why it matters','keep supporting detail minimal','avoid generic summary openings','write useful headlines','avoid clickbait','do not manufacture urgency','do not overstate importance','keep names when required for clarity','drop handles when unnecessary','drop hashtags when unnecessary','remove tracking URLs','retain useful destination links separately','adapt length to information density','allow strong compression of repetition','allow bullets for operational conversations','avoid fixed compression ratios','one line for low information updates','two to four sentences for normal channel posts','structured bullets for multi-topic group digests','action-oriented output for private chats','chronology only when sequence matters','topic structure for long groups','avoid headline-summary duplication','never expose reasoning traces','do not repeatedly label AI summary','distinguish generated summary from original','retain access to original','expand original without losing position','allow private summary opt-out','use feedback for selection not truth','evaluate factuality separately','evaluate coverage separately','evaluate compression separately','evaluate usefulness separately','evaluate attribution separately','evaluate actionability separately','do not show outgoing private/group messages standalone','use outgoing messages as context','keep broadcast posts eligible','downweight repeated context','prioritize novelty','prioritize explicit changes','prioritize numbers dates actions status changes','final summary must state what happened what matters and whether user must act'
] as const

const STOP = new Set('the a an and or but if then than to of in on at for from by with as is are was were be been being this that these those it its they their them we our you your i my me will would can could should may might do does did have has had not no yes into over under after before about around through up down out just very more most less new latest final notice important urgent breaking update'.split(/\s+/))
const SIGNAL = /\b(launch|launched|live|release|released|listing|listed|deadline|vote|proposal|approved|rejected|security|exploit|hack|funding|raised|partnership|acquired|migration|migrate|airdrop|snapshot|claim|opens|closes|starts|ends|today|tomorrow|now|confirmed|delayed|cancelled|changed|increase|decrease|deadline|meeting|call)\b/i
const ACTION = /\b(must|should|need|needs|requires|required|please|can you|could you|send|share|review|approve|confirm|reply|respond|join|submit|migrate|claim|vote|pay|sign|schedule|book)\b/i
const QUESTION = /\?|\b(can you|could you|would you|do you|did you|are you|is there|when|where|why|how|what|who)\b/i
const DECISION = /\b(decided|agreed|approved|confirmed|finalized|finalised|will proceed|going with|locked in|selected|rejected|cancelled)\b/i
const DISAGREEMENT = /\b(disagree|don't agree|do not agree|against|concern|but i think|however|not convinced|push back)\b/i
const DEADLINE = /\b(today|tomorrow|tonight|eod|eow|by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\b\d{1,2}:\d{2}\s?(?:am|pm)?)/i

function clean(value: string) {
  return String(value || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, ' ')
    .replace(/[•▪◦]+/g, ' ')
    .replace(/(^|\s)#[\w-]+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string) {
  return clean(value).toLowerCase().match(/[$@]?[a-z0-9][a-z0-9._-]*/g)?.filter(token => token.length > 2 && !STOP.has(token)) || []
}

function overlap(a: string, b: string) {
  const x = new Set(tokens(a)); const y = new Set(tokens(b))
  if (!x.size || !y.size) return 0
  let common = 0
  for (const token of x) if (y.has(token)) common += 1
  return common / Math.max(1, Math.min(x.size, y.size))
}

function clip(value: string, limit: number) {
  if (value.length <= limit) return value
  const part = value.slice(0, limit + 1)
  const cut = part.lastIndexOf(' ')
  return `${(cut > limit * .65 ? part.slice(0, cut) : part.slice(0, limit)).trim()}…`
}

function sentenceCase(value: string) {
  const text = value.trim().replace(/^(final\s+notice|important|urgent|breaking|update|announcement)\s*[:\-–—]*\s*/i, '').replace(/[.!?]+$/, '')
  if (!text) return 'Telegram update'
  if (text === text.toUpperCase() && /[A-Z]/.test(text)) return text.toLowerCase().replace(/^./, c => c.toUpperCase()).replace(/\$[a-z0-9]+/g, m => m.toUpperCase())
  return text
}

function sourcePolicy(sourceType: SummarySourceType) {
  if (sourceType === 'person') return { maxHeadline: 96, maxSummary: 200, novelty: 4.5, actionBoost: 3, questionBoost: 2.5, decisionBoost: 1.5 }
  if (sourceType === 'group') return { maxHeadline: 100, maxSummary: 240, novelty: 4, actionBoost: 2.5, questionBoost: 1.5, decisionBoost: 3 }
  if (sourceType === 'channel') return { maxHeadline: 104, maxSummary: 220, novelty: 5, actionBoost: 1.5, questionBoost: .5, decisionBoost: 2 }
  return { maxHeadline: 102, maxSummary: 220, novelty: 4.5, actionBoost: 2, questionBoost: 1, decisionBoost: 2 }
}

function entitiesFrom(text: string) {
  const hits = text.match(/\$[A-Z0-9]{2,12}|@[A-Za-z0-9_]{3,}|\b[A-Z][A-Za-z0-9.-]{2,}(?:\s+[A-Z][A-Za-z0-9.-]{2,}){0,2}\b/g) || []
  return [...new Set(hits.filter(hit => !/^(Final|Important|Urgent|Breaking|Update|Telegram)$/i.test(hit)))].slice(0, 8)
}

export function buildTelegramSummary(text: string, context: {
  sourceType?: SummarySourceType
  sourceName?: string
  outgoing?: boolean
  previousMessages?: Array<string | SummaryContextMessage>
} = {}): TelegramSummary {
  const sourceType = context.sourceType || 'channel'
  const policy = sourcePolicy(sourceType)
  const cleaned = clean(text)
  const previous = (context.previousMessages || []).map((row, index): SummaryContextMessage => typeof row === 'string' ? { text: row, messageId: index } : row).filter(row => clean(row.text)).slice(-8)
  const priorTexts = previous.map(row => clean(row.text))
  const contextTokens = new Set(tokens(priorTexts.join(' ')))
  const sentences = cleaned.split(/(?<=[.!?])\s+|\n+/).map(clean).filter(Boolean)
  const ranked = sentences.map((sentence, index) => {
    const own = tokens(sentence)
    const novelty = own.length ? own.filter(token => !contextTokens.has(token)).length / own.length : 0
    const repeat = priorTexts.reduce((m, prior) => Math.max(m, overlap(sentence, prior)), 0)
    const score = novelty * policy.novelty + (SIGNAL.test(sentence) ? 3 : 0) + (/\d|[$₹€£%]/.test(sentence) ? 1.6 : 0) + (ACTION.test(sentence) ? policy.actionBoost : 0) + (QUESTION.test(sentence) ? policy.questionBoost : 0) + (DECISION.test(sentence) ? policy.decisionBoost : 0) + (index === 0 ? .6 : 0) - repeat * 3.5
    return { sentence, index, novelty, repeat, score }
  }).sort((a, b) => b.score - a.score || a.index - b.index)

  const best = ranked[0]?.sentence || cleaned || 'Telegram update'
  let headline = sentenceCase(best)
  const subject = entitiesFrom(`${priorTexts.slice(-3).join(' ')} ${cleaned}`)[0] || context.sourceName || ''
  if (/^(it|this|that|they|we)\b/i.test(headline) && subject) headline = `${subject}: ${headline}`
  headline = clip(headline, policy.maxHeadline)

  const support = ranked.filter(row => row.sentence !== best && row.novelty >= .25 && row.repeat < .75).slice(0, sourceType === 'group' ? 3 : 2).sort((a, b) => a.index - b.index).map(row => row.sentence)
  const repeated = priorTexts.reduce((m, prior) => Math.max(m, overlap(cleaned, prior)), 0)
  let summary = clip(support.join(' '), policy.maxSummary)
  if (!summary && repeated >= .72) summary = 'This largely repeats an earlier message from the same conversation.'

  const questions = sentences.filter(sentence => QUESTION.test(sentence)).slice(0, 4)
  const decisions = sentences.filter(sentence => DECISION.test(sentence)).slice(0, 4)
  const actionItems = sentences.filter(sentence => ACTION.test(sentence)).slice(0, 4)
  const deadlines = sentences.filter(sentence => DEADLINE.test(sentence)).slice(0, 4)
  const disagreements = sentences.filter(sentence => DISAGREEMENT.test(sentence)).slice(0, 3)
  const facts = ranked.filter(row => row.novelty >= .3 && (SIGNAL.test(row.sentence) || /\d|[$₹€£%]/.test(row.sentence))).slice(0, 5).map(row => row.sentence)
  const topics = entitiesFrom(cleaned).slice(0, 5)
  const entities = entitiesFrom(`${cleaned} ${priorTexts.slice(-2).join(' ')}`)
  const userActionRequired = !context.outgoing && (actionItems.length > 0 || (sourceType === 'person' && questions.length > 0))
  const urgency: TelegramSummary['urgency'] = /\b(urgent|asap|immediately|today|tonight|deadline|security|exploit|hack)\b/i.test(cleaned) ? 'high' : deadlines.length || userActionRequired ? 'medium' : SIGNAL.test(cleaned) ? 'low' : 'none'
  const confidence = cleaned ? Math.max(.45, Math.min(.96, .62 + Math.min(.18, sentences.length * .03) + Math.min(.12, previous.length * .02) - (repeated > .85 ? .08 : 0))) : .2

  if (sourceType === 'person' && userActionRequired && summary) summary = clip(`${summary} Action may be required from you.`, policy.maxSummary)
  if (sourceType === 'group' && decisions.length && !summary.includes(decisions[0])) summary = clip(`${summary ? `${summary} ` : ''}Decision: ${decisions[0]}`, policy.maxSummary)

  return {
    sourceType, headline, summary, topics, keyFacts: facts, decisions, actionItems, questions, deadlines, entities, disagreements,
    urgency, userActionRequired, confidence, contextMessageIds: previous.map(row => Number(row.messageId || 0)).filter(Boolean), contextUsed: previous.length,
    model: 'local-policy-v1', ml: false, reason: 'on-device-policy'
  }
}

export async function summarizeTelegramMessage(text: string, context: Parameters<typeof buildTelegramSummary>[1] = {}, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  await new Promise<void>(resolve => window.setTimeout(resolve, 0))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return buildTelegramSummary(text, context)
}
