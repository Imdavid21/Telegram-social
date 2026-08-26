from pathlib import Path

p = Path('server/index.mjs')
s = p.read_text()
s = s.replace("import { TelegramClient } from 'teleproto'", "import { Api, TelegramClient } from 'teleproto'", 1)
marker = "app.post('/api/save', async (req, res) => {"
block = """app.post('/api/reaction', async (req, res) => {
  if (!requireConfig(res)) return
  try {
    const entry = await getClientEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    await ensureInventory(entry)
    const sourceId = String(req.body?.channelId || '')
    const messageId = Number(req.body?.messageId || 0)
    const liked = Boolean(req.body?.liked)
    const entity = entry.entityMap.get(sourceId)
    if (!entity || !messageId) return res.status(400).json({ error: 'Invalid post.' })
    await entry.client.sendReaction(entity, messageId, liked ? [new Api.ReactionEmoji({ emoticon: '❤' })] : [])
    res.json({ ok: true, liked })
  } catch (error) { res.status(400).json({ error: String(error?.message || 'Could not react to this post.') }) }
})

app.post('/api/reply', async (req, res) => {
  if (!requireConfig(res)) return
  try {
    const entry = await getClientEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    await ensureInventory(entry)
    const sourceId = String(req.body?.channelId || '')
    const messageId = Number(req.body?.messageId || 0)
    const text = String(req.body?.text || '').trim()
    const entity = entry.entityMap.get(sourceId)
    if (!entity || !messageId || !text) return res.status(400).json({ error: 'Reply text is required.' })
    const sent = await entry.client.sendMessage(entity, isBroadcastEntity(entity) ? { message: text, commentTo: messageId } : { message: text, replyTo: messageId })
    res.json({ ok: true, messageId: Number(sent?.id || 0) })
  } catch (error) { res.status(400).json({ error: String(error?.message || 'Could not send this reply.') }) }
})

app.get('/api/share-targets', async (req, res) => {
  if (!requireConfig(res)) return
  try {
    const entry = await getClientEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    await ensureInventory(entry)
    const me = await entry.client.getMe().catch(() => null)
    const selfId = me?.id ? `user:${String(me.id)}` : ''
    const targets = [...entry.sourceMap.values()].filter(source => source.type === 'person' && source.id !== selfId).slice(0, 250).map(source => ({ id: source.id, title: source.title, username: source.username, initials: source.initials, accent: source.accent, avatar: source.avatar }))
    res.json({ targets })
  } catch (error) { res.status(400).json({ error: String(error?.message || 'Could not load contacts.') }) }
})

app.post('/api/forward', async (req, res) => {
  if (!requireConfig(res)) return
  try {
    const entry = await getClientEntry(req)
    if (!entry) return res.status(401).json({ error: 'Connect Telegram first.' })
    await ensureInventory(entry)
    const sourceId = String(req.body?.channelId || '')
    const messageId = Number(req.body?.messageId || 0)
    const targetId = String(req.body?.targetId || '')
    const source = entry.entityMap.get(sourceId)
    const target = entry.entityMap.get(targetId)
    if (!source || !target || !messageId) return res.status(400).json({ error: 'Invalid forwarding target.' })
    await entry.client.forwardMessages(target, { messages: messageId, fromPeer: source })
    res.json({ ok: true })
  } catch (error) { res.status(400).json({ error: String(error?.message || 'Could not forward this post.') }) }
})

"""
if '/api/reaction' not in s:
    if marker not in s: raise SystemExit('save endpoint marker not found')
    s = s.replace(marker, block + marker, 1)
p.write_text(s)

p = Path('src/lib/api.ts')
s = p.read_text()
marker = "export function saveTelegramPost(item: FeedItem) {"
block = """export type ShareTarget = { id: string; title: string; username?: string; initials?: string; accent?: string; avatar?: string }
export function setTelegramReaction(item: FeedItem, liked: boolean) { return request<{ ok: boolean; liked: boolean }>('/api/reaction', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId, liked }) }) }
export function replyToTelegramPost(item: FeedItem, text: string) { return request<{ ok: boolean; messageId?: number }>('/api/reply', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId, text }) }) }
export function fetchShareTargets() { return request<{ targets: ShareTarget[] }>('/api/share-targets') }
export function forwardTelegramPost(item: FeedItem, targetId: string) { return request<{ ok: boolean }>('/api/forward', { method: 'POST', body: JSON.stringify({ channelId: item.channelId, messageId: item.messageId, targetId }) }) }

"""
if 'setTelegramReaction' not in s:
    s = s.replace(marker, block + marker, 1)
p.write_text(s)

p = Path('src/components/FeedCard.tsx')
s = p.read_text()
s = s.replace("import { BookmarkIcon, EyeIcon, LockIcon, MessageIcon, MoreIcon, SendIcon } from './Icons'", "import { BookmarkIcon, EyeIcon, HeartIcon, LockIcon, MessageIcon, MoreIcon, SendIcon } from './Icons'", 1)
s = s.replace("import { summarizeMessage } from '../lib/api'", "import { fetchShareTargets, forwardTelegramPost, replyToTelegramPost, setTelegramReaction, summarizeMessage, type ShareTarget } from '../lib/api'", 1)
state_marker = "  const [moreOpen, setMoreOpen] = useState(false)\n"
if '[liked, setLiked]' not in s:
    s = s.replace(state_marker, state_marker + "  const [liked, setLiked] = useState(false)\n  const [likeBusy, setLikeBusy] = useState(false)\n  const [replyOpen, setReplyOpen] = useState(false)\n  const [replyText, setReplyText] = useState('')\n  const [replyBusy, setReplyBusy] = useState(false)\n  const [shareOpen, setShareOpen] = useState(false)\n  const [shareTargets, setShareTargets] = useState<ShareTarget[]>([])\n  const [shareLoading, setShareLoading] = useState(false)\n  const [shareBusy, setShareBusy] = useState('')\n  const [interactionError, setInteractionError] = useState('')\n", 1)
start = "  const share = async () => {\n"
end = "  const handleSave = useCallback(() => {\n"
if start in s:
    a, b = s.find(start), s.find(end)
    handlers = """  async function toggleLike() {
    if (likeBusy) return
    const next = !liked
    setLiked(next); setLikeBusy(true); setInteractionError(''); haptics.light()
    try { await setTelegramReaction(item, next) } catch (error) { setLiked(!next); setInteractionError(String((error as Error)?.message || 'Could not update reaction.')); haptics.error() } finally { setLikeBusy(false) }
  }
  async function sendReply() {
    const value = replyText.trim(); if (!value || replyBusy) return
    setReplyBusy(true); setInteractionError('')
    try { await replyToTelegramPost(item, value); setReplyText(''); setReplyOpen(false); haptics.success() } catch (error) { setInteractionError(String((error as Error)?.message || 'Could not send reply.')); haptics.error() } finally { setReplyBusy(false) }
  }
  async function openShare() {
    if (item.noForwards) return
    setShareOpen(true); if (shareTargets.length || shareLoading) return
    setShareLoading(true); setInteractionError('')
    try { const result = await fetchShareTargets(); setShareTargets(Array.isArray(result.targets) ? result.targets : []) } catch (error) { setInteractionError(String((error as Error)?.message || 'Could not load contacts.')) } finally { setShareLoading(false) }
  }
  async function forwardTo(targetId: string) {
    if (shareBusy) return
    setShareBusy(targetId); setInteractionError('')
    try { await forwardTelegramPost(item, targetId); setShareOpen(false); haptics.success() } catch (error) { setInteractionError(String((error as Error)?.message || 'Could not forward post.')); haptics.error() } finally { setShareBusy('') }
  }

"""
    s = s[:a] + handlers + s[b:]
old = """    <div className=\"sg-post-actions\">\n      <div className=\"sg-actions-left\">\n        <button className={`sg-action pressable ${item.noForwards ? 'is-disabled' : ''}`} disabled={item.noForwards} onClick={share} aria-label={item.noForwards ? 'Sharing restricted' : 'Share'}><SendIcon /></button>\n        {original ? <a className=\"sg-action pressable\" href={original} target=\"_blank\" rel=\"noreferrer\" aria-label=\"Open in Telegram\" onClick={handleOriginalOpen}><MessageIcon /></a> : <span className=\"sg-action is-disabled\" title=\"Private source\"><MessageIcon /></span>}\n      </div>\n      <span className=\"sg-save-slot\">\n        <button className={`sg-action pressable ${item.saved ? 'is-active' : ''}`} onClick={handleSave} aria-label={item.saved ? 'Remove from saved' : 'Save'}><BookmarkIcon /></button>\n        {saveConfirm ? <SuccessConfirm onComplete={() => setSaveConfirm(false)} /> : null}\n      </span>\n    </div>\n"""
new = """    <div className=\"sg-post-actions sg-post-actions-ref\">\n      <div className=\"sg-actions-left\">\n        <button className={`sg-action pressable sg-like ${liked ? 'is-liked' : ''}`} disabled={likeBusy} onClick={() => void toggleLike()} aria-label={liked ? 'Unlike on Telegram' : 'Like on Telegram'}><HeartIcon /></button>\n        <button className=\"sg-action pressable\" onClick={() => { setInteractionError(''); setReplyOpen(true) }} aria-label=\"Quote reply on Telegram\"><MessageIcon /></button>\n        <button className={`sg-action pressable ${item.noForwards ? 'is-disabled' : ''}`} disabled={item.noForwards} onClick={() => void openShare()} aria-label={item.noForwards ? 'Forwarding restricted' : 'Forward to contact'}><SendIcon /></button>\n      </div>\n      <span className=\"sg-save-slot\"><button className={`sg-action pressable ${item.saved ? 'is-active' : ''}`} onClick={handleSave} aria-label={item.saved ? 'Remove from saved' : 'Save'}><BookmarkIcon /></button>{saveConfirm ? <SuccessConfirm onComplete={() => setSaveConfirm(false)} /> : null}</span>\n    </div>\n    {interactionError && <div className=\"sg-interaction-error\">{interactionError}</div>}\n"""
if 'sg-post-actions-ref' not in s:
    if old not in s: raise SystemExit('actions block not found')
    s = s.replace(old, new, 1)
marker = "    <BottomSheet open={moreOpen}"
sheets = """    <BottomSheet open={replyOpen} onClose={() => setReplyOpen(false)} title=\"Reply\"><div className=\"sg-reply-box\"><div className=\"sg-reply-context\"><strong>{channel.title}</strong><span>{clipAtWord(cleanText(text) || 'Original post', 120)}</span></div><textarea value={replyText} onChange={event => setReplyText(event.target.value)} placeholder=\"Write a reply…\" autoFocus /><button type=\"button\" disabled={!replyText.trim() || replyBusy} onClick={() => void sendReply()}>{replyBusy ? 'Sending…' : 'Reply on Telegram'}</button></div></BottomSheet>\n\n    <BottomSheet open={shareOpen} onClose={() => setShareOpen(false)} title=\"Forward to\"><div className=\"sg-share-picker\">{shareLoading ? <><Skeleton height={52} /><Skeleton height={52} /><Skeleton height={52} /></> : shareTargets.length ? shareTargets.map(target => <button type=\"button\" key={target.id} disabled={Boolean(shareBusy)} onClick={() => void forwardTo(target.id)}><span className=\"sg-share-avatar\" style={{ background: target.accent || '#777' }}>{target.initials || target.title.slice(0, 2).toUpperCase()}</span><span><strong>{target.title}</strong>{target.username && <small>@{target.username}</small>}</span><em>{shareBusy === target.id ? 'Sending…' : 'Send'}</em></button>) : <div className=\"sg-share-empty\">No Telegram contacts found.</div>}</div></BottomSheet>\n\n"""
if 'title=\"Forward to\"' not in s: s = s.replace(marker, sheets + marker, 1)
p.write_text(s)

p = Path('src/app-system.css')
s = p.read_text()
if 'Telegram-native post actions' not in s:
    s += """\n/* Telegram-native post actions */\n.sg-post-actions-ref{display:flex!important;align-items:center!important;justify-content:space-between!important;min-height:34px;margin-top:8px!important}.sg-post-actions-ref .sg-actions-left{display:flex;align-items:center;gap:7px}.sg-post-actions-ref .sg-action{width:30px;height:30px;padding:4px;display:grid;place-items:center;background:transparent!important;color:var(--app-muted);border:0;border-radius:6px}.sg-post-actions-ref .sg-action svg{width:20px;height:20px}.sg-post-actions-ref .sg-action:hover{color:var(--app-text);transform:translateY(-1px)}.sg-post-actions-ref .sg-action.is-liked{color:#ed4956}.sg-post-actions-ref .sg-action.is-liked svg{fill:currentColor}.sg-interaction-error{margin:2px 13px 8px;color:var(--app-danger);font-size:10px;line-height:1.4}.sg-reply-box{display:grid;gap:12px}.sg-reply-context{display:grid;gap:4px;padding:12px;border:1px solid var(--app-border-soft);border-radius:10px;background:var(--app-raised)}.sg-reply-context span{color:var(--app-muted);font-size:11px;line-height:1.45}.sg-reply-box textarea{min-height:110px;resize:vertical;padding:13px;border:1px solid var(--app-border);border-radius:10px;background:var(--app-surface);color:var(--app-text);outline:0}.sg-reply-box>button{height:44px;border:0;border-radius:10px;background:var(--app-text);color:var(--app-bg);font-weight:700}.sg-share-picker{display:grid;gap:2px}.sg-share-picker>button{min-height:58px;padding:8px 6px;display:grid;grid-template-columns:42px 1fr auto;align-items:center;gap:10px;border:0;border-radius:10px;background:transparent;color:var(--app-text);text-align:left}.sg-share-picker>button:hover{background:var(--app-hover)}.sg-share-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:11px;font-weight:800}.sg-share-picker>button>span:nth-child(2){display:grid;gap:2px}.sg-share-picker strong{font-size:12px}.sg-share-picker small{color:var(--app-muted);font-size:10px}.sg-share-picker em{font-style:normal;color:var(--app-secondary);font-size:10px}.sg-share-empty{padding:30px 8px;text-align:center;color:var(--app-muted);font-size:12px}\n"""
p.write_text(s)
