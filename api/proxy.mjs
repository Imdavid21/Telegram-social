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

function clientErrorPayload(body) {
  const source = body && typeof body === 'object' ? body : {}
  return {
    kind: String(source.kind || 'client').slice(0, 32),
    message: String(source.message || 'Unknown client error').slice(0, 800),
    stack: String(source.stack || '').slice(0, 5000),
    path: String(source.path || '/').slice(0, 300)
  }
}

export default async function handler(req, res) {
  const rawPath = Array.isArray(req.query?.path) ? req.query.path.join('/') : String(req.query?.path || '')

  // Keep crash reporting local to Vercel so a frontend failure can be diagnosed
  // even when the Telegram backend is unreachable.
  if (rawPath === 'client-error' && String(req.method || '').toUpperCase() === 'POST') {
    console.error('Supergram client error', clientErrorPayload(req.body))
    res.statusCode = 204
    res.setHeader('cache-control', 'no-store')
    return res.end()
  }

  const backend = normalizeBaseUrl(process.env.TELEGRAM_BACKEND_URL)
  const proxySecret = String(process.env.BACKEND_PROXY_SECRET || '')

  if (!backend) {
    res.statusCode = 503
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ error: 'Telegram backend URL is not configured in Vercel.' }))
  }
  if (proxySecret.length < 32) {
    res.statusCode = 503
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ error: 'Backend proxy secret is not configured in Vercel.' }))
  }

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
      signal: AbortSignal.timeout(55_000)
    })

    res.statusCode = upstream.status
    copyResponseHeaders(upstream, res)
    const buffer = Buffer.from(await upstream.arrayBuffer())
    return res.end(buffer)
  } catch {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ error: 'Telegram backend is unreachable.' }))
  }
}
