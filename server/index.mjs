import crypto from 'node:crypto'
import express from 'express'
import cookieParser from 'cookie-parser'
import { TelegramClient } from 'teleproto'
import { StringSession } from 'teleproto/sessions/index.js'
import { NewMessage, EditedMessage, DeletedMessage } from 'teleproto/events/index.js'

const PORT = Number(process.env.PORT || 8787)
const API_ID = Number(process.env.TELEGRAM_API_ID || 0)
const API_HASH = process.env.TELEGRAM_API_HASH || ''
const SESSION_SECRET = process.env.SESSION_SECRET || ''
const BACKEND_PROXY_SECRET = process.env.BACKEND_PROXY_SECRET || ''
const PUBLIC_APP_ORIGIN = process.env.PUBLIC_APP_ORIGIN || ''
const isProd = process.env.NODE_ENV === 'production'
const configured = Boolean(API_ID && API_HASH && SESSION_SECRET.length >= 32 && (!isProd || BACKEND_PROXY_SECRET.length >= 32))

const FEED_PAGE_SIZE = 40
const SOURCE_BATCH_SIZE = 20
const INVENTORY_TTL = 10 * 60 * 1000
const CURSOR_TTL = 30 * 60 * 1000
const MEDIA_TICKET_TTL = 5 * 60 * 1000
const UPDATE_RETENTION = 1000

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
const feedPaginators = new Map()
const mediaTickets = new Map()
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

function compactNumber(value) {
  const raw = value && typeof value === 'object' && typeof value.toJSNumber === 'function' ? value.toJSNumber() : value
  const n = Number(raw || 0)
  if (!n) return undefined
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function numeric(value) {
  if (value && typeof value === 'object' && typeof value.toJSNumber === 'function') return value.toJSNumber()
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function accent(input) {
  const palette = ['#2AABEE', '#65BFA6', '#E0AA52', '#9A84DC', '#D9856D', '#C87891', '#5CBDB0']
  let n = 0
  for (const char of String(input)) n = (n * 31 + char.charCodeAt(0)) | 0
  return palette[Math.abs(n) % palette.length]
}

function initials(title) {
  return String(title || 'SG').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]?.toUpperCase()).join('') || 'SG'
}

function reactions(message) {
  return (message?.reactions?.results || []).slice(0, 6).map(row => ({
    emoji: row?.reaction?.emoticon || '♥',
    count: Number(row?.count || 0)
  }))
}

function className(value) {
  return String(value?.className || value?.constructor?.name || '').toLowerCase()
}

function entityKind(entity) {
  const name = className(entity)
  if (name.includes('user')) return 'user'
  if (name.includes('channel')) return entity?.megagroup || entity?.gigagroup ? 'group' : 'channel'
  if (name.includes('chat')) return 'group'
  return 'conversation'
}

function sourceTypeLabel(kind) {
  if (kind === 'user') return 'person'
  return kind
}

function entityTitle(entity) {
  const fullName = [entity?.firstName, entity?.lastName].filter(Boolean).join(' ').trim()
  return entity?.title || fullName || entity?.username || 'Telegram conversation'
}

function typedSourceId(entity) {
  if (!entity?.id) return null
  return `${entityKind(entity)}:${String(entity.id)}`
}

function peerNumericId(peer) {
  return String(peer?.userId || peer?.chatId || peer?.channelId || peer?.id || '')
}

function sourceIdFromPeer(peer, entry) {
  const id = peerNumericId(peer)
  if (!id) return null
  if (peer?.userId != null || className(peer).includes('user')) return `user:${id}`
  if (peer?.chatId != null || className(peer).includes('chat')) return `group:${id}`
  if (peer?.channelId != null || className(peer).includes('channel')) {
    if (entry?.sourceMap?.has(`channel:${id}`)) return `channel:${id}`
    if (entry?.sourceMap?.has(`group:${id}`)) return `group:${id}`
    return `channel:${id}`
  }
  return null
}

function messageTimestamp(message) {
  if (message?.date instanceof Date) return message.date.getTime()
  const raw = Number(message?.date || 0)
  if (!raw) return Date.now()
  return raw > 1_000_000_000_000 ? raw : raw * 1000
}

function isBroadcastEntity(entity) {
  return entity?.broadcast === true && entity?.megagroup !== true && entity?.gigagroup !== true
}

function documentAttributes(document) {
  return Array.isArray(document?.attributes) ? document.attributes : []
}

function attrByName(document, term) {
  const lower = term.toLowerCase()
  return documentAttributes(document).find(attr => className(attr).includes(lower))
}

function classifyMedia(message, sourceId) {
  const groupId = message?.groupedId ? String(message.groupedId) : undefined
  if (message?.photo) {
    return {
      kind: 'photo',
      mimeType: 'image/jpeg',
      groupId,
      ticketEndpoint: `/api/media/ticket/${encodeURIComponent(sourceId)}/${Number(message.id)}`
    }
  }

  const document = message?.document || message?.media?.document
  if (document) {
    const mimeType = String(document.mimeType || 'application/octet-stream')
    const video = attrByName(document, 'documentattributevideo')
    const audio = attrByName(document, 'documentattributeaudio')
    const animated = attrByName(document, 'documentattributeanimated')
    const sticker = attrByName(document, 'documentattributesticker')
    const filename = attrByName(document, 'documentattributefilename')
    const width = numeric(video?.w)
    const height = numeric(video?.h)
    const duration = numeric(video?.duration || audio?.duration)
    let kind = 'document'

    if (sticker) kind = 'sticker'
    else if (audio?.voice) kind = 'voice'
    else if (audio || mimeType.startsWith('audio/')) kind = 'audio'
    else if (animated || mimeType === 'image/gif') kind = 'gif'
    else if (video || mimeType.startsWith('video/')) kind = 'video'
    else if (mimeType.startsWith('image/')) kind = 'photo'

    return {
      kind,
      mimeType,
      name: filename?.fileName || document.fileName || undefined,
      size: numeric(document.size) || undefined,
      duration: duration || undefined,
      width: width || undefined,
      height: height || undefined,
      groupId,
      round: Boolean(video?.roundMessage),
      supportsStreaming: Boolean(video?.supportsStreaming || kind === 'video' || kind === 'gif'),
      ticketEndpoint: `/api/media/ticket/${encodeURIComponent(sourceId)}/${Number(message.id)}`
    }
  }

  const mediaName = className(message?.media)
  if (mediaName.includes('poll')) return { kind: 'poll', groupId }
  if (mediaName.includes('geo') || mediaName.includes('venue')) return { kind: 'location', groupId }
  if (mediaName.includes('contact')) return { kind: 'contact', groupId }
  return undefined
}

function sourceFromEntity(entity, dialog) {
  const id = typedSourceId(entity)
  if (!id) return null
  const title = entityTitle(entity)
  const kind = entityKind(entity)
  return {
    id,
    title,
    username: entity.username || undefined,
    initials: initials(title),
    accent: accent(id),
    unread: Number(dialog?.unreadCount || 0),
    followers: compactNumber(entity.participantsCount),
    type: sourceTypeLabel(kind),
    private: kind === 'user',
    archived: Boolean(dialog?.archived || dialog?.folderId === 1),
    avatar: `/api/avatar/${encodeURIComponent(id)}`
  }
}

function readInboxMax(dialog) {
  return Number(dialog?.readInboxMaxId || dialog?.dialog?.readInboxMaxId || 0)
}

function postFromMessage(message, source, readMax = 0) {
  if (!message?.id || !source?.id) return null
  const media = classifyMedia(message, source.id)
  const text = String(message.message || message.text || '')
  if (!text && !media) return null
  return {
    id: `${source.id}:${Number(message.id)}`,
    messageId: Number(message.id),
    channelId: source.id,
    timestamp: messageTimestamp(message),
    text,
    unread: !message.out && Number(message.id) > readMax,
    saved: false,
    media,
    groupId: media?.groupId,
    reactions: reactions(message),
    views: compactNumber(message.views),
    comments: Number(message.replies?.replies || 0) || 0,
    outgoing: Boolean(message.out),
    sourceType: source.type,
    edited: Boolean(message.editDate),
    noForwards: Boolean(message.noforwards)
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

function pushUpdate(entry, payload) {
  entry.updateSeq += 1
  const update = { seq: entry.updateSeq, ...payload }
  entry.updates.push(update)
  if (entry.updates.length > UPDATE_RETENTION) entry.updates.splice(0, entry.updates.length - UPDATE_RETENTION)
  for (const wake of entry.updateWaiters.splice(0)) wake()
}

function upsertDynamicSource(entry, entity) {
  const source = sourceFromEntity(entity)
  if (!source) return null
  const existing = entry.sourceMap.get(source.id)
  const merged = existing ? { ...existing, ...source, unread: existing.unread } : source
  entry.sourceMap.set(source.id, merged)
  entry.entityMap.set(source.id, entity)
  if (!existing) pushUpdate(entry, { type: 'source', source: merged })
  return merged
}

async function attachUpdateHandlers(entry) {
  if (entry.handlersAttached) return
  entry.handlersAttached = true

  entry.onNewMessage = async event => {
    try {
      const message = event?.message
      const entity = message?.chat || await message?.getChat?.()
      const source = entity ? upsertDynamicSource(entry, entity) : null
      const post = source ? postFromMessage(message, source, 0) : null
      if (post) pushUpdate(entry, { type: 'upsert', post, source })
    } catch (error) {
      console.error('Telegram incremental new-message mapping failed', String(error?.message || error))
    }
  }

  entry.onEditedMessage = async event => {
    try {
      const message = event?.message
      const entity = message?.chat || await message?.getChat?.()
      const source = entity ? upsertDynamicSource(entry, entity) : null
      const post = source ? postFromMessage(message, source, 0) : null
      if (post) pushUpdate(entry, { type: 'upsert', post, source })
    } catch (error) {
      console.error('Telegram incremental edit mapping failed', String(error?.message || error))
    }
  }

  entry.onDeletedMessage = event => {
    try {
      const sourceId = sourceIdFromPeer(event?.peer, entry)
      const messageIds = Array.isArray(event?.deletedIds) ? event.deletedIds.map(Number).filter(Boolean) : []
      if (messageIds.length) pushUpdate(entry, { type: 'delete', sourceId, messageIds })
    } catch (error) {
      console.error('Telegram incremental delete mapping failed', String(error?.message || error))
    }
  }

  entry.client.addEventHandler(entry.onNewMessage, new NewMessage({}))
  entry.client.addEventHandler(entry.onEditedMessage, new EditedMessage({}))
  entry.client.addEventHandler(entry.onDeletedMessage, new DeletedMessage({}))
  await entry.client.catchUp().catch(() => {})
}

async function getClientEntry(req) {
  if (!configured) return null
  const session = decrypt(req.cookies?.[SESSION_COOKIE])
  if (!session) return null
  const key = crypto.createHash('sha256').update(session).digest('hex')
  let entry = clients.get(key)

  if (!entry) {
    const client = new TelegramClient(new StringSession(session), API_ID, API_HASH, {
      connectionRetries: 5,
      maxConcurrentDownloads: 4
    })
    await client.connect()
    if (!await client.isUserAuthorized()) {
      await client.disconnect().catch(() => {})
      return null
    }
    await client.getMe().catch(() => {})
    entry = {
      key,
      client,
      lastUsed: Date.now(),
      entityMap: new Map(),
      sourceMap: new Map(),
      dialogMap: new Map(),
      inventoryLoadedAt: 0,
      inventoryDiagnostics: null,
      avatarCache: new Map(),
      updateSeq: 0,
      updates: [],
      updateWaiters: [],
      handlersAttached: false
    }
    clients.set(key, entry)
    await attachUpdateHandlers(entry)
  }

  entry.lastUsed = Date.now()
  return entry
}

async function getClient(req) {
  return (await getClientEntry(req))?.client || null
}

async function ensureInventory(entry, force = false) {
  if (!force && entry.inventoryLoadedAt && Date.now() - entry.inventoryLoadedAt < INVENTORY_TTL && entry.sourceMap.size) return

  const [dialogs, mainCount, archivedCount] = await Promise.all([
    entry.client.getDialogs({ limit: undefined }),
    entry.client.getDialogs({ limit: 0, folder: 0 }),
    entry.client.getDialogs({ limit: 0, folder: 1 })
  ])

  const nextSources = new Map()
  const nextEntities = new Map()
  const nextDialogs = new Map()
  const typeCounts = {}
  let archivedLoaded = 0

  for (const dialog of dialogs) {
    const entity = dialog?.entity
    const source = sourceFromEntity(entity, dialog)
    if (!source) continue
    nextSources.set(source.id, source)
    nextEntities.set(source.id, entity)
    nextDialogs.set(source.id, dialog)
    typeCounts[source.type] = (typeCounts[source.type] || 0) + 1
    if (source.archived) archivedLoaded += 1
  }

  entry.sourceMap = nextSources
  entry.entityMap = nextEntities
  entry.dialogMap = nextDialogs
  entry.inventoryLoadedAt = Date.now()
  entry.inventoryDiagnostics = {
    loaded: dialogs.length,
    telegramTotal: Number(dialogs.total ?? dialogs.length),
    mainTotal: Number(mainCount.total ?? 0),
    archivedTotal: Number(archivedCount.total ?? 0),
    archivedLoaded,
    entityTypes: typeCounts
  }

  console.log('Telegram dialog inventory', entry.inventoryDiagnostics)
}

async function getSponsoredFor(client, entity) {
  if (!isBroadcastEntity(entity)) return { postsBetween: 0, messages: [] }
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

function createSourceState(entry, sourceId) {
  const source = entry.sourceMap.get(sourceId)
  const entity = entry.entityMap.get(sourceId)
  const dialog = entry.dialogMap.get(sourceId)
  const latest = dialog?.message
  const readMax = readInboxMax(dialog)
  const latestPost = latest ? postFromMessage(latest, source, readMax) : null
  return {
    sourceId,
    source,
    entity,
    readMax,
    offsetId: latest?.id ? Number(latest.id) : 0,
    buffer: latestPost ? [latestPost] : [],
    exhausted: false
  }
}

async function refillSource(entry, state) {
  if (state.exhausted || !state.entity) return
  const messages = await entry.client.getMessages(state.entity, {
    limit: SOURCE_BATCH_SIZE,
    offsetId: state.offsetId || 0
  })
  const raw = Array.from(messages || []).filter(Boolean)
  if (!raw.length) {
    state.exhausted = true
    return
  }

  state.offsetId = Number(raw[raw.length - 1]?.id || state.offsetId || 0)
  if (raw.length < SOURCE_BATCH_SIZE) state.exhausted = true
  const mapped = raw.map(message => postFromMessage(message, state.source, state.readMax)).filter(Boolean)
  state.buffer.push(...mapped)
}

async function ensureCandidates(entry, states) {
  const missing = states.filter(state => !state.buffer.length && !state.exhausted)
  await mapLimit(missing, 8, async state => refillSource(entry, state))
}

async function createPaginator(entry) {
  await ensureInventory(entry)
  const token = crypto.randomBytes(24).toString('base64url')
  const states = [...entry.sourceMap.keys()].map(sourceId => createSourceState(entry, sourceId))
  const paginator = {
    token,
    clientKey: entry.key,
    states,
    createdAt: Date.now(),
    lastUsed: Date.now(),
    sponsoredSeen: new Set()
  }
  feedPaginators.set(token, paginator)
  return paginator
}

function paginatorHasMore(paginator) {
  return paginator.states.some(state => state.buffer.length || !state.exhausted)
}

async function injectSponsored(entry, paginator, posts) {
  const sourceIds = [...new Set(posts.map(post => post.channelId))]
  for (const sourceId of sourceIds) {
    if (paginator.sponsoredSeen.has(sourceId)) continue
    const entity = entry.entityMap.get(sourceId)
    if (!isBroadcastEntity(entity)) continue
    paginator.sponsoredSeen.add(sourceId)
    const sponsored = await getSponsoredFor(entry.client, entity)
    if (!sponsored.messages.length) continue
    const firstIndex = posts.findIndex(post => post.channelId === sourceId)
    if (firstIndex < 0) continue
    const source = entry.sourceMap.get(sourceId)
    const insertions = sponsored.messages.map((sponsoredMessage, index) => {
      const randomId = Buffer.from(sponsoredMessage.randomId || []).toString('base64url')
      return {
        id: `sponsored:${sourceId}:${randomId}`,
        messageId: 0,
        channelId: sourceId,
        timestamp: Number(posts[firstIndex]?.timestamp || Date.now()) - index - 1,
        text: sponsoredMessage.message || '',
        unread: false,
        saved: false,
        reactions: [],
        sponsored: {
          label: sponsoredMessage.recommended ? 'Recommended' : 'Sponsored',
          title: sponsoredMessage.title || source?.title || 'Sponsored',
          url: sponsoredMessage.url || 'https://telegram.org',
          buttonText: sponsoredMessage.buttonText || 'Learn more',
          randomId,
          sponsorInfo: sponsoredMessage.sponsorInfo || undefined,
          additionalInfo: sponsoredMessage.additionalInfo || undefined
        }
      }
    })
    posts.splice(firstIndex + 1, 0, ...insertions)
  }
}

async function nextPaginatorPage(entry, paginator, limit) {
  const posts = []
  let refillCursor = Number(paginator.refillCursor || 0)
  let refillRounds = 0

  // Drain already-known dialog heads first. This makes the first feed paint depend on
  // Telegram's dialog inventory, not on N sequential message-history requests.
  while (posts.length < limit) {
    let best = null
    for (const state of paginator.states) {
      const candidate = state.buffer[0]
      if (!candidate) continue
      if (!best || candidate.timestamp > best.post.timestamp || (candidate.timestamp === best.post.timestamp && candidate.id > best.post.id)) {
        best = { state, post: candidate }
      }
    }

    if (best) {
      best.state.buffer.shift()
      posts.push(best.post)
      continue
    }

    // History is fetched in bounded parallel waves only when the visible page needs it.
    // Rotating the starting point prevents large accounts from blocking on every dialog.
    const refillable = paginator.states.filter(state => !state.buffer.length && !state.exhausted)
    if (!refillable.length || refillRounds >= 4) break
    const waveSize = Math.min(16, refillable.length)
    const wave = []
    for (let i = 0; i < waveSize; i++) wave.push(refillable[(refillCursor + i) % refillable.length])
    refillCursor = (refillCursor + waveSize) % Math.max(1, refillable.length)
    await mapLimit(wave, 16, async state => refillSource(entry, state))
    refillRounds += 1
  }

  paginator.refillCursor = refillCursor
  // Sponsored lookups must never hold up the user's content. They are skipped on the
  // latency-critical first paint and can arrive naturally on later pages.
  if (paginator.lastUsed !== paginator.createdAt) await injectSponsored(entry, paginator, posts)
  paginator.lastUsed = Date.now()
  return posts
}

async function waitForIncrementalUpdates(entry, after, timeout = 20_000) {
  if (entry.updateSeq > after) return
  await Promise.race([
    new Promise(resolve => entry.updateWaiters.push(resolve)),
    new Promise(resolve => setTimeout(resolve, timeout))
  ])
}

app.get('/', (_req, res) => {
  res.json({ service: 'supergram-backend', ok: true })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, configured, runtime: 'persistent-node', version: '0.4.0' })
})

app.get('/api/ready', (_req, res) => {
  if (!configured) return res.status(503).json({ ok: false, configured: false })
  res.json({ ok: true, configured: true })
})

app.get('/api/auth/status', async (req, res) => {
  if (!requireConfig(res)) return
  try {
    const entry = await getClientEntry(req)
    if (!entry) return res.json({ connected: false })
    const me = await entry.client.getMe()
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
    const entry = await getClientEntry(req)
    await entry?.client.disconnect()
    if (entry) clients.delete(entry.key)
  } catch {}
  res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.clearCookie(FLOW_COOKIE, { path: '/' })
  res.json({ ok: true })
})

app.get('/api/feed', async (req, res) => {
  if (!requireConfig(res)) return
  try {
    const entry = await getClientEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })

    const requestedCursor = String(req.query?.cursor || '')
    const requestedLimit = Math.min(80, Math.max(10, Number(req.query?.limit || FEED_PAGE_SIZE)))
    let paginator
    let initial = false

    if (requestedCursor) {
      paginator = feedPaginators.get(requestedCursor)
      if (!paginator || paginator.clientKey !== entry.key || Date.now() - paginator.lastUsed > CURSOR_TTL) {
        if (paginator) feedPaginators.delete(requestedCursor)
        return res.status(410).json({ error: 'Feed cursor expired.', code: 'CURSOR_EXPIRED' })
      }
    } else {
      paginator = await createPaginator(entry)
      initial = true
    }

    const feed = await nextPaginatorPage(entry, paginator, requestedLimit)
    const hasMore = paginatorHasMore(paginator)
    const channels = initial ? [...entry.sourceMap.values()] : []
    console.log('Telegram feed page', {
      initial,
      sources: entry.sourceMap.size,
      posts: feed.length,
      hasMore,
      cursor: paginator.token.slice(0, 8),
      diagnostics: initial ? entry.inventoryDiagnostics : undefined
    })

    res.setHeader('Cache-Control', 'private, no-store')
    res.json({
      channels,
      feed,
      nextCursor: hasMore ? paginator.token : null,
      hasMore,
      syncToken: entry.updateSeq,
      diagnostics: initial ? entry.inventoryDiagnostics : undefined
    })
  } catch (err) {
    console.error('Telegram feed failed', String(err?.message || err))
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.get('/api/feed/updates', async (req, res) => {
  try {
    const entry = await getClientEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    const after = Math.max(0, Number(req.query?.after || 0))
    await waitForIncrementalUpdates(entry, after)
    const updates = entry.updates.filter(update => update.seq > after).slice(-200)
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ updates, syncToken: entry.updateSeq })
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.get('/api/feed/diagnostics', async (req, res) => {
  try {
    const entry = await getClientEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    await ensureInventory(entry, true)
    res.setHeader('Cache-Control', 'private, no-store')
    res.json(entry.inventoryDiagnostics)
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.get('/api/avatar/:sourceId', async (req, res) => {
  try {
    const entry = await getClientEntry(req)
    if (!entry) return res.status(401).end()
    await ensureInventory(entry)
    const sourceId = String(req.params.sourceId || '')
    const entity = entry.entityMap.get(sourceId)
    if (!entity) return res.status(404).end()

    const cached = entry.avatarCache.get(sourceId)
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('Cache-Control', 'private, max-age=1800')
      res.type('image/jpeg').send(cached.buffer)
      return
    }

    const buffer = await entry.client.downloadProfilePhoto(entity, { isBig: false, requestTimeout: 15_000 })
    if (!Buffer.isBuffer(buffer) || !buffer.length) return res.status(404).end()
    entry.avatarCache.set(sourceId, { buffer, expiresAt: Date.now() + 30 * 60 * 1000 })
    res.setHeader('Cache-Control', 'private, max-age=1800')
    res.type('image/jpeg').send(buffer)
  } catch {
    res.status(404).end()
  }
})

app.get('/api/media/ticket/:sourceId/:messageId', async (req, res) => {
  try {
    const entry = await getClientEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    await ensureInventory(entry)
    const sourceId = String(req.params.sourceId || '')
    const entity = entry.entityMap.get(sourceId)
    if (!entity) return res.status(404).json({ error: 'Source not loaded.' })
    const messageId = Number(req.params.messageId)
    if (!messageId) return res.status(400).json({ error: 'Invalid message.' })

    const token = crypto.randomBytes(24).toString('base64url')
    const expiresAt = Date.now() + MEDIA_TICKET_TTL
    mediaTickets.set(token, { clientKey: entry.key, sourceId, messageId, expiresAt })
    const directOrigin = `${req.protocol}://${req.get('host')}`
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ url: `${directOrigin}/media/${token}`, expiresAt })
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.get('/media/:ticket', async (req, res) => {
  const ticket = mediaTickets.get(String(req.params.ticket || ''))
  if (!ticket || ticket.expiresAt <= Date.now()) {
    if (ticket) mediaTickets.delete(String(req.params.ticket || ''))
    return res.status(410).end()
  }

  const entry = clients.get(ticket.clientKey)
  const entity = entry?.entityMap.get(ticket.sourceId)
  if (!entry || !entity) return res.status(410).end()

  try {
    entry.lastUsed = Date.now()
    const messages = await entry.client.getMessages(entity, { ids: [ticket.messageId] })
    const message = messages?.[0]
    if (!message) return res.status(404).end()
    const media = classifyMedia(message, ticket.sourceId)
    if (!media?.ticketEndpoint) return res.status(404).end()

    const mimeType = media.mimeType || (message.photo ? 'image/jpeg' : 'application/octet-stream')
    res.status(200)
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.setHeader('Accept-Ranges', 'none')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    if (PUBLIC_APP_ORIGIN) res.setHeader('Access-Control-Allow-Origin', PUBLIC_APP_ORIGIN)
    if (media.size && Number.isSafeInteger(media.size)) res.setHeader('Content-Length', String(media.size))
    if (media.name) res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(String(media.name).slice(0, 180))}`)

    const abort = new AbortController()
    res.on('close', () => { if (!res.writableEnded) abort.abort() })
    const writer = {
      write(chunk) {
        if (abort.signal.aborted || res.writableEnded) return Promise.resolve()
        return new Promise((resolve, reject) => {
          const onError = error => { cleanup(); reject(error) }
          const onDrain = () => { cleanup(); resolve() }
          const cleanup = () => {
            res.off('error', onError)
            res.off('drain', onDrain)
          }
          res.on('error', onError)
          if (res.write(chunk)) { cleanup(); resolve() }
          else res.once('drain', onDrain)
        })
      },
      close() {
        if (!res.writableEnded) res.end()
      }
    }

    await entry.client.downloadMedia(message, { outputFile: writer, signal: abort.signal, requestTimeout: 55_000 })
    if (!res.writableEnded) res.end()
  } catch (err) {
    if (!res.headersSent) res.status(404).end()
    else if (!res.writableEnded) res.end()
    console.error('Direct media stream failed', String(err?.message || err))
  }
})

app.post('/api/save', async (req, res) => {
  try {
    const entry = await getClientEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    await ensureInventory(entry)
    const entity = entry.entityMap.get(String(req.body?.channelId))
    if (!entity) return res.status(404).json({ error: 'Conversation not loaded.' })
    const messages = await entry.client.getMessages(entity, { ids: [Number(req.body?.messageId)] })
    const message = messages?.[0]
    if (!message) return res.status(404).json({ error: 'Message not found.' })
    await entry.client.forwardMessages('me', { messages: [message] })
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
      for (const wake of entry.updateWaiters.splice(0)) wake()
      clients.delete(key)
    }
  }

  for (const [token, paginator] of feedPaginators) {
    if (now - paginator.lastUsed > CURSOR_TTL || !clients.has(paginator.clientKey)) feedPaginators.delete(token)
  }
  for (const [token, ticket] of mediaTickets) {
    if (ticket.expiresAt <= now || !clients.has(ticket.clientKey)) mediaTickets.delete(token)
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
    console.log(`Supergram backend listening on 0.0.0.0:${PORT}`)
    console.log(`Telegram configuration: ${configured ? 'ready' : 'incomplete'}`)
  })
}

export default app
