import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT || 3000)
const BACKEND_ORIGIN = String(process.env.BACKEND_ORIGIN || '').replace(/\/$/, '')
const BACKEND_PROXY_SECRET = String(process.env.BACKEND_PROXY_SECRET || '')
const root = fileURLToPath(new URL('../dist/', import.meta.url))

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

function proxy(req, res) {
  if (!BACKEND_ORIGIN) {
    res.writeHead(503, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Railway backend is not configured.' }))
  }

  const target = new URL(req.url || '/', BACKEND_ORIGIN)
  const headers = { ...req.headers, host: target.host }
  if (BACKEND_PROXY_SECRET) headers['x-backend-proxy-secret'] = BACKEND_PROXY_SECRET
  delete headers['content-length']

  const upstream = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || 80,
    method: req.method,
    path: `${target.pathname}${target.search}`,
    headers
  }, upstreamRes => {
    const responseHeaders = { ...upstreamRes.headers }
    responseHeaders['cache-control'] ||= 'no-store'
    res.writeHead(upstreamRes.statusCode || 502, responseHeaders)
    upstreamRes.pipe(res)
  })

  upstream.on('error', error => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: `Backend proxy failed: ${error.message}` }))
  })
  req.pipe(upstream)
}

function serveFile(path, res) {
  const type = mime[extname(path).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, {
    'content-type': type,
    'cache-control': path.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable'
  })
  createReadStream(path).pipe(res)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  if (url.pathname.startsWith('/api/')) return proxy(req, res)

  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '')
  const candidate = join(root, relative || 'index.html')
  if (candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()) return serveFile(candidate, res)

  const index = join(root, 'index.html')
  if (existsSync(index)) return serveFile(index, res)
  res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('Supergram frontend build not found.')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Supergram Railway frontend listening on 0.0.0.0:${PORT}`)
  console.log(`Internal API proxy: ${BACKEND_ORIGIN ? 'configured' : 'missing'}`)
})
