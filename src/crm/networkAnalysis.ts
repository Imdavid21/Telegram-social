import type { NetworkContactRecord, NetworkRawMessage, NetworkCategory, NetworkClassification } from './networkCache'

export type NetworkFlag = '' | 'no reply from them' | 'you never replied' | 'mutual silence' | 'one-sided'

export type NetworkAnalysisRow = {
  telegramUserId: string
  sourceId: string
  name: string
  username: string
  usernameHistory: string
  nameHistory: string
  category: NetworkCategory
  secondaryCategory: string
  company: string
  role: string
  relationshipNote: string
  confidence: 'High' | 'Medium' | 'Low'
  messagesFromThem: number
  messagesFromMe: number
  totalMessages: number
  firstMessageAt?: Date
  lastMessageAt?: Date
  threadDurationDays: number
  flag: NetworkFlag
  cachedMessages: number
  reportedMessages: number
  coverage: 'Complete' | 'Partial' | 'Failed'
}

const DAY = 86_400_000
const CATEGORY_TERMS: Record<Exclude<NetworkCategory, 'Unknown'>, string[]> = {
  Founder: ['founder', 'cofounder', 'co-founder', 'ceo', 'founding', 'startup', 'building our', 'my company', 'our company'],
  BD: ['business development', 'partnership', 'partnerships', 'bd ', 'sales', 'commercial', 'growth lead', 'bizdev', 'deal', 'sponsor', 'sponsorship'],
  Investor: ['investor', 'investment', 'venture', 'vc ', 'fund', 'portfolio', 'angel', 'cheque', 'check size', 'round', 'term sheet'],
  Exchange: ['exchange', 'listing', 'listed token', 'cex', 'binance', 'coinbase', 'okx', 'bybit', 'kraken', 'bitget', 'gate.io'],
  'Market Maker': ['market maker', 'market-making', 'liquidity provider', 'liquidity provisioning', 'otc desk', 'quoting', 'order book liquidity'],
  Developer: ['developer', 'engineer', 'engineering', 'technical', 'sdk', 'api', 'github', 'repository', 'codebase', 'smart contract', 'solidity', 'rust'],
  KOL: ['creator', 'influencer', 'youtube', 'newsletter', 'audience', 'followers', 'content creator', 'twitter space', 'x space', 'kol'],
  Community: ['community', 'ambassador', 'moderator', 'meetup', 'event', 'hackathon', 'telegram group', 'discord', 'ecosystem community'],
  'Service Provider': ['agency', 'consulting', 'consultant', 'service provider', 'marketing agency', 'design studio', 'legal', 'recruiting', 'vendor', 'freelance'],
  Personal: ['birthday', 'dinner', 'lunch', 'gym', 'weekend', 'friend', 'family', 'bro', 'trip', 'vacation', 'personal']
}

const ROLE_TERMS = [
  'Founder', 'Co-founder', 'CEO', 'COO', 'CTO', 'CMO', 'Head of Marketing', 'Head of Growth', 'Head of BD', 'Business Development', 'Partnerships', 'Growth', 'Marketing', 'Developer Relations', 'Developer', 'Engineer', 'Investor', 'Partner', 'Principal', 'Associate', 'Community Lead', 'Community Manager', 'Market Maker', 'Trader', 'Researcher', 'Designer', 'Consultant'
]

function substantive(text: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return false
  const low = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '')
  return low.length >= 5 && !['gm', 'gn', 'hi', 'hey', 'hello', 'sup', 'thanks', 'thankyou', 'yo'].includes(low)
}

function categoryScores(text: string) {
  const lower = ` ${text.toLowerCase()} `
  const scores = Object.entries(CATEGORY_TERMS).map(([category, terms]) => ({
    category: category as Exclude<NetworkCategory, 'Unknown'>,
    score: terms.reduce((sum, term) => sum + (lower.includes(term) ? (term.includes(' ') ? 3 : 2) : 0), 0)
  }))
  return scores.sort((a, b) => b.score - a.score)
}

function extractCompany(text: string) {
  const rows = text.split(/\n|[.!?]/).map(row => row.trim()).filter(Boolean)
  for (const row of rows) {
    const match = row.match(/(?:work(?:ing)?|team|role|job)?\s*(?:at|with|from|joining|joined)\s+([A-Z][A-Za-z0-9&.'’+\- ]{1,45})/)
    if (match?.[1]) return match[1].replace(/\s+(?:and|but|where|who|for|on)\s.*$/i, '').trim().slice(0, 60)
  }
  return ''
}

function extractRole(text: string) {
  const lower = text.toLowerCase()
  const role = ROLE_TERMS.find(value => lower.includes(value.toLowerCase()))
  return role || ''
}

function relationNote(contact: NetworkContactRecord, messages: NetworkRawMessage[], classification: Pick<NetworkClassification, 'category' | 'company' | 'role'>) {
  const recent = [...messages].reverse().find(row => substantive(String(row.text || '')))
  const snippet = String(recent?.text || '').replace(/\s+/g, ' ').trim().slice(0, 130)
  const parts: string[] = []
  if (classification.role || classification.company) parts.push([classification.role, classification.company ? `at ${classification.company}` : ''].filter(Boolean).join(' '))
  if (snippet) parts.push(`Recent context: ${snippet}${String(recent?.text || '').trim().length > 130 ? '…' : ''}`)
  if (contact.nameHistory.length > 1) parts.push(`Previously named ${contact.nameHistory.at(-2)?.value}`)
  if (contact.usernameHistory.filter(row => row.value).length > 1) parts.push(`Prior username @${contact.usernameHistory.filter(row => row.value).at(-2)?.value}`)
  return parts.join('. ').slice(0, 320) || `${classification.category} relationship with limited written context.`
}

export function classifyNetworkContact(contact: NetworkContactRecord, messages: NetworkRawMessage[]): NetworkClassification {
  const textMessages = messages.map(row => String(row.text || '')).filter(substantive)
  const combined = textMessages.join('\n').slice(-50_000)
  if (textMessages.length <= 1 || messages.length <= 2) {
    return { category: 'Unknown', company: '', role: '', relationshipNote: relationNote(contact, messages, { category: 'Unknown', company: '', role: '' }), confidence: 'Low', classifiedAt: new Date().toISOString(), method: 'local' }
  }

  const scores = categoryScores(combined)
  const first = scores[0]
  const second = scores[1]
  const category: NetworkCategory = first?.score > 0 ? first.category : 'Unknown'
  let confidence: 'High' | 'Medium' | 'Low' = 'Low'
  if (category !== 'Unknown') {
    if (first.score >= 9 && first.score >= (second?.score || 0) + 4 && textMessages.length >= 8) confidence = 'High'
    else if (first.score >= 4 && textMessages.length >= 4) confidence = 'Medium'
  }
  const company = extractCompany(combined)
  const role = extractRole(combined)
  const classification: NetworkClassification = {
    category,
    secondaryCategory: second?.score >= 4 && second.category !== category ? second.category : undefined,
    company,
    role,
    relationshipNote: '',
    confidence,
    classifiedAt: new Date().toISOString(),
    method: 'local'
  }
  classification.relationshipNote = relationNote(contact, messages, classification)
  return classification
}

function activityFlag(messages: NetworkRawMessage[]): NetworkFlag {
  if (!messages.length) return ''
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp || a.messageId - b.messageId)
  const last = sorted[sorted.length - 1]
  const lastAge = Date.now() - Number(last.timestamp || 0) * 1000
  if (lastAge < 14 * DAY) return ''

  const fromMe = sorted.filter(row => row.outgoing).length
  const fromThem = sorted.length - fromMe
  const dominantShare = sorted.length ? Math.max(fromMe, fromThem) / sorted.length : 0

  if (lastAge >= 90 * DAY && sorted.length >= 6 && fromMe >= 2 && fromThem >= 2 && dominantShare < .9) return 'mutual silence'
  if (sorted.length >= 3 && dominantShare >= .9) return 'one-sided'
  return last.outgoing ? 'no reply from them' : 'you never replied'
}

export function analyzeNetworkContact(contact: NetworkContactRecord, messages: NetworkRawMessage[]): NetworkAnalysisRow {
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp || a.messageId - b.messageId)
  const fromMe = sorted.filter(row => row.outgoing).length
  const fromThem = sorted.length - fromMe
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const firstAt = first?.timestamp ? new Date(first.timestamp * 1000) : undefined
  const lastAt = last?.timestamp ? new Date(last.timestamp * 1000) : undefined
  const flag = activityFlag(sorted)
  const classification = contact.classification || classifyNetworkContact(contact, sorted)

  return {
    telegramUserId: contact.telegramUserId,
    sourceId: contact.sourceId,
    name: contact.deleted ? `Deleted Account (ID: ${contact.telegramUserId})` : contact.name,
    username: contact.username || '',
    usernameHistory: contact.usernameHistory.map(row => row.value).filter(Boolean).join(' → '),
    nameHistory: contact.nameHistory.map(row => row.value).filter(Boolean).join(' → '),
    category: classification.category,
    secondaryCategory: classification.secondaryCategory || '',
    company: classification.company,
    role: classification.role,
    relationshipNote: classification.relationshipNote,
    confidence: classification.confidence,
    messagesFromThem: fromThem,
    messagesFromMe: fromMe,
    totalMessages: sorted.length,
    firstMessageAt: firstAt,
    lastMessageAt: lastAt,
    threadDurationDays: firstAt && lastAt ? Math.max(0, Math.round((lastAt.getTime() - firstAt.getTime()) / DAY)) : 0,
    flag,
    cachedMessages: contact.sync.cachedMessages,
    reportedMessages: contact.sync.total,
    coverage: contact.sync.failed ? 'Failed' : contact.sync.complete ? 'Complete' : 'Partial'
  }
}
