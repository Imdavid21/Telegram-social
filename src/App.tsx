import { useEffect, useState } from 'react'
import { Skeleton } from './components/ui/skeleton'
import ProductApp from './ProductApp'
import { LandingPage } from './components/LandingPage'
import { DemoPage } from './components/DemoPage'
import { PromptModal } from './components/AuthModal'
import { ScrollAnchorBridge } from './components/ScrollAnchorBridge'
import { BrandMark } from './components/BrandMark'
import { GlobalSocialLayer } from './components/GlobalSocialLayer'
import type { AuthPrompt } from './types'
import { authFlow, authStatus, beginAuth, healthStatus, submitAuth } from './lib/api'
import { haptics } from './lib/interaction'

type Flow = { step: string; error?: string | null; meta?: Record<string, unknown> }
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function promptFromFlow(flow: Flow): AuthPrompt | null {
  if (flow.step === 'phone') return { type: 'phone', title: 'Your phone number', hint: 'Enter your Telegram number with country code.' }
  if (flow.step === 'code') return { type: 'code', title: 'Verification code', hint: flow.meta?.viaApp ? 'Telegram sent the code to another signed-in device.' : 'Enter the code Telegram sent you.' }
  if (flow.step === 'password') return { type: 'password', title: 'Two-step verification', hint: String(flow.meta?.hint || 'Enter your Telegram password.') }
  return null
}

function SessionBoot() {
  return <main className="sg-session-boot" aria-label="Restoring Supergram session">
    <aside className="sg-session-boot-rail">
      <div className="sg-session-boot-brand"><BrandMark /><strong>Supergram</strong></div>
      {[0,1,2,3,4].map(i => <div className="sg-session-boot-nav" key={i}><Skeleton className="h-[22px] w-[22px] rounded-full" /><Skeleton className="h-[18px] w-[82px]" /></div>)}
    </aside>
    <section className="sg-session-boot-feed">
      <div className="sg-session-boot-stories">{[0,1,2,3,4,5].map(i => <Skeleton key={i} className="h-[52px] w-[52px] rounded-full" />)}</div>
      {[0,1,2].map(i => <div className="sg-session-boot-card" key={i}>
        <div><Skeleton className="h-9 w-9 rounded-full" /><span><Skeleton className="h-[17px] w-28" /><Skeleton className="h-[13px] w-[72px]" /></span></div>
        <Skeleton className={i === 0 ? "h-[340px] w-full rounded-none" : "h-[180px] w-full rounded-none"} />
        <Skeleton className="h-4 w-[74%]" /><Skeleton className="h-4 w-[54%]" />
      </div>)}
    </section>
  </main>
}

export default function App() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [backendReady, setBackendReady] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | null>(null)
  const [error, setError] = useState('')
  const demoMode = new URLSearchParams(window.location.search).get('demo') === '1'

  useEffect(() => {
    let active = true
    const check = async () => {
      try {
        const health = await healthStatus()
        if (!active) return
        setBackendReady(Boolean(health.ok && health.configured))
        if (!health.ok || !health.configured) { setConnected(false); return }
        const status = await authStatus()
        if (active) setConnected(Boolean(status.connected))
      } catch (e) {
        if (!active) return
        setBackendReady(false); setConnected(false); setError(String((e as Error)?.message || 'Could not reach Telegram.'))
      }
    }
    void check()
    const interval = window.setInterval(() => { if (connected) void check() }, 3000)
    const onFocus = () => { void check() }
    window.addEventListener('focus', onFocus)
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [connected])

  async function settleFlow(initial: Flow): Promise<Flow> {
    let flow = initial
    for (let i = 0; i < 25 && (flow.step === 'starting' || flow.step === 'processing'); i++) { await delay(400); flow = await authFlow() }
    return flow
  }

  async function finishConnection() {
    const status = await authStatus()
    if (!status.connected) throw new Error('Telegram authorization did not complete.')
    haptics.success(); setAuthPrompt(null); setError(''); setConnected(true)
    if (demoMode) window.location.href = '/'
  }

  async function connect() {
    if (connecting) return
    haptics.light(); setError(''); setConnecting(true)
    try {
      const health = await healthStatus()
      if (!health.ok || !health.configured) throw new Error('Supergram can’t connect to Telegram right now.')
      setBackendReady(true)
      const flow = await settleFlow(await beginAuth())
      if (flow.step === 'done') return void await finishConnection()
      const prompt = promptFromFlow(flow)
      if (!prompt) throw new Error(flow.error || 'Telegram login could not start.')
      setAuthPrompt(prompt)
    } catch (e) { haptics.error(); setError(String((e as Error)?.message || e)); setConnecting(false) }
  }

  async function submitPrompt(value: string) {
    setError('')
    try {
      const flow = await settleFlow(await submitAuth(value))
      if (flow.step === 'done') { setConnecting(false); return void await finishConnection() }
      if (flow.step === 'error') throw new Error(flow.error || 'Telegram login failed.')
      const prompt = promptFromFlow(flow)
      if (prompt) setAuthPrompt(prompt)
    } catch (e) { haptics.error(); setConnecting(false); setAuthPrompt(null); setError(String((e as Error)?.message || e)) }
  }

  if (connected === null) return <SessionBoot />
  if (demoMode && !connected) return <><DemoPage onConnect={connect} /><PromptModal prompt={authPrompt} onSubmit={submitPrompt} onCancel={() => { setAuthPrompt(null); setConnecting(false) }} /></>
  if (connected) return <ScrollAnchorBridge><ProductApp /><GlobalSocialLayer /></ScrollAnchorBridge>

  return <>
    <LandingPage onConnect={connect} onDemo={() => { window.location.href = '/?demo=1' }} connecting={connecting} backendReady={backendReady} booting={false} error={error} />
    <PromptModal prompt={authPrompt} onSubmit={submitPrompt} onCancel={() => { setAuthPrompt(null); setConnecting(false) }} />
  </>
}