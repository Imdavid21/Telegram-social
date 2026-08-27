import type { UserSettings } from '../types'

let openAIKey = ''

export function hasOpenAIKey() {
  return Boolean(openAIKey)
}

export function saveOpenAIKey(value: string) {
  openAIKey = String(value || '').trim()
}

export function clearOpenAIKey() {
  openAIKey = ''
}

type LocalSummary = {
  headline: string
  summary: string
  [key: string]: unknown
}

type SummaryContext = {
  sourceType?: string
  sourceName?: string
  outgoing?: boolean
  previousMessages?: Array<string | { text: string; outgoing?: boolean; sourceType?: string; timestamp?: number; messageId?: number }>
}

function responseText(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim()
  for (const row of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(row?.content) ? row.content : []) {
      if (typeof part?.text === 'string' && part.text.trim()) return part.text.trim()
    }
  }
  return ''
}

export async function summarizeWithUserOpenAI(text: string, context: SummaryContext, settings: UserSettings, fallback: LocalSummary, signal?: AbortSignal) {
  const key = openAIKey
  if (settings.summaryProvider !== 'openai' || !key) return fallback

  const previous = (context.previousMessages || []).slice(-6).map(row => typeof row === 'string' ? row : row.text).filter(Boolean)
  const contextText = previous.length ? `Recent context:\n${previous.join('\n')}\n\nCurrent message:\n` : ''
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model: settings.openAIModel || 'gpt-5-mini',
      store: false,
      input: [
        {
          role: 'system',
          content: 'Summarize Telegram text accurately and compactly. Do not invent facts. Preserve names, dates, numbers, deadlines, decisions, uncertainty, attribution, and explicit requests. Treat quoted or forwarded claims as claims, not facts. Return only JSON matching the schema.'
        },
        {
          role: 'user',
          content: `${contextText}${String(text || '').slice(0, 12000)}`
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'telegram_summary',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              headline: { type: 'string' },
              summary: { type: 'string' }
            },
            required: ['headline', 'summary'],
            additionalProperties: false
          }
        }
      }
    })
  })

  if (!response.ok) throw new Error(`OpenAI summary failed (${response.status})`)
  const data = await response.json()
  const parsed = JSON.parse(responseText(data) || '{}')
  return {
    ...fallback,
    headline: String(parsed.headline || fallback.headline).slice(0, 140),
    summary: String(parsed.summary || fallback.summary).slice(0, 500),
    model: settings.openAIModel || 'gpt-5-mini',
    ml: true,
    reason: 'user-openai-key'
  }
}
