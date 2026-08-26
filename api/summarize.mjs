const CACHE_TTL = 6 * 60 * 60 * 1000
const cache = new Map()

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '')
}

function clipAtWord(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= limit) return text
  const clipped = text.slice(0, limit + 1)
  const cut = clipped.lastIndexOf(' ')
  return `${(cut > limit * .65 ? clipped.slice(0, cut) : clipped.slice(0, limit)).trim()}…`
}

function localBrief(value) {
  const cleaned = String(value || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/(^|\s)@[\w_]+/g, '$1')
    .replace(/(^|\s)#[\w-]+/g, '$1')
    .replace(/[•▪◦]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return { headline: 'Telegram update', summary: '' }
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean)
  const first = sentences[0] || cleaned
  const headline = clipAtWord(first.replace(/[.!?]+$/, '').trim(), 94)
  const summary = clipAtWord(sentences.slice(1, 3).join(' ').trim() || cleaned, 230)
  return { headline, summary: summary === headline ? '' : summary }
}

function responseText(payload) {
  for (const row of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(row?.content) ? row.content : []) {
      if (typeof part?.text === 'string' && part.text.trim()) return part.text.trim()
    }
  }
  return ''
}

function parseJsonObject(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(text) } catch {}
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) } catch {}
  }
  return null
}

async function validateTelegramSession(req) {
  const backend = normalizeBaseUrl(process.env.TELEGRAM_BACKEND_URL)
  const proxySecret = String(process.env.BACKEND_PROXY_SECRET || '')
  if (!backend || proxySecret.length < 32) return false
  try {
    const upstream = await fetch(`${backend}/api/auth/status`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        cookie: String(req.headers.cookie || ''),
        'x-tgs-proxy-secret': proxySecret,
        'x-forwarded-host': String(req.headers.host || ''),
        'x-forwarded-proto': 'https'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000)
    })
    if (!upstream.ok) return false
    const data = await upstream.json().catch(() => ({}))
    return Boolean(data?.connected)
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  if (String(req.method || '').toUpperCase() !== 'POST') {
    res.setHeader('allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  if (!await validateTelegramSession(req)) return res.status(401).json({ error: 'Connect Telegram first.' })

  const text = String(req.body?.text || '').trim().slice(0, 12_000)
  if (text.length < 24) return res.status(400).json({ error: 'Message is too short to summarize.' })

  const context = {
    direction: req.body?.outgoing ? 'sent by the viewer' : 'received by the viewer',
    sourceType: String(req.body?.sourceType || 'telegram'),
    sourceName: String(req.body?.sourceName || 'Telegram').slice(0, 120)
  }
  const cacheKey = `${context.direction}|${context.sourceType}|${context.sourceName}|${text}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return res.status(200).json(cached.value)

  const fallback = localBrief(text)
  const apiKey = String(process.env.OPENAI_API_KEY || '')
  if (!apiKey) {
    const value = { ...fallback, ml: false, model: null, reason: 'model_unconfigured' }
    cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL })
    return res.status(200).json(value)
  }

  const model = String(process.env.OPENAI_SUMMARY_MODEL || 'gpt-5.4-nano')
  const instruction = [
    'Turn this Telegram message into a compact factual news brief.',
    'Return JSON only with keys headline and summary.',
    'Headline: 5 to 14 words, maximum 90 characters.',
    'Summary: 1 or 2 concise sentences, maximum 240 characters.',
    'Preserve names, numbers, dates, deadlines, links described in words, risks, launches, votes, security issues, and calls to action.',
    'Do not invent context or infer facts that are not in the message.',
    'If the message is conversational, summarize what the sender communicated rather than rewriting it as global news.',
    `Message direction: ${context.direction}. Source type: ${context.sourceType}. Source: ${context.sourceName}.`
  ].join(' ')

  try {
    const openai = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: instruction }] },
          { role: 'user', content: [{ type: 'input_text', text }] }
        ],
        max_output_tokens: 180
      }),
      signal: AbortSignal.timeout(15_000)
    })

    if (!openai.ok) {
      const errorText = await openai.text().catch(() => '')
      console.error('Summary model request failed', { status: openai.status, body: errorText.slice(0, 500) })
      return res.status(200).json({ ...fallback, ml: false, model, reason: 'model_request_failed' })
    }

    const payload = await openai.json()
    const parsed = parseJsonObject(responseText(payload))
    const headline = clipAtWord(parsed?.headline || fallback.headline, 94)
    const summary = clipAtWord(parsed?.summary || fallback.summary, 240)
    const value = { headline, summary, ml: true, model }
    cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL })
    return res.status(200).json(value)
  } catch (error) {
    console.error('Summary model request error', String(error?.message || error))
    return res.status(200).json({ ...fallback, ml: false, model, reason: 'model_request_error' })
  }
}
