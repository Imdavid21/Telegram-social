import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cookieParser from 'cookie-parser'
import { TelegramClient } from 'teleproto'
import { StringSession } from 'teleproto/sessions'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8787)
const API_ID = Number(process.env.TELEGRAM_API_ID || 0)
const API_HASH = process.env.TELEGRAM_API_HASH || ''
const SESSION_SECRET = process.env.SESSION_SECRET || 'development-only-change-me-please-32chars'
const isProd = process.env.NODE_ENV === 'production'
if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error('SESSION_SECRET must be set to at least 32 characters in production.')

const app = express()
app.use(express.json({ limit: '32kb' }))
app.use(cookieParser())
app.use('/api', (req, res, next) => {
  if (isProd && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin')
    const host = req.get('host')
    if (origin) {
      try { if (new URL(origin).host !== host) return res.status(403).json({ error: 'Cross-origin request blocked.' }) }
      catch { return res.status(403).json({ error: 'Invalid origin.' }) }
    }
  }
  next()
})

const sessionKey = crypto.createHash('sha256').update(SESSION_SECRET).digest()
const SESSION_COOKIE = 'tgs_session'
const FLOW_COOKIE = 'tgs_flow'
const pending = new Map()
const clients = new Map()
const entitiesByClient = new WeakMap()
const sponsorCacheByClient = new WeakMap()
const authRate = new Map()

function cookieOptions(httpOnly = true) {
  return { httpOnly, secure: isProd, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 }
}
function encrypt(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, ciphertext].map(x => x.toString('base64url')).join('.')
}
function decrypt(token) {
  try {
    const [ivRaw, tagRaw, dataRaw] = String(token || '').split('.')
    if (!ivRaw || !tagRaw || !dataRaw) return null
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(ivRaw, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]).toString('utf8')
  } catch { return null }
}
function allowAuthAttempt(req, res) {
  const key = req.ip || req.socket?.remoteAddress || 'unknown'
  const now = Date.now(); const windowMs = 10 * 60 * 1000
  const bucket = authRate.get(key) || { start: now, count: 0 }
  if (now - bucket.start > windowMs) { bucket.start = now; bucket.count = 0 }
  bucket.count += 1; authRate.set(key, bucket)
  if (bucket.count > 8) { res.status(429).json({ error: 'Too many Telegram login attempts from this connection. Try again later.' }); return false }
  return true
}
function requireConfig(res) {
  if (!API_ID || !API_HASH) { res.status(503).json({ error: 'Server Telegram credentials are not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH.' }); return false }
  return true
}
function notify(flow) { for (const wake of flow.watchers.splice(0)) wake() }
function ask(flow, step, meta = {}) {
  flow.step = step; flow.meta = meta; flow.updatedAt = Date.now(); notify(flow)
  return new Promise((resolve, reject) => { flow.resolveInput = resolve; flow.rejectInput = reject })
}
async function waitForStepChange(flow, previous, timeout = 3500) {
  if (flow.step !== previous) return
  await Promise.race([new Promise(resolve => flow.watchers.push(resolve)), new Promise(resolve => setTimeout(resolve, timeout))])
}
function publicFlow(flow) { return { step: flow.step, error: flow.error || null, meta: flow.meta || {} } }
function startFlow() {
  const id = crypto.randomUUID()
  const flow = { id, step: 'starting', meta: {}, error: null, updatedAt: Date.now(), watchers: [], resolveInput: null, rejectInput: null, client: null, session: null }
  pending.set(id, flow)
  const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, { connectionRetries: 5 })
  flow.client = client
  void client.start({
    phoneNumber: () => ask(flow, 'phone', { hint: 'Include your country code.' }),
    phoneCode: isCodeViaApp => ask(flow, 'code', { viaApp: Boolean(isCodeViaApp) }),
    password: hint => ask(flow, 'password', { hint: hint || '' }),
    onError: async err => { flow.error = String(err?.message || err); flow.updatedAt = Date.now(); notify(flow); return false }
  }).then(() => { flow.session = String(client.session.save()); flow.step = 'done'; flow.error = null; flow.updatedAt = Date.now(); notify(flow) })
    .catch(err => { flow.step = 'error'; flow.error = String(err?.message || err); flow.updatedAt = Date.now(); notify(flow) })
  return flow
}
async function getClient(req) {
  const session = decrypt(req.cookies?.[SESSION_COOKIE])
  if (!session) return null
  const key = crypto.createHash('sha256').update(session).digest('hex')
  let entry = clients.get(key)
  if (!entry) {
    const client = new TelegramClient(new StringSession(session), API_ID, API_HASH, { connectionRetries: 5 })
    await client.connect()
    if (!await client.isUserAuthorized()) return null
    entry = { client, lastUsed: Date.now() }; clients.set(key, entry)
  }
  entry.lastUsed = Date.now(); return entry.client
}
function compactNumber(n) { n = Number(n || 0); if (!n) return undefined; if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`; if (n >= 1_000) return `${(n/1_000).toFixed(1)}K`; return String(n) }
function accent(input) { const palette = ['#70B7FF','#9BE8C8','#F7CB73','#C8A7FF','#FF9E7D','#E58FA8','#78D6C6']; let n=0; for (const c of input) n=(n*31+c.charCodeAt(0))|0; return palette[Math.abs(n)%palette.length] }
function initials(title) { return String(title||'TG').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('') || 'TG' }
function reactions(message) { return (message?.reactions?.results || []).slice(0,3).map(row => ({ emoji: row?.reaction?.emoticon || '♥', count: Number(row?.count || 0) })) }
async function getBroadcastDialogs(client) { const dialogs = await client.getDialogs({ limit: 160 }); return dialogs.filter(d => d?.entity?.broadcast === true).slice(0,45) }
async function getSponsoredFor(client, entity) {
  let cache = sponsorCacheByClient.get(client); if (!cache) { cache = new Map(); sponsorCacheByClient.set(client, cache) }
  const id = String(entity.id); const cached = cache.get(id); if (cached && cached.expiresAt > Date.now()) return cached.value
  try { const result = await client.api.messages.getSponsoredMessages({ peer: entity }); const value = { postsBetween: Number(result?.postsBetween || 0), messages: result?.messages || [] }; cache.set(id,{expiresAt:Date.now()+5*60*1000,value}); return value }
  catch { const value={postsBetween:0,messages:[]}; cache.set(id,{expiresAt:Date.now()+5*60*1000,value}); return value }
}

app.get('/api/health', (_req,res)=>res.json({ ok:true, configured:Boolean(API_ID && API_HASH) }))
app.get('/api/auth/status', async (req,res)=>{
  if (!requireConfig(res)) return
  try { const client=await getClient(req); if (!client) return res.json({connected:false}); const me=await client.getMe(); res.json({connected:true,user:{id:String(me.id),firstName:me.firstName||'',username:me.username||''}}) }
  catch { res.json({connected:false}) }
})
app.post('/api/auth/begin', async (req,res)=>{
  if (!requireConfig(res) || !allowAuthAttempt(req,res)) return
  const old=req.cookies?.[FLOW_COOKIE]
  if (old && pending.has(old)) { const prior=pending.get(old); try { prior.rejectInput?.(new Error('AUTH_USER_CANCEL')); await prior.client?.disconnect() } catch {}; pending.delete(old) }
  const flow=startFlow(); res.cookie(FLOW_COOKIE, flow.id, { ...cookieOptions(true), maxAge: 10*60*1000 }); await waitForStepChange(flow,'starting'); res.json(publicFlow(flow))
})
app.get('/api/auth/flow', async (req,res)=>{
  const id=req.cookies?.[FLOW_COOKIE]; const flow=id && pending.get(id); if (!flow) return res.status(404).json({error:'No active Telegram login.'})
  await waitForStepChange(flow,flow.step); res.json(publicFlow(flow))
})
app.post('/api/auth/input', async (req,res)=>{
  if (!allowAuthAttempt(req,res)) return
  const id=req.cookies?.[FLOW_COOKIE]; const flow=id && pending.get(id); if (!flow) return res.status(404).json({error:'No active Telegram login.'})
  if (!flow.resolveInput) return res.status(409).json({error:'Telegram is not waiting for input.'})
  const value=String(req.body?.value||'').trim(); if (!value) return res.status(400).json({error:'Value is required.'})
  const previous=flow.step; const resolve=flow.resolveInput; flow.resolveInput=null; flow.rejectInput=null; flow.step='processing'; resolve(value); await waitForStepChange(flow,'processing',4500)
  if (flow.step==='done' && flow.session) { res.cookie(SESSION_COOKIE, encrypt(flow.session), cookieOptions(true)); res.clearCookie(FLOW_COOKIE,{path:'/'}); pending.delete(id) }
  res.json(publicFlow(flow))
})
app.post('/api/auth/logout', async (req,res)=>{
  try { const client=await getClient(req); await client?.disconnect() } catch {}
  res.clearCookie(SESSION_COOKIE,{path:'/'}); res.clearCookie(FLOW_COOKIE,{path:'/'}); res.json({ok:true})
})
app.get('/api/feed', async (req,res)=>{
  if (!requireConfig(res)) return
  try {
    const client=await getClient(req); if (!client) return res.status(401).json({error:'Connect Telegram first.'})
    const dialogs=await getBroadcastDialogs(client)
    const channelRows=[]; const feed=[]; const entityMap=new Map()
    for (const dialog of dialogs) {
      const e=dialog.entity; const channelId=String(e.id); entityMap.set(channelId,e)
      channelRows.push({ id:channelId, title:e.title||'Untitled channel', username:e.username||undefined, initials:initials(e.title), accent:accent(channelId), unread:Number(dialog.unreadCount||0), followers:compactNumber(e.participantsCount) })
      const messages=await client.getMessages(e,{limit:12})
      for (const m of messages) {
        if (!m?.id) continue
        const id=`${channelId}-${m.id}`
        let media
        if (m.photo || m.video || m.document) media={ kind:m.video?'video':'photo', src:`/api/media/${encodeURIComponent(channelId)}/${m.id}` }
        feed.push({ id, messageId:Number(m.id), channelId, timestamp:Number(m.date||0)*1000, text:m.message||'', unread:true, saved:false, media, reactions:reactions(m), views:compactNumber(m.views), comments:Number(m.replies?.replies||0)||0 })
      }
      const sponsored=await getSponsoredFor(client,e)
      for (const s of sponsored.messages) {
        const randomId=Buffer.from(s.randomId||[]).toString('base64url')
        feed.push({ id:`sponsored-${channelId}-${randomId}`, messageId:0, channelId, timestamp:Date.now(), text:s.message||'', unread:false, saved:false, reactions:[], sponsored:{ label:s.recommended?'Recommended':'Sponsored', title:s.title||'Sponsored', url:s.url||'https://telegram.org', buttonText:s.buttonText||'Learn more', randomId, sponsorInfo:s.sponsorInfo||undefined, additionalInfo:s.additionalInfo||undefined } })
      }
    }
    entitiesByClient.set(client,entityMap); feed.sort((a,b)=>b.timestamp-a.timestamp); res.json({channels:channelRows,feed})
  } catch (err) { res.status(500).json({error:String(err?.message||err)}) }
})
app.get('/api/media/:channelId/:messageId', async (req,res)=>{
  try { const client=await getClient(req); if (!client) return res.status(401).end(); const map=entitiesByClient.get(client); const entity=map?.get(String(req.params.channelId)); if (!entity) return res.status(404).end(); const messages=await client.getMessages(entity,{ids:[Number(req.params.messageId)]}); const m=messages?.[0]; if (!m) return res.status(404).end(); const buffer=await client.downloadMedia(m,{workers:1}); if (!buffer) return res.status(404).end(); res.setHeader('Cache-Control','private, max-age=300'); res.type('application/octet-stream').send(buffer) } catch { res.status(404).end() }
})
app.post('/api/save', async (req,res)=>{
  try { const client=await getClient(req); if (!client) return res.status(401).json({error:'Connect Telegram first.'}); const map=entitiesByClient.get(client); const entity=map?.get(String(req.body?.channelId)); if (!entity) return res.status(404).json({error:'Channel not loaded.'}); const messages=await client.getMessages(entity,{ids:[Number(req.body?.messageId)]}); const m=messages?.[0]; if (!m) return res.status(404).json({error:'Message not found.'}); await client.forwardMessages('me',{messages:[m]}); res.json({ok:true}) } catch(err) { res.status(500).json({error:String(err?.message||err)}) }
})
function decodeRandomId(value) { return Buffer.from(String(value||''),'base64url') }
app.post('/api/sponsored/view', async (req,res)=>{ try { const client=await getClient(req); if (!client) return res.status(401).json({error:'Connect Telegram first.'}); await client.api.messages.viewSponsoredMessage({randomId:decodeRandomId(req.body?.randomId)}); res.json({ok:true}) } catch(err){ res.status(500).json({error:String(err?.message||err)}) } })
app.post('/api/sponsored/click', async (req,res)=>{ try { const client=await getClient(req); if (!client) return res.status(401).json({error:'Connect Telegram first.'}); await client.api.messages.clickSponsoredMessage({randomId:decodeRandomId(req.body?.randomId), media:false, fullscreen:false}); res.json({ok:true}) } catch(err){ res.status(500).json({error:String(err?.message||err)}) } })

setInterval(()=>{
  const now=Date.now()
  for (const [id,flow] of pending) if (now-flow.updatedAt>10*60*1000) { try { flow.rejectInput?.(new Error('AUTH_TIMEOUT')); flow.client?.disconnect() } catch {}; pending.delete(id) }
  for (const [key,entry] of clients) if (now-entry.lastUsed>30*60*1000) { try { entry.client.disconnect() } catch {}; clients.delete(key) }
  for (const [key,bucket] of authRate) if (now-bucket.start>20*60*1000) authRate.delete(key)
},60_000).unref?.()

if (!process.env.VERCEL) {
  const dist=path.resolve(__dirname,'../dist')
  if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('*',(_req,res)=>res.sendFile(path.join(dist,'index.html'))) }
  app.listen(PORT,()=>console.log(`Telegram.Social server listening on http://localhost:${PORT}`))
}

export default app
