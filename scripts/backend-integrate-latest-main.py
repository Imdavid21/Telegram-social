from pathlib import Path

# Merge the latest Telegram account/profile work into the already-combined
# search/reaction/context branch without replacing either tranche.

p = Path('src/ProductApp.tsx')
s = p.read_text()
s = s.replace(
    "import type { AlbumMedia, Channel, FeedDiagnostics, FeedFilter, FeedItem, FeedPage, FeedUpdate, MediaAsset, TelegramSearchResponse, UserSettings } from './types'",
    "import type { AlbumMedia, Channel, FeedDiagnostics, FeedFilter, FeedItem, FeedPage, FeedUpdate, MediaAsset, TelegramAccount, TelegramSearchResponse, UserSettings } from './types'",
    1,
)
s = s.replace(
    "type Me = { id: string; firstName: string; username?: string }",
    "type Me = TelegramAccount",
    1,
)
anchor = "      const channel = channelMap.get(item.channelId)\n      if (!channel || hiddenPosts.has(item.id)) return false\n"
replacement = anchor + "      if (item.outgoing && (item.sourceType === 'person' || item.sourceType === 'group')) return false\n"
if "if (item.outgoing && (item.sourceType === 'person' || item.sourceType === 'group')) return false" not in s:
    if anchor not in s:
        raise SystemExit('ProductApp visible-feed anchor missing')
    s = s.replace(anchor, replacement, 1)
p.write_text(s)

p = Path('server/index.mjs')
s = p.read_text()
ready = """app.get('/api/ready', (_req, res) => {
  if (!configured) return res.status(503).json({ ok: false, configured: false })
  res.json({ ok: true, configured: true })
})

"""
account = r'''async function accountSnapshot(entry) {
  const me = await entry.client.getMe()
  let full = null
  let contentSettings = null
  let globalPrivacy = null
  try {
    const result = await entry.client.invoke(new Api.users.GetFullUser({ id: me }))
    full = result?.fullUser || null
  } catch {}
  try { contentSettings = await entry.client.invoke(new Api.account.GetContentSettings()) } catch {}
  try { globalPrivacy = await entry.client.invoke(new Api.account.GetGlobalPrivacySettings()) } catch {}

  return {
    id: String(me.id),
    firstName: me.firstName || '',
    lastName: me.lastName || '',
    username: me.username || '',
    usernames: Array.isArray(me.usernames) ? me.usernames.map(row => row?.username).filter(Boolean) : [],
    bio: full?.about || '',
    premium: Boolean(me.premium),
    verified: Boolean(me.verified),
    scam: Boolean(me.scam),
    fake: Boolean(me.fake),
    avatar: `/api/me/avatar`,
    commonChatsCount: Number(full?.commonChatsCount || 0),
    voiceMessagesForbidden: Boolean(full?.voiceMessagesForbidden),
    translationDisabled: Boolean(full?.translationDisabled),
    settings: {
      sensitiveContentEnabled: contentSettings ? !Boolean(contentSettings.sensitiveEnabled === false) : undefined,
      canSetContentSettings: contentSettings ? Boolean(contentSettings.sensitiveCanChange) : undefined,
      archiveAndMuteNewNoncontactPeers: globalPrivacy ? Boolean(globalPrivacy.archiveAndMuteNewNoncontactPeers) : undefined,
      keepArchivedUnmuted: globalPrivacy ? Boolean(globalPrivacy.keepArchivedUnmuted) : undefined,
      keepArchivedFolders: globalPrivacy ? Boolean(globalPrivacy.keepArchivedFolders) : undefined,
      hideReadMarks: globalPrivacy ? Boolean(globalPrivacy.hideReadMarks) : undefined
    },
    capabilities: {
      reactions: true,
      replies: true,
      channelComments: true,
      forwarding: true,
      savedMessages: true,
      media: true,
      unread: true,
      searchLoadedHistory: true,
      fullTelegramSearch: true,
      localContextSummaries: true,
      privateChatContext: true
    }
  }
}

'''
if 'async function accountSnapshot(entry)' not in s:
    if ready not in s:
        raise SystemExit('server ready-route anchor missing')
    s = s.replace(ready, ready + account, 1)
old_status = """    const me = await entry.client.getMe()
    res.json({ connected: true, user: { id: String(me.id), firstName: me.firstName || '', username: me.username || '' } })"""
new_status = """    const user = await accountSnapshot(entry)
    res.json({ connected: true, user })"""
if old_status in s:
    s = s.replace(old_status, new_status, 1)
elif new_status not in s:
    raise SystemExit('server auth-status payload anchor missing')

profile_routes = r'''app.get('/api/account', async (req, res) => {
  try {
    const entry = await getClientEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    const user = await accountSnapshot(entry)
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ user })
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.get('/api/me/avatar', async (req, res) => {
  try {
    const entry = await getClientEntry(req)
    if (!entry) return res.status(401).end()
    const me = await entry.client.getMe()
    const key = `me:${String(me.id)}`
    const cached = entry.avatarCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('Cache-Control', 'private, max-age=1800')
      res.type('image/jpeg').send(cached.buffer)
      return
    }
    const buffer = await entry.client.downloadProfilePhoto(me, { isBig: false, requestTimeout: 15_000 })
    if (!Buffer.isBuffer(buffer) || !buffer.length) return res.status(404).end()
    entry.avatarCache.set(key, { buffer, expiresAt: Date.now() + 30 * 60 * 1000 })
    res.setHeader('Cache-Control', 'private, max-age=1800')
    res.type('image/jpeg').send(buffer)
  } catch {
    res.status(404).end()
  }
})

'''
if "app.get('/api/account'" not in s:
    auth_begin = "app.post('/api/auth/begin', async (req, res) => {"
    if auth_begin not in s:
        raise SystemExit('server auth-begin anchor missing')
    s = s.replace(auth_begin, profile_routes + auth_begin, 1)
p.write_text(s)
