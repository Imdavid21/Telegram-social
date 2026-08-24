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
  return headers
}

function copyResponseHeaders(upstream, res) {
  for (const [key, value] of upstream.headers.entries()) {
    if (HOP_BY_HOP.has(key.toLowerCase()) || key.toLowerCase() === 'set-cookie') continue
    res.setHeader(key, value)
  }

  const cookies = typeof upstream.headers.getSetCookie === 'function'
    ? upstream.headers.getSetCookie()
    : upstream.headers.get('set-cookie')
      ? [upstream.headers.get('set-cookie')]
      : []

  if (cookies.length) res.setHeader('set-cookie', cookies)
}

export default async function handler(req, res) {
  const backend = normalizeBaseUrl(process.env.TELEGRAM_BACKEND_URL)
  const proxySecret = String(process.env.BACKEND_PROXY_SECRET || '')

  if (!backend) {
    res.statusCode = 503
    return res.end(JSON.stringify({ error: 'Telegram backend URL is not configured in Vercel.' }))
  }
  if (proxySecret.length < 32) {
    res.statusCode = 503
    return res.end(JSON.stringify({ error: 'Backend proxy secret is not configured in Vercel.' }))
  }

  const incomingUrl = new URL(req.url || '/', 'https://telegram-social.local')
  const target = `${backend}${incomingUrl.pathname}${incomingUrl.search}`
  const headers = copyRequestHeaders(req)
  headers.set('x-tgs-proxy-secret', proxySecret)
  headers.set('x-forwarded-host', String(req.headers.host || ''))
  headers.set('x-forwarded-proto', 'https')

  let body
  if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) {
    if (req.body !== undefined && req.body !== null) {
      if (Buffer.isBuffer(req.body) || typeof req.body === 'string') body = req.body
      else body = JSON.stringify(req.body)
    } else {
      body = req
    }
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      duplex: body === req ? 'half' : undefined,
      signal: AbortSignal.timeout(55_000)
    })

    res.statusCode = upstream.status
    copyResponseHeaders(upstream, res)
    const buffer = Buffer.from(await upstream.arrayBuffer())
    return res.end(buffer)
  } catch (error) {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({
      error: 'Telegram backend is unreachable.',
      detail: process.env.NODE_ENV === 'development' ? String(error?.message || error) : undefined
    }))
  }
}
