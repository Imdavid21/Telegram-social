from pathlib import Path

# Backend: richer account profile, avatar, Telegram-exposed settings/capabilities.
p = Path('server/index.mjs')
s = p.read_text()
anchor = "app.get('/api/auth/status', async (req, res) => {\n"
if anchor not in s:
    raise SystemExit('auth status anchor missing')
helper = r'''async function accountSnapshot(entry) {
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
      fullTelegramSearch: false,
      localContextSummaries: true,
      privateChatContext: true
    }
  }
}

'''
s = s.replace(anchor, helper + anchor, 1)
old = "    const me = await entry.client.getMe()\n    res.json({ connected: true, user: { id: String(me.id), firstName: me.firstName || '', username: me.username || '' } })"
new = "    const user = await accountSnapshot(entry)\n    res.json({ connected: true, user })"
if old not in s:
    raise SystemExit('auth status payload anchor missing')
s = s.replace(old, new, 1)
profile_routes = r'''
app.get('/api/account', async (req, res) => {
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
route_anchor = "app.post('/api/auth/begin', async (req, res) => {"
if route_anchor not in s:
    raise SystemExit('route insert anchor missing')
s = s.replace(route_anchor, profile_routes + route_anchor, 1)
p.write_text(s)

# Types: richer account object.
p = Path('src/types.ts')
s = p.read_text()
insert_anchor = "export interface UserSettings {\n"
account_type = r'''export interface TelegramAccount {
  id: string
  firstName: string
  lastName?: string
  username?: string
  usernames?: string[]
  bio?: string
  premium?: boolean
  verified?: boolean
  scam?: boolean
  fake?: boolean
  avatar?: string
  commonChatsCount?: number
  voiceMessagesForbidden?: boolean
  translationDisabled?: boolean
  settings?: {
    sensitiveContentEnabled?: boolean
    canSetContentSettings?: boolean
    archiveAndMuteNewNoncontactPeers?: boolean
    keepArchivedUnmuted?: boolean
    keepArchivedFolders?: boolean
    hideReadMarks?: boolean
  }
  capabilities?: Record<string, boolean>
}

'''
if account_type not in s:
    s = s.replace(insert_anchor, account_type + insert_anchor, 1)
p.write_text(s)

# API client: richer auth/account types.
p = Path('src/lib/api.ts')
s = p.read_text()
s = s.replace("import type { Channel, FeedDiagnostics, FeedItem, FeedPage, FeedUpdate } from '../types'", "import type { Channel, FeedDiagnostics, FeedItem, FeedPage, FeedUpdate, TelegramAccount } from '../types'", 1)
s = s.replace("return request<{ connected: boolean; user?: { id: string; firstName: string; username?: string } }>('/api/auth/status')", "return request<{ connected: boolean; user?: TelegramAccount }>('/api/auth/status')", 1)
a = "export function beginAuth()"
if "export function fetchTelegramAccount()" not in s:
    s = s.replace(a, "export function fetchTelegramAccount() { return request<{ user: TelegramAccount }>('/api/account') }\n" + a, 1)
p.write_text(s)

# Product app: keep outgoing chat messages in context, not visible feed cards.
p = Path('src/ProductApp.tsx')
s = p.read_text()
s = s.replace("import type { AlbumMedia, Channel, FeedDiagnostics, FeedFilter, FeedItem, FeedPage, FeedUpdate, MediaAsset, UserSettings } from './types'", "import type { AlbumMedia, Channel, FeedDiagnostics, FeedFilter, FeedItem, FeedPage, FeedUpdate, MediaAsset, TelegramAccount, UserSettings } from './types'", 1)
s = s.replace("type Me = { id: string; firstName: string; username?: string }\n", "type Me = TelegramAccount\n", 1)
# Filter visible feed after collapse and before all other filters; summary context map still uses full collapsedFeed.
visible_anchor = "  const visibleFeed = useMemo(() => {\n    let rows = collapsedFeed"
if visible_anchor in s:
    s = s.replace(visible_anchor, "  const visibleFeed = useMemo(() => {\n    let rows = collapsedFeed.filter(item => !(item.outgoing && (item.sourceType === 'person' || item.sourceType === 'group'))) ", 1)
else:
    raise SystemExit('visibleFeed anchor missing')
p.write_text(s)

# Settings dialog: profile header + Telegram settings/capability inventory.
p = Path('src/components/SettingsDialog.tsx')
s = p.read_text()
s = s.replace("  Typography,\n", "  Typography,\n  Avatar,\n  Chip,\n", 1)
s = s.replace("import type { ThemeMode, UserSettings } from '../types'", "import type { TelegramAccount, ThemeMode, UserSettings } from '../types'", 1)
s = s.replace("  account: { firstName: string; username?: string } | null", "  account: TelegramAccount | null", 1)
old_block = '''        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary">Telegram</Typography>
          <Typography variant="body1" fontWeight={700}>{account?.username ? `@${account.username}` : account?.firstName || 'Connected account'}</Typography>
          <Typography variant="body2" color="text.secondary">{account?.firstName || 'Connected to Telegram'}</Typography>
          <Button variant="outlined" color="inherit" onClick={onLogout} sx={{ alignSelf: 'flex-start' }}>Switch Telegram account</Button>
        </Stack>'''
new_block = '''        <Stack spacing={1.5}>
          <Typography variant="overline" color="text.secondary">Telegram account</Typography>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar src={account?.avatar} alt="" sx={{ width: 52, height: 52 }}>{account?.firstName?.[0] || 'T'}</Avatar>
            <Stack spacing={.25} minWidth={0}>
              <Stack direction="row" spacing={.75} alignItems="center" flexWrap="wrap">
                <Typography variant="body1" fontWeight={750}>{[account?.firstName, account?.lastName].filter(Boolean).join(' ') || 'Connected account'}</Typography>
                {account?.premium && <Chip label="Premium" size="small" variant="outlined" />}
                {account?.verified && <Chip label="Verified" size="small" variant="outlined" />}
              </Stack>
              {account?.username && <Typography variant="body2" color="text.secondary">@{account.username}</Typography>}
              {account?.bio && <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{account.bio}</Typography>}
            </Stack>
          </Stack>
          <Typography variant="caption" color="text.secondary">Telegram settings exposed to this client are shown read-only. Supergram does not change them unless a feature explicitly says it will.</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {account?.settings?.archiveAndMuteNewNoncontactPeers !== undefined && <Chip size="small" label={`Auto-archive strangers: ${account.settings.archiveAndMuteNewNoncontactPeers ? 'On' : 'Off'}`} />}
            {account?.settings?.keepArchivedUnmuted !== undefined && <Chip size="small" label={`Keep unmuted archived: ${account.settings.keepArchivedUnmuted ? 'On' : 'Off'}`} />}
            {account?.settings?.hideReadMarks !== undefined && <Chip size="small" label={`Hide read marks: ${account.settings.hideReadMarks ? 'On' : 'Off'}`} />}
            {account?.translationDisabled !== undefined && <Chip size="small" label={`Translation: ${account.translationDisabled ? 'Off' : 'On'}`} />}
          </Stack>
          <Typography variant="overline" color="text.secondary" sx={{ mt: .5 }}>Available in Supergram</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {Object.entries(account?.capabilities || {}).filter(([, enabled]) => enabled).map(([key]) => <Chip key={key} size="small" variant="outlined" label={key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())} />)}
          </Stack>
          <Button variant="outlined" color="inherit" onClick={onLogout} sx={{ alignSelf: 'flex-start' }}>Switch Telegram account</Button>
        </Stack>'''
if old_block not in s:
    raise SystemExit('Telegram settings block anchor missing')
s = s.replace(old_block, new_block, 1)
p.write_text(s)
