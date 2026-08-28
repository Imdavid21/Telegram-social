import { useEffect, useState } from 'react'
import { Box, Fade, LinearProgress, Skeleton, Stack, Typography } from '@mui/material'
import CRMApp from './CRMApp'
import { MinimalLandingPage } from './components/MinimalLandingPage'
import { PromptModal } from './components/AuthModal'
import type { AuthPrompt } from './types'
import { authFlow, authStatus, beginAuth, healthStatus, submitAuth } from './lib/api'
import { haptics } from './lib/interaction'

type Flow = { step: string; error?: string | null; meta?: Record<string, unknown> }
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function promptFromFlow(flow: Flow): AuthPrompt | null {
  if (flow.step === 'phone') return { type: 'phone', title: 'Connect Telegram', hint: '1 of 3 · Enter your phone number with country code.' }
  if (flow.step === 'code') return { type: 'code', title: 'Enter your code', hint: flow.meta?.viaApp ? '2 of 3 · Telegram sent it to another signed-in device.' : '2 of 3 · Enter the code Telegram sent you.' }
  if (flow.step === 'password') return { type: 'password', title: 'Two-step verification', hint: String(flow.meta?.hint || '3 of 3 · Enter your Telegram password.') }
  return null
}

function SessionBoot() {
  return <Fade in timeout={180}><Box sx={{ height: '100dvh', display: 'grid', placeItems: 'center', p: 3 }}><Box sx={{ width: '100%', maxWidth: 420 }}><LinearProgress sx={{ mb: 2.5, borderRadius: 99 }} /><Typography variant="h2">Checking your relationships</Typography><Typography sx={{ color: 'text.secondary', mt: .7, mb: 2 }}>Finding the conversations that need attention.</Typography><Stack sx={{ gap: 1 }}>{[0, 1, 2].map(row => <Skeleton key={row} variant="rounded" height={58} />)}</Stack></Box></Box></Fade>
}

export default function App() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [backendReady, setBackendReady] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | null>(null)
  const [error, setError] = useState('')

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
        setBackendReady(false)
        setConnected(false)
        setError(String((e as Error)?.message || 'Could not reach Telegram.'))
      }
    }
    void check()
    const onFocus = () => { void check() }
    window.addEventListener('focus', onFocus)
    return () => { active = false; window.removeEventListener('focus', onFocus) }
  }, [])

  async function settleFlow(initial: Flow): Promise<Flow> {
    let flow = initial
    for (let index = 0; index < 25 && (flow.step === 'starting' || flow.step === 'processing'); index++) {
      await delay(400)
      flow = await authFlow()
    }
    return flow
  }

  async function finishConnection() {
    const status = await authStatus()
    if (!status.connected) throw new Error('Telegram authorization did not complete.')
    haptics.success()
    setAuthPrompt(null)
    setError('')
    setConnected(true)
  }

  async function connect() {
    if (connecting) return
    haptics.light()
    setError('')
    setConnecting(true)
    try {
      const health = await healthStatus()
      if (!health.ok || !health.configured) throw new Error('Telegram cannot be connected right now. Please try again shortly.')
      setBackendReady(true)
      const flow = await settleFlow(await beginAuth())
      if (flow.step === 'done') return void (await finishConnection())
      const prompt = promptFromFlow(flow)
      if (!prompt) throw new Error(flow.error || 'Telegram login could not start.')
      setAuthPrompt(prompt)
    } catch (e) {
      haptics.error()
      setError(String((e as Error)?.message || e))
      setConnecting(false)
    }
  }

  async function submitPrompt(value: string) {
    setError('')
    try {
      const flow = await settleFlow(await submitAuth(value))
      if (flow.step === 'done') {
        setConnecting(false)
        return void (await finishConnection())
      }
      if (flow.step === 'error') throw new Error(flow.error || 'Telegram login failed.')
      const prompt = promptFromFlow(flow)
      if (prompt) setAuthPrompt(prompt)
    } catch (e) {
      haptics.error()
      setConnecting(false)
      setAuthPrompt(null)
      setError(String((e as Error)?.message || e))
    }
  }

  if (connected === null) return <SessionBoot />
  if (connected) return <CRMApp />

  return <>
    <MinimalLandingPage onConnect={connect} connecting={connecting} backendReady={backendReady} error={error} />
    <PromptModal prompt={authPrompt} onSubmit={submitPrompt} onCancel={() => { setAuthPrompt(null); setConnecting(false) }} />
  </>
}
