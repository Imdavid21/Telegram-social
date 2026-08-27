import crypto from 'node:crypto'
import { Api, TelegramClient } from 'teleproto'
import { StringSession } from 'teleproto/sessions/index.js'
import app from './index.mjs'

const API_ID = Number(process.env.TELEGRAM_API_ID || 0)
const API_HASH = process.env.TELEGRAM_API_HASH || ''
const SESSION_SECRET = process.env.SESSION_SECRET || ''
const SESSION_COOKIE = 'tgs_session'
const sessionKey = crypto.createHash('sha256').update(SESSION_SECRET || 'local-development-session-secret').digest()
const crmClients = new Map()
const INVENTORY_TTL = 10 * 60 * 1000

function decrypt(token) {
  try {
    const [ivRaw, tagRaw, dataRaw] = String(token || '').split('.')
    if (!ivRaw || !tagRaw || !dataRaw) return null
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(ivRaw, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
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

function typedSourceId(entity) {
  if (!entity?.id) return null
  return `${entityKind(entity)}:${String(entity.id)}`
}

function telegramUserId(entity) {
  return entityKind(entity) === 'user' && entity?.id ? String(entity.id) : null
}

function entityTitle(entity) {
  if (entityKind(entity) === 'user' && entity?.deleted && entity?.id) return `Deleted Account (ID: ${String(entity.id)})`
  const fullName = [entity?.firstName, entity?.lastName].filter(Boolean).join(' ').trim()
  return entity?.title || fullName || entity?.username || 'Telegram conversation'
}

function initials(title) {
  return String(title || 'TG').split(/\s+/).filter(Boolean).slice(0, 2).map(value => value[0]?.toUpperCase()).join('') || 'TG'
}

function sourceFromEntity(entity) {
  const id = typedSourceId(entity)
  if (!id) return null
  const title = entityTitle(entity)
  const kind = entityKind(entity)
  return {
    id,
    title,
    username: entity?.username || undefined,
    initials: initials(title),
    type: kind === 'user' ? 'person' : kind,
    verified: Boolean(entity?.verified),
    bot: Boolean(entity?.bot),
    avatar: `/api/avatar/${encodeURIComponent(id)}`
  }
}

function networkPersonFromEntity(entity) {
  const userId = telegramUserId(entity)
  const sourceId = typedSourceId(entity)
  if (!userId || !sourceId) return null
  const name = entityTitle(entity)
  return {
    telegramUserId: userId,
    sourceId,
    name,
    username: entity?.username || '',
    usernames: Array.isArray(entity?.usernames) ? entity.usernames.map(row => row?.username).filter(Boolean) : [],
    phone: entity?.phone || '',
    deleted: Boolean(entity?.deleted),
    bot: Boolean(entity?.bot),
    premium: Boolean(entity?.premium),
    verified: Boolean(entity?.verified),
    scam: Boolean(entity?.scam),
    fake: Boolean(entity?.fake),
    avatar: `/api/avatar/${encodeURIComponent(sourceId)}`
  }
}

function timestamp(message) {
  if (message?.date instanceof Date) return Math.floor(message.date.getTime() / 1000)
  const raw = Number(message?.date || 0)
  return raw > 1_000_000_000_000 ? Math.floor(raw / 1000) : raw
}

function mediaFromMessage(message, sourceId) {
  if (message?.photo) return { kind: 'photo', mimeType: 'image/jpeg', ticketEndpoint: `/api/media/ticket/${encodeURIComponent(sourceId)}/${Number(message.id)}` }
  const document = message?.document || message?.media?.document
  if (!document) return undefined
  const mimeType = String(document?.mimeType || 'application/octet-stream')
  let kind = 'document'
  if (mimeType.startsWith('video/')) kind = 'video'
  else if (mimeType.startsWith('audio/')) kind = 'audio'
  else if (mimeType.startsWith('image/')) kind = 'photo'
  return { kind, mimeType, ticketEndpoint: `/api/media/ticket/${encodeURIComponent(sourceId)}/${Number(message.id)}` }
}

function mapMessage(message, sourceId) {
  return {
    id: `${sourceId}:${Number(message?.id || 0)}`,
    messageId: Number(message?.id || 0),
    channelId: sourceId,
    timestamp: timestamp(message),
    text: String(message?.message || message?.text || ''),
    outgoing: Boolean(message?.out),
    unread: false,
    edited: Boolean(message?.editDate),
    media: mediaFromMessage(message, sourceId)
  }
}

function floodWaitSeconds(error) {
  const direct = Number(error?.seconds || error?.value || error?.retryAfter || 0)
  if (Number.isFinite(direct) && direct > 0) return direct
  const message = String(error?.message || error || '')
  const match = message.match(/FLOOD_WAIT[_\s-]?(\d+)/i) || message.match(/wait\s+(\d+)\s+seconds?/i)
  return match ? Number(match[1]) : 0
}

function sendRouteError(res, error, fallback, defaultStatus = 500) {
  const waitSeconds = floodWaitSeconds(error)
  if (waitSeconds > 0) {
    const retryAfterMs = Math.max(1000, waitSeconds * 1000)
    res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)))
    return res.status(429).json({ error: `Telegram rate limit. Retry in ${waitSeconds}s.`, code: 'FLOOD_WAIT', retryAfterMs })
  }
  return res.status(Number(error?.status || defaultStatus)).json({ error: String(error?.message || fallback) })
}

async function getEntry(req) {
  const session = decrypt(req.cookies?.[SESSION_COOKIE])
  if (!session) return null
  const key = crypto.createHash('sha256').update(session).digest('hex')
  let entry = crmClients.get(key)
  if (!entry) {
    const client = new TelegramClient(new StringSession(session), API_ID, API_HASH, { connectionRetries: 5 })
    await client.connect()
    if (!await client.isUserAuthorized()) {
      await client.disconnect().catch(() => {})
      return null
    }
    entry = { client, entityMap: new Map(), sourceMap: new Map(), dialogMap: new Map(), inventoryLoadedAt: 0, lastUsed: Date.now() }
    crmClients.set(key, entry)
  }
  entry.lastUsed = Date.now()
  return entry
}

async function ensureInventory(entry, force = false) {
  if (!force && entry.inventoryLoadedAt && Date.now() - entry.inventoryLoadedAt < INVENTORY_TTL && entry.entityMap.size) return
  const dialogs = await entry.client.getDialogs({ limit: undefined })
  const entityMap = new Map()
  const sourceMap = new Map()
  const dialogMap = new Map()
  for (const dialog of dialogs) {
    const entity = dialog?.entity
    const source = sourceFromEntity(entity)
    if (!source) continue
    entityMap.set(source.id, entity)
    sourceMap.set(source.id, source)
    dialogMap.set(source.id, dialog)
  }
  entry.entityMap = entityMap
  entry.sourceMap = sourceMap
  entry.dialogMap = dialogMap
  entry.inventoryLoadedAt = Date.now()
}

function requireEntity(entry, sourceId) {
  const entity = entry.entityMap.get(sourceId)
  if (!entity) {
    const error = new Error('Telegram contact is not loaded.')
    error.status = 404
    throw error
  }
  return entity
}

app.get('/api/crm/network/index', async (req, res) => {
  try {
    const entry = await getEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    await ensureInventory(entry, true)

    const contacts = []
    const excluded = []
    const groups = []
    for (const [sourceId, entity] of entry.entityMap) {
      const kind = entityKind(entity)
      const dialog = entry.dialogMap.get(sourceId)
      const topMessage = dialog?.message || null
      const lastMessageAt = timestamp(topMessage) || undefined
      if (kind === 'user') {
        const person = networkPersonFromEntity(entity)
        if (!person) continue
        const row = { ...person, lastMessageAt }
        if (person.bot) excluded.push({ key: `bot:${person.telegramUserId}`, telegramUserId: person.telegramUserId, sourceId, name: person.name, username: person.username, type: 'bot', reason: 'Bot account', lastMessageAt })
        else contacts.push(row)
        continue
      }
      const source = entry.sourceMap.get(sourceId)
      const reason = kind === 'channel' ? 'Channel dialog' : 'Group dialog'
      const row = { key: `${kind}:${sourceId}`, sourceId, name: source?.title || entityTitle(entity), username: source?.username || '', type: kind, reason, lastMessageAt }
      excluded.push(row)
      if (kind === 'group') groups.push(row)
    }

    contacts.sort((a, b) => Number(b.lastMessageAt || 0) - Number(a.lastMessageAt || 0))
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ contacts, excluded, groups, indexedAt: new Date().toISOString(), source: 'telegram-mtproto' })
  } catch (error) {
    sendRouteError(res, error, 'Could not enumerate Telegram dialogs.')
  }
})

app.get('/api/crm/network/group-members/:sourceId', async (req, res) => {
  try {
    const entry = await getEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    await ensureInventory(entry)
    const sourceId = String(req.params.sourceId || '')
    const entity = requireEntity(entry, sourceId)
    if (entityKind(entity) !== 'group') return res.status(400).json({ error: 'Participants are only available for Telegram groups.' })
    const limit = Math.min(200, Math.max(20, Number(req.query?.limit || 100)))
    const offset = Math.max(0, Number(req.query?.offset || 0))
    const result = await entry.client.getParticipants(entity, { limit, offset })
    const raw = Array.from(result || []).filter(Boolean)
    const members = raw.map(networkPersonFromEntity).filter(Boolean)
    const total = Number(result?.total ?? offset + members.length)
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ members, total, offset, nextOffset: offset + raw.length, hasMore: raw.length === limit && offset + raw.length < total })
  } catch (error) {
    sendRouteError(res, error, 'Could not load group participants.')
  }
})

app.get('/api/crm/history/:sourceId', async (req, res) => {
  try {
    const entry = await getEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    await ensureInventory(entry)
    const sourceId = String(req.params.sourceId || '')
    const entity = requireEntity(entry, sourceId)
    const limit = Math.min(100, Math.max(20, Number(req.query?.limit || 60)))
    const beforeId = Math.max(0, Number(req.query?.beforeId || 0))
    const result = await entry.client.getMessages(entity, { limit, offsetId: beforeId })
    const raw = Array.from(result || []).filter(Boolean)
    const messages = raw.map(message => mapMessage(message, sourceId)).sort((left, right) => left.timestamp - right.timestamp || left.messageId - right.messageId)
    const nextBeforeId = raw.length ? Math.min(...raw.map(message => Number(message?.id || 0)).filter(Boolean)) : null
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ messages, hasMore: raw.length === limit, nextBeforeId, total: Number(result?.total ?? messages.length) })
  } catch (error) {
    sendRouteError(res, error, 'Could not load Telegram history.')
  }
})

app.post('/api/crm/message', async (req, res) => {
  try {
    const entry = await getEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    await ensureInventory(entry)
    const sourceId = String(req.body?.channelId || '')
    const text = String(req.body?.text || '').trim().slice(0, 4096)
    if (!text) return res.status(400).json({ error: 'Message text is required.' })
    const entity = requireEntity(entry, sourceId)
    const sent = await entry.client.sendMessage(entity, { message: text })
    const message = mapMessage(sent, sourceId)
    res.json({ ok: true, message })
  } catch (error) {
    sendRouteError(res, error, 'Could not send this Telegram message.', 400)
  }
})

function statusSnapshot(entity) {
  const status = entity?.status
  const name = className(status)
  if (name.includes('online')) return { label: 'Online' }
  if (name.includes('offline')) {
    const raw = status?.wasOnline
    const date = raw instanceof Date ? raw : raw ? new Date(Number(raw) * 1000) : null
    return { label: 'Offline', lastSeenAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined }
  }
  if (name.includes('recently')) return { label: 'Recently' }
  if (name.includes('lastweek')) return { label: 'Within a week' }
  if (name.includes('lastmonth')) return { label: 'Within a month' }
  return { label: 'Unknown' }
}

app.get('/api/crm/profile/:sourceId', async (req, res) => {
  try {
    const entry = await getEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    await ensureInventory(entry)
    const sourceId = String(req.params.sourceId || '')
    const entity = requireEntity(entry, sourceId)
    if (entityKind(entity) !== 'user') return res.status(400).json({ error: 'Full profile information is available for Telegram users.' })

    let full = null
    let mutualGroups = []
    try {
      const result = await entry.client.invoke(new Api.users.GetFullUser({ id: entity }))
      full = result?.fullUser || null
    } catch {}
    try {
      const common = await entry.client.invoke(new Api.messages.GetCommonChats({ userId: entity, maxId: 0, limit: 100 }))
      mutualGroups = Array.from(common?.chats || []).map(sourceFromEntity).filter(Boolean)
    } catch {}

    const status = statusSnapshot(entity)
    const birthday = full?.birthday ? [full.birthday.day, full.birthday.month, full.birthday.year].filter(Boolean).join('/') : undefined
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({
      profile: {
        id: sourceId,
        firstName: entity?.firstName || '',
        lastName: entity?.lastName || '',
        username: entity?.username || '',
        usernames: Array.isArray(entity?.usernames) ? entity.usernames.map(row => row?.username).filter(Boolean) : [],
        phone: entity?.phone || '',
        bio: full?.about || '',
        premium: Boolean(entity?.premium),
        verified: Boolean(entity?.verified),
        bot: Boolean(entity?.bot),
        scam: Boolean(entity?.scam),
        fake: Boolean(entity?.fake),
        blocked: Boolean(full?.blocked),
        commonChatsCount: Number(full?.commonChatsCount || mutualGroups.length),
        voiceMessagesForbidden: Boolean(full?.voiceMessagesForbidden),
        phoneCallsAvailable: full?.phoneCallsAvailable === undefined ? undefined : Boolean(full.phoneCallsAvailable),
        videoCallsAvailable: full?.videoCallsAvailable === undefined ? undefined : Boolean(full.videoCallsAvailable),
        birthday,
        status,
        mutualGroups
      }
    })
  } catch (error) {
    sendRouteError(res, error, 'Could not load Telegram profile.')
  }
})

const cleanup = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of crmClients) {
    if (now - entry.lastUsed > 30 * 60 * 1000) {
      entry.client.disconnect().catch(() => {})
      crmClients.delete(key)
    }
  }
}, 60_000)
cleanup.unref?.()
