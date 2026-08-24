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

  // The Vercel function buffers the upstream response. Ask Railway for identity
  // encoding so we never forward a stale gzip/br header with decompressed bytes.
  headers.set('accept-encoding', 'identity')

  // API responses are session-specific and must always have a body. Prevent a
  // browser validator from turning a feed request into an empty 304 response.
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

    // Media and other binary responses keep their MIME type, but never inherit
    // the upstream content-encoding because Node fetch may already decompress it.
    return res.end(buffer)
  } catch (error) {
    console.error('Telegram backend proxy failed', { path: rawPath, error: String(error?.message || error) })
    return jsonError(res, 502, 'Telegram backend is unreachable.')
  }
}
