import express from 'express'
import cookieParser from 'cookie-parser'

const app = express()
app.use(express.json({ limit: '32kb' }))
app.use(cookieParser())
let connected = false
let flow = { step: 'starting', error: null }

const demo = {
  channels: [
    { id: 'design', title: 'Design Dispatch', username: 'design_dispatch', initials: 'DD', accent: '#56d6b0', unread: 3, followers: '18.4K' },
    { id: 'product', title: 'Product Signals', username: 'productsignals', initials: 'PS', accent: '#f2b56b', unread: 0, followers: '42.1K' },
  ],
  feed: [],
}
app.get('/api/auth/status', (_req, res) => res.json({ connected }))
app.post('/api/auth/begin', (_req, res) => { flow = { step: 'phone', error: null }; res.json(flow) })
app.post('/api/auth/input', (req, res) => { flow = { step: flow.step === 'phone' ? 'code' : flow.step === 'code' ? 'password' : 'done', error: null }; connected = flow.step === 'done'; res.json(flow) })
app.get('/api/auth/flow', (_req, res) => res.json(flow))
app.post('/api/auth/logout', (_req, res) => { connected = false; flow = { step: 'starting', error: null }; res.json({ ok: true }) })
app.get('/api/feed', (_req, res) => res.json(demo))
app.post('/api/save', (_req, res) => res.json({ ok: true }))
app.post('/api/sponsored/view', (_req, res) => res.json({ ok: true }))
app.post('/api/sponsored/click', (_req, res) => res.json({ ok: true }))

export default function handler(req, res) { return app(req, res) }
if (process.env.NODE_ENV !== 'production') {
  const port = Number(process.env.PORT || 8787)
  app.listen(port, () => console.log(`[server] Telegram API listening on ${port}`))
}
