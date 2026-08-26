from pathlib import Path

# FeedCard: use the Telegram-specific policy engine rather than the legacy generic brief builder.
p = Path('src/components/FeedCard.tsx')
s = p.read_text()
s = s.replace("import { buildContextualBrief, fetchShareTargets, forwardTelegramPost, replyToTelegramPost, setTelegramReaction, summarizeMessage, type ShareTarget } from '../lib/api'", "import { fetchShareTargets, forwardTelegramPost, replyToTelegramPost, setTelegramReaction, type ShareTarget } from '../lib/api'\nimport { buildTelegramSummary, summarizeTelegramMessage, type SummaryContextMessage } from '../lib/telegramSummary'")
s = s.replace("function localBrief(text: string, previousMessages: string[] = [], sourceName = ''): Brief {\n  const result = buildContextualBrief(text, { previousMessages, sourceName })", "function localBrief(text: string, previousMessages: SummaryContextMessage[] = [], sourceName = '', sourceType = 'channel'): Brief {\n  const result = buildTelegramSummary(text, { previousMessages, sourceName, sourceType })")
s = s.replace("summaryContext = [],", "summaryContext = [],")
s = s.replace("summaryContext?: string[]", "summaryContext?: SummaryContextMessage[]")
s = s.replace("const immediate = localBrief(text, summaryContext, channel.title)", "const immediate = localBrief(text, summaryContext, channel.title, item.sourceType || channel.type)")
s = s.replace("void summarizeMessage(text, {", "void summarizeTelegramMessage(text, {")
s = s.replace("{brief?.headline || localBrief(text, summaryContext, channel.title).headline}", "{brief?.headline || localBrief(text, summaryContext, channel.title, item.sourceType || channel.type).headline}")
s = s.replace("{(brief?.summary || localBrief(text, summaryContext, channel.title).summary) && <p>{brief?.summary || localBrief(text, summaryContext, channel.title).summary}</p>}", "{(brief?.summary || localBrief(text, summaryContext, channel.title, item.sourceType || channel.type).summary) && <p>{brief?.summary || localBrief(text, summaryContext, channel.title, item.sourceType || channel.type).summary}</p>}")
p.write_text(s)

# ProductApp: preserve direction, timestamp and message identity in context. Outgoing chat-side
# messages remain available for summaries but are still suppressed from standalone feed rendering.
p = Path('src/ProductApp.tsx')
s = p.read_text()
old = '''  const summaryContextById = useMemo(() => {
    const context = new Map<string, string[]>()
    const historyBySource = new Map<string, FeedItem[]>()
    for (const item of [...collapsedFeed].sort((a, b) => a.timestamp - b.timestamp)) {
      const history = historyBySource.get(item.channelId) || []
      const cutoff = item.timestamp - 7 * 24 * 60 * 60 * 1000
      context.set(item.id, history.filter(row => row.timestamp >= cutoff && String(row.text || '').trim().length >= 12).slice(-5).map(row => String(row.text || '').trim()))
      if (String(item.text || '').trim()) history.push(item)
      historyBySource.set(item.channelId, history.slice(-12))
    }
    return context
  }, [collapsedFeed])'''
new = '''  const summaryContextById = useMemo(() => {
    const context = new Map<string, Array<{ text: string; outgoing?: boolean; sourceType?: string; timestamp?: number; messageId?: number }>>()
    const historyBySource = new Map<string, FeedItem[]>()
    for (const item of [...collapsedFeed].sort((a, b) => a.timestamp - b.timestamp)) {
      const history = historyBySource.get(item.channelId) || []
      const cutoff = item.timestamp - 7 * 24 * 60 * 60 * 1000
      context.set(item.id, history
        .filter(row => row.timestamp >= cutoff && String(row.text || '').trim().length >= 8)
        .slice(-8)
        .map(row => ({ text: String(row.text || '').trim(), outgoing: Boolean(row.outgoing), sourceType: row.sourceType, timestamp: row.timestamp, messageId: row.messageId })))
      if (String(item.text || '').trim()) history.push(item)
      historyBySource.set(item.channelId, history.slice(-20))
    }
    return context
  }, [collapsedFeed])'''
if old not in s:
    raise SystemExit('summary context block not found')
s = s.replace(old, new, 1)
p.write_text(s)

# Remove legacy generic summarizer implementation from api.ts exports by delegating to the new engine.
p = Path('src/lib/api.ts')
s = p.read_text()
start = s.index('function clipLocal(value: string, limit: number) {')
end = s.index('\n\nexport type ShareTarget', start)
replacement = '''export { buildTelegramSummary as buildContextualBrief, summarizeTelegramMessage as summarizeMessage } from './telegramSummary'\n'''
s = s[:start] + replacement + s[end:]
p.write_text(s)
