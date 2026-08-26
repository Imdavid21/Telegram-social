const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length'
])

const RESPONSE_STRIP = new Set([
  ...HOP_BY_HOP,
  'set-cookie',
  'content-encoding',
  'etag',
  'last-modified'
])

const summaryCache = new Map()

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '')
}

function copyRequestHeaders(req) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (HOP_BY_HOP.has(key.toLowerCase()) || value == null) continue
    if (Array.isArray(value)) headers.set(key, value.join(', '))
    else headers.set(key, String(value))
  }
  headers.set('accept-encoding', 'identity')
  headers.delete('if-none-match')
  headers.delete('if-modified-since')
  headers.delete('if-match')
  headers.delete('if-unmodified-since')
  return headers
}

function copyResponseHeaders(upstream, res) {
  for (const [key, value] of upstream.headers.entries()) {
    if (RESPONSE_STRIP.has(key.toLowerCase())) continue
    res.setHeader(key, value)
  }

  const cookies = typeof upstream.headers.getSetCookie === 'function'
    ? upstream.headers.getSetCookie()
    : upstream.headers.get('set-cookie')
      ? [upstream.headers.get('set-cookie')]
      : []

  if (cookies.length) res.setHeader('set-cookie', cookies)
}

function clientErrorPayload(body) {
  const source = body && typeof body === 'object' ? body : {}
  return {
    kind: String(source.kind || 'client').slice(0, 32),
    message: String(source.message || 'Unknown client error').slice(0, 800),
    stack: String(source.stack || '').slice(0, 5000),
    path: String(source.path || '/').slice(0, 300)
  }
}

function jsonError(res, status, message) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'private, no-store, max-age=0')
  return res.end(JSON.stringify({ error: message }))
}

function fallbackSummary(text) {
  const clean = String(text || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim()
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean)
  const headline = String(sentences[0] || clean).replace(/[.!?]+$/, '').slice(0, 110)
  const body = String(sentences.slice(1, 3).join(' ') || clean).slice(0, 280)
  return { headline, summary: body, model: 'fallback', ml: false }
}

async function summarizeWithModel(text) {
  const key = String(process.env.OPENAI_API_KEY || '')
  if (!key) return fallbackSummary(text)

  const model = String(process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini')
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 160,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Summarize a Telegram message as a compact news brief. Return JSON with headline and summary. Headline: maximum 12 words. Summary: 1 to 2 sentences, factual, no hype, no invented information. Preserve concrete names, dates, numbers, deadlines, risks, and calls to action when present.'
        },
        { role: 'user', content: String(text || '').slice(0, 7000) }
      ]
    }),
    signal: AbortSignal.timeout(20_000)
  })

  if (!response.ok) throw new Error(`ML summary failed (${response.status})`)
  const payload = await response.json()
  const raw = payload?.choices?.[0]?.message?.content || '{}'
  const parsed = JSON.parse(raw)
  return {
    headline: String(parsed?.headline || '').trim().slice(0, 140),
    summary: String(parsed?.summary || '').trim().slice(0, 420),
    model,
    ml: true
  }
}

async function handleSummary(req, res) {
  if (String(req.method || '').toUpperCase() !== 'POST') return jsonError(res, 405, 'Method not allowed.')
  const text = String(req.body?.text || '').trim()
  if (text.length < 40) return jsonError(res, 400, 'Message is too short to summarize.')
  if (text.length > 12_000) return jsonError(res, 413, 'Message is too long to summarize.')

  const key = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(buffer => Buffer.from(buffer).toString('hex'))
  const cached = summaryCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    res.statusCode = 200
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'private, max-age=3600')
    return res.end(JSON.stringify(cached.value))
  }

  let result
  try {
    result = await summarizeWithModel(text)
  } catch (error) {
    console.error('ML summary inference failed', String(error?.message || error))
    result = fallbackSummary(text)
  }

  summaryCache.set(key, { value: result, expiresAt: Date.now() + 6 * 60 * 60 * 1000 })
  if (summaryCache.size > 500) summaryCache.delete(summaryCache.keys().next().value)

  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'private, max-age=3600')
  return res.end(JSON.stringify(result))
}

export default async function handler(req, res) {
  const rawPath = Array.isArray(req.query?.path) ? req.query.path.join('/') : String(req.query?.path || '')

  if (rawPath === 'client-error' && String(req.method || '').toUpperCase() === 'POST') {
    console.error('Supergram client error', clientErrorPayload(req.body))
    res.statusCode = 204
    res.setHeader('cache-control', 'no-store')
    return res.end()
  }

  if (rawPath === 'summarize') return handleSummary(req, res)

  const backend = normalizeBaseUrl(process.env.TELEGRAM_BACKEND_URL)
  const proxySecret = String(process.env.BACKEND_PROXY_SECRET || '')

  if (!backend) return jsonError(res, 503, 'Telegram backend URL is not configured in Vercel.')
  if (proxySecret.length < 32) return jsonError(res, 503, 'Backend proxy secret is not configured in Vercel.')

  const targetUrl = new URL(`${backend}/api/${rawPath}`)

  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === 'path') continue
    if (Array.isArray(value)) value.forEach(v => targetUrl.searchParams.append(key, String(v)))
    else if (value != null) targetUrl.searchParams.append(key, String(value))
  }

  const headers = copyRequestHeaders(req)
  headers.set('x-tgs-proxy-secret', proxySecret)
  headers.set('x-forwarded-host', String(req.headers.host || ''))
  headers.set('x-forwarded-proto', 'https')

  let body
  if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) {
    if (req.body !== undefined && req.body !== null) {
      if (Buffer.isBuffer(req.body) || typeof req.body === 'string') body = req.body
      else body = JSON.stringify(req.body)
    }
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000)
    })

    if (upstream.status === 304) {
      console.error('Unexpected conditional Telegram backend response', { path: rawPath })
      return jsonError(res, 502, 'Telegram backend returned an empty conditional response.')
    }

    const contentType = String(upstream.headers.get('content-type') || '')
    const buffer = Buffer.from(await upstream.arrayBuffer())

    res.statusCode = upstream.status
    copyResponseHeaders(upstream, res)

    if (contentType.includes('application/json')) {
      let parsed
      try {
        parsed = buffer.length ? JSON.parse(buffer.toString('utf8')) : {}
      } catch (error) {
        console.error('Invalid JSON from Telegram backend', {
          path: rawPath,
          status: upstream.status,
          bytes: buffer.length,
          contentEncoding: upstream.headers.get('content-encoding'),
          error: String(error?.message || error)
        })
        return jsonError(res, 502, 'Telegram backend returned malformed JSON.')
      }

      if (rawPath === 'feed') {
        console.log('Telegram feed proxy payload', {
          status: upstream.status,
          bytes: buffer.length,
          channels: Array.isArray(parsed?.channels) ? parsed.channels.length : null,
          feed: Array.isArray(parsed?.feed) ? parsed.feed.length : null,
          keys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : []
        })
      }

      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'private, no-store, max-age=0')
      return res.end(JSON.stringify(parsed))
    }

    return res.end(buffer)
  } catch (error) {
    console.error('Telegram backend proxy failed', { path: rawPath, error: String(error?.message || error) })
    return jsonError(res, 502, 'Telegram backend is unreachable.')
  }
}
