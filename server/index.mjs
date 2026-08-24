import crypto from 'node:crypto'
import express from 'express'
import cookieParser from 'cookie-parser'
import { TelegramClient } from 'teleproto'
import { StringSession } from 'teleproto/sessions/index.js'

const PORT = Number(process.env.PORT || 8787)
const API_ID = Number(process.env.TELEGRAM_API_ID || 0)
const API_HASH = process.env.TELEGRAM_API_HASH || ''
const SESSION_SECRET = process.env.SESSION_SECRET || ''
const BACKEND_PROXY_SECRET = process.env.BACKEND_PROXY_SECRET || ''
const PUBLIC_APP_ORIGIN = process.env.PUBLIC_APP_ORIGIN || ''
const isProd = process.env.NODE_ENV === 'production'
const configured = Boolean(API_ID && API_HASH && SESSION_SECRET.length >= 32 && (!isProd || BACKEND_PROXY_SECRET.length >= 32))

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', true)
app.use(express.json({ limit: '32kb' }))
app.use(cookieParser())

const sessionKey = crypto.createHash('sha256').update(SESSION_SECRET || 'local-development-session-secret').digest()
const SESSION_COOKIE = 'tgs_session'
const FLOW_COOKIE = 'tgs_flow'
const pending = new Map()
const clients = new Map()
const entitiesByClient = new WeakMap()
const sponsorCacheByClient = new WeakMap()
const authRate = new Map()

function timingSafeTextEqual(a, b) {
  const left = Buffer.from(String(a || ''))
  const right = Buffer.from(String(b || ''))
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function forwardedHost(req) {
  return String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim()
}

app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/ready') return next()

  if (isProd) {
    if (BACKEND_PROXY_SECRET.length < 32) return res.status(503).json({ error: 'Backend proxy is not configured.' })
    if (!timingSafeTextEqual(req.get('x-tgs-proxy-secret'), BACKEND_PROXY_SECRET)) {
      return res.status(401).json({ error: 'Unauthorized API gateway.' })
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin')
      if (origin) {
        try {
          const originUrl = new URL(origin)
          const expectedHost = forwardedHost(req)
          const explicitOrigin = PUBLIC_APP_ORIGIN ? new URL(PUBLIC_APP_ORIGIN) : null
          const matchesProxy = expectedHost && originUrl.host === expectedHost
          const matchesExplicit = explicitOrigin && originUrl.origin === explicitOrigin.origin
          if (!matchesProxy && !matchesExplicit) return res.status(403).json({ error: 'Cross-origin request blocked.' })
        } catch {
          return res.status(403).json({ error: 'Invalid origin.' })
        }
      }
    }
  }

  next()
})

function cookieOptions(httpOnly = true) {
  return {
    httpOnly,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}

function encrypt(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, ciphertext].map(part => part.toString('base64url')).join('.')
}

function decrypt(token) {
  try {
    const [ivRaw, tagRaw, dataRaw] = String(token || '').split('.')
    if (!ivRaw || !tagRaw || !dataRaw) return null
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(ivRaw, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataRaw, 'base64url')),
      decipher.final()
    ]).toString('utf8')
  } catch {
    return null
  }
}

function allowAuthAttempt(req, res) {
  const key = req.ip || req.socket?.remoteAddress || 'unknown'
  const now = Date.now()
  const windowMs = 10 * 60 * 1000
  const bucket = authRate.get(key) || { start: now, count: 0 }
  if (now - bucket.start > windowMs) {
    bucket.start = now
    bucket.count = 0
  }
  bucket.count += 1
  authRate.set(key, bucket)
  if (bucket.count > 10) {
    res.status(429).json({ error: 'Too many Telegram login attempts. Try again later.' })
    return false
  }
  return true
}

function requireConfig(res) {
  if (!configured) {
    res.status(503).json({
      error: 'Telegram backend is not fully configured. Check TELEGRAM_API_ID, TELEGRAM_API_HASH, SESSION_SECRET, and BACKEND_PROXY_SECRET.'
    })
    return false
  }
  return true
}

function notify(flow) {
  for (const wake of flow.watchers.splice(0)) wake()
}

function ask(flow, step, meta = {}) {
  flow.step = step
  flow.meta = meta
  flow.updatedAt = Date.now()
  notify(flow)
  return new Promise((resolve, reject) => {
    flow.resolveInput = resolve
    flow.rejectInput = reject
  })
}

async function waitForStepChange(flow, previous, timeout = 3500) {
  if (flow.step !== previous) return
  await Promise.race([
    new Promise(resolve => flow.watchers.push(resolve)),
    new Promise(resolve => setTimeout(resolve, timeout))
  ])
}

function publicFlow(flow) {
  return { step: flow.step, error: flow.error || null, meta: flow.meta || {} }
}

function startFlow() {
  const id = crypto.randomUUID()
  const flow = {
    id,
    step: 'starting',
    meta: {},
    error: null,
    updatedAt: Date.now(),
    watchers: [],
    resolveInput: null,
    rejectInput: null,
    client: null,
    session: null
  }
  pending.set(id, flow)

  const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, { connectionRetries: 5 })
  flow.client = client

  void client.start({
    phoneNumber: () => ask(flow, 'phone', { hint: 'Include your country code.' }),
    phoneCode: isCodeViaApp => ask(flow, 'code', { viaApp: Boolean(isCodeViaApp) }),
    password: hint => ask(flow, 'password', { hint: hint || '' }),
    onError: async err => {
      flow.error = String(err?.message || err)
      flow.updatedAt = Date.now()
      notify(flow)
      return false
    }
  }).then(() => {
    flow.session = String(client.session.save())
    flow.step = 'done'
    flow.error = null
    flow.updatedAt = Date.now()
    notify(flow)
  }).catch(err => {
    flow.step = 'error'
    flow.error = String(err?.message || err)
    flow.updatedAt = Date.now()
    notify(flow)
  })

  return flow
}

async function getClient(req) {
  if (!configured) return null
  const session = decrypt(req.cookies?.[SESSION_COOKIE])
  if (!session) return null

  const key = crypto.createHash('sha256').update(session).digest('hex')
  let entry = clients.get(key)
  if (!entry) {
    const client = new TelegramClient(new StringSession(session), API_ID, API_HASH, { connectionRetries: 5 })
    await client.connect()
    if (!await client.isUserAuthorized()) {
      await client.disconnect().catch(() => {})
      return null
    }
    entry = { client, lastUsed: Date.now() }
    clients.set(key, entry)
  }

  entry.lastUsed = Date.now()
  return entry.client
}

function compactNumber(value) {
  const n = Number(value || 0)
  if (!n) return undefined
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function accent(input) {
  const palette = ['#5BA8E9', '#65BFA6', '#E0AA52', '#9A84DC', '#D9856D', '#C87891', '#5CBDB0']
  let n = 0
  for (const char of String(input)) n = (n * 31 + char.charCodeAt(0)) | 0
  return palette[Math.abs(n) % palette.length]
}

function initials(title) {
  return String(title || 'TG').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]?.toUpperCase()).join('') || 'TG'
}

function reactions(message) {
  return (message?.reactions?.results || []).slice(0, 3).map(row => ({
    emoji: row?.reaction?.emoticon || '♥',
    count: Number(row?.count || 0)
  }))
}

function isBroadcastDialog(dialog) {
  const entity = dialog?.entity
  if (!entity) return false
  if (entity.broadcast === true) return true

  const className = String(entity.className || entity.constructor?.name || '').toLowerCase()
  const isChannelEntity = className === 'channel' || className.endsWith('.channel') || ('broadcast' in entity && 'megagroup' in entity)
  if (!isChannelEntity) return false

  return entity.megagroup !== true && entity.gigagroup !== true
}

async function getBroadcastDialogs(client) {
  const dialogs = await client.getDialogs({ limit: 250 })
  const typeCounts = {}
  for (const dialog of dialogs) {
    const entity = dialog?.entity
    const type = String(entity?.className || entity?.constructor?.name || 'unknown')
    typeCounts[type] = (typeCounts[type] || 0) + 1
  }

  const broadcastDialogs = dialogs.filter(isBroadcastDialog).slice(0, 60)
  console.log('Telegram feed discovery', {
    dialogs: dialogs.length,
    broadcastChannels: broadcastDialogs.length,
    entityTypes: typeCounts
  })
  return broadcastDialogs
}

async function getSponsoredFor(client, entity) {
  let cache = sponsorCacheByClient.get(client)
  if (!cache) {
    cache = new Map()
    sponsorCacheByClient.set(client, cache)
  }
  const id = String(entity.id)
  const cached = cache.get(id)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  try {
    const result = await client.api.messages.getSponsoredMessages({ peer: entity })
    const value = { postsBetween: Number(result?.postsBetween || 0), messages: result?.messages || [] }
    cache.set(id, { expiresAt: Date.now() + 5 * 60 * 1000, value })
    return value
  } catch {
    const value = { postsBetween: 0, messages: [] }
    cache.set(id, { expiresAt: Date.now() + 5 * 60 * 1000, value })
    return value
  }
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor++
      output[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return output
}

app.get('/', (_req, res) => {
  res.json({ service: 'telegram-social-backend', ok: true })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, configured, runtime: 'persistent-node', version: '0.2.1' })
})

app.get('/api/ready', (_req, res) => {
  if (!configured) return res.status(503).json({ ok: false, configured: false })
  res.json({ ok: true, configured: true })
})

app.get('/api/auth/status', async (req, res) => {
  if (!requireConfig(res)) return
  try {
    const client = await getClient(req)
    if (!client) return res.json({ connected: false })
    const me = await client.getMe()
    res.json({ connected: true, user: { id: String(me.id), firstName: me.firstName || '', username: me.username || '' } })
  } catch {
    res.json({ connected: false })
  }
})

app.post('/api/auth/begin', async (req, res) => {
  if (!requireConfig(res) || !allowAuthAttempt(req, res)) return

  const old = req.cookies?.[FLOW_COOKIE]
  if (old && pending.has(old)) {
    const prior = pending.get(old)
    try {
      prior.rejectInput?.(new Error('AUTH_USER_CANCEL'))
      await prior.client?.disconnect()
    } catch {}
    pending.delete(old)
  }

  const flow = startFlow()
  res.cookie(FLOW_COOKIE, flow.id, { ...cookieOptions(true), maxAge: 10 * 60 * 1000 })
  await waitForStepChange(flow, 'starting')
  res.json(publicFlow(flow))
})

app.get('/api/auth/flow', async (req, res) => {
  const id = req.cookies?.[FLOW_COOKIE]
  const flow = id && pending.get(id)
  if (!flow) return res.status(404).json({ error: 'No active Telegram login.' })
  await waitForStepChange(flow, flow.step)
  res.json(publicFlow(flow))
})

app.post('/api/auth/input', async (req, res) => {
  if (!allowAuthAttempt(req, res)) return
  const id = req.cookies?.[FLOW_COOKIE]
  const flow = id && pending.get(id)
  if (!flow) return res.status(404).json({ error: 'No active Telegram login.' })
  if (!flow.resolveInput) return res.status(409).json({ error: 'Telegram is not waiting for input.' })

  const value = String(req.body?.value || '').trim()
  if (!value) return res.status(400).json({ error: 'Value is required.' })

  const resolve = flow.resolveInput
  flow.resolveInput = null
  flow.rejectInput = null
  flow.step = 'processing'
  resolve(value)
  await waitForStepChange(flow, 'processing', 4500)

  if (flow.step === 'done' && flow.session) {
    res.cookie(SESSION_COOKIE, encrypt(flow.session), cookieOptions(true))
    res.clearCookie(FLOW_COOKIE, { path: '/' })
    pending.delete(id)
  }

  res.json(publicFlow(flow))
})

app.post('/api/auth/logout', async (req, res) => {
  try {
    const client = await getClient(req)
    await client?.disconnect()
  } catch {}
  res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.clearCookie(FLOW_COOKIE, { path: '/' })
  res.json({ ok: true })
})

app.get('/api/feed', async (req, res) => {
  if (!requireConfig(res)) return
  try {
    const client = await getClient(req)
    if (!client) return res.status(401).json({ error: 'Connect Telegram first.' })

    const dialogs = await getBroadcastDialogs(client)
    const entityMap = new Map()
    const rows = await mapLimit(dialogs, 4, async dialog => {
      const entity = dialog.entity
      const channelId = String(entity.id)
      entityMap.set(channelId, entity)
      const channel = {
        id: channelId,
        title: entity.title || 'Untitled channel',
        username: entity.username || undefined,
        initials: initials(entity.title),
        accent: accent(channelId),
        unread: Number(dialog.unreadCount || 0),
        followers: compactNumber(entity.participantsCount)
      }

      const messages = await client.getMessages(entity, { limit: 16 })
      const posts = []
      for (const message of messages) {
        if (!message?.id) continue
        let media
        if (message.photo || message.video || message.document) {
          media = {
            kind: message.video ? 'video' : 'photo',
            src: `/api/media/${encodeURIComponent(channelId)}/${message.id}`
          }
        }
        posts.push({
          id: `${channelId}-${message.id}`,
          messageId: Number(message.id),
          channelId,
          timestamp: Number(message.date || 0) * 1000,
          text: message.message || '',
          unread: Number(dialog.unreadCount || 0) > 0,
          saved: false,
          media,
          reactions: reactions(message),
          views: compactNumber(message.views),
          comments: Number(message.replies?.replies || 0) || 0
        })
      }

      const sponsored = await getSponsoredFor(client, entity)
      for (const sponsoredMessage of sponsored.messages) {
        const randomId = Buffer.from(sponsoredMessage.randomId || []).toString('base64url')
        posts.push({
          id: `sponsored-${channelId}-${randomId}`,
          messageId: 0,
          channelId,
          timestamp: Date.now(),
          text: sponsoredMessage.message || '',
          unread: false,
          saved: false,
          reactions: [],
          sponsored: {
            label: sponsoredMessage.recommended ? 'Recommended' : 'Sponsored',
            title: sponsoredMessage.title || 'Sponsored',
            url: sponsoredMessage.url || 'https://telegram.org',
            buttonText: sponsoredMessage.buttonText || 'Learn more',
            randomId,
            sponsorInfo: sponsoredMessage.sponsorInfo || undefined,
            additionalInfo: sponsoredMessage.additionalInfo || undefined
          }
        })
      }

      return { channel, posts }
    })

    const channels = rows.map(row => row.channel)
    const feed = rows.flatMap(row => row.posts).sort((a, b) => b.timestamp - a.timestamp)
    console.log('Telegram feed response', { channels: channels.length, posts: feed.length })
    entitiesByClient.set(client, entityMap)
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ channels, feed })
  } catch (err) {
    console.error('Telegram feed error', String(err?.message || err))
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.get('/api/media/:channelId/:messageId', async (req, res) => {
  try {
    const client = await getClient(req)
    if (!client) return res.status(401).end()
    const map = entitiesByClient.get(client)
    const entity = map?.get(String(req.params.channelId))
    if (!entity) return res.status(404).end()

    const messages = await client.getMessages(entity, { ids: [Number(req.params.messageId)] })
    const message = messages?.[0]
    if (!message) return res.status(404).end()

    const buffer = await client.downloadMedia(message, { workers: 1 })
    if (!buffer) return res.status(404).end()

    const contentType = message.photo ? 'image/jpeg' : message.video ? 'video/mp4' : message.document?.mimeType || 'application/octet-stream'
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.type(contentType).send(buffer)
  } catch {
    res.status(404).end()
  }
})

app.post('/api/save', async (req, res) => {
  try {
    const client = await getClient(req)
    if (!client) return res.status(401).json({ error: 'Connect Telegram first.' })
    const map = entitiesByClient.get(client)
    const entity = map?.get(String(req.body?.channelId))
    if (!entity) return res.status(404).json({ error: 'Channel not loaded.' })

    const messages = await client.getMessages(entity, { ids: [Number(req.body?.messageId)] })
    const message = messages?.[0]
    if (!message) return res.status(404).json({ error: 'Message not found.' })

    await client.forwardMessages('me', { messages: [message] })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

function decodeRandomId(value) {
  return Buffer.from(String(value || ''), 'base64url')
}

app.post('/api/sponsored/view', async (req, res) => {
  try {
    const client = await getClient(req)
    if (!client) return res.status(401).json({ error: 'Connect Telegram first.' })
    await client.api.messages.viewSponsoredMessage({ randomId: decodeRandomId(req.body?.randomId) })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.post('/api/sponsored/click', async (req, res) => {
  try {
    const client = await getClient(req)
    if (!client) return res.status(401).json({ error: 'Connect Telegram first.' })
    await client.api.messages.clickSponsoredMessage({ randomId: decodeRandomId(req.body?.randomId), media: false, fullscreen: false })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [id, flow] of pending) {
    if (now - flow.updatedAt > 10 * 60 * 1000) {
      try {
        flow.rejectInput?.(new Error('AUTH_TIMEOUT'))
        flow.client?.disconnect()
      } catch {}
      pending.delete(id)
    }
  }
  for (const [key, entry] of clients) {
    if (now - entry.lastUsed > 30 * 60 * 1000) {
      try { entry.client.disconnect() } catch {}
      clients.delete(key)
    }
  }
  for (const [key, bucket] of authRate) {
    if (now - bucket.start > 20 * 60 * 1000) authRate.delete(key)
  }
}, 60_000)
cleanupTimer.unref?.()

async function shutdown(signal) {
  console.log(`${signal} received, disconnecting Telegram clients`)
  clearInterval(cleanupTimer)
  const disconnects = []
  for (const flow of pending.values()) if (flow.client) disconnects.push(flow.client.disconnect().catch(() => {}))
  for (const entry of clients.values()) disconnects.push(entry.client.disconnect().catch(() => {}))
  await Promise.allSettled(disconnects)
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Telegram.Social backend listening on 0.0.0.0:${PORT}`)
    console.log(`Telegram configuration: ${configured ? 'ready' : 'incomplete'}`)
  })
}

export default app