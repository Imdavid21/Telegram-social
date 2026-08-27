import { useEffect, useState } from 'react'
import { Box, Fade, LinearProgress, Skeleton, Stack, Typography } from '@mui/material'
import CRMProduct from './CRMProduct'
import { LandingPage } from './components/LandingPage'
import { PromptModal } from './components/AuthModal'
import type { AuthPrompt } from './types'
import { authFlow, authStatus, beginAuth, healthStatus, submitAuth } from './lib/api'
import { haptics } from './lib/interaction'

type Flow = { step: string; error?: string | null; meta?: Record<string, unknown> }
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function promptFromFlow(flow: Flow): AuthPrompt | null {
  if (flow.step === 'phone') return { type: 'phone', title: 'Connect Telegram', hint: 'Enter your Telegram number with country code.' }
  if (flow.step === 'code') return { type: 'code', title: 'Verification code', hint: flow.meta?.viaApp ? 'Telegram sent the code to another signed-in device.' : 'Enter the code Telegram sent you.' }
  if (flow.step === 'password') return { type: 'password', title: 'Two-step verification', hint: String(flow.meta?.hint || 'Enter your Telegram password.') }
  return null
}

function SessionBoot() {
  return <Fade in timeout={220}>
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px 1fr' } }}>
      <Box sx={{ display: { xs: 'none', md: 'block' }, borderRight: 1, borderColor: 'divider', p: 2.5 }}>
        <Typography variant="h3" sx={{ mb: 3 }}>Telegram CRM</Typography>
        <Stack gap={1.2}>{[0, 1, 2, 3].map(row => <Stack direction="row" gap={1.2} alignItems="center" key={row}><Skeleton variant="rounded" width={36} height={36} /><Skeleton width={100} /></Stack>)}</Stack>
      </Box>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 900, width: '100%', mx: 'auto' }}>
        <LinearProgress sx={{ mb: 3, borderRadius: 99 }} />
        <Typography variant="h2">Restoring your workspace</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Loading Telegram relationships and CRM context.</Typography>
        <Stack gap={1.5}>{[0, 1, 2, 3, 4].map(row => <Skeleton key={row} variant="rounded" height={74} />)}</Stack>
      </Box>
    </Box>
  </Fade>
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
      if (!health.ok || !health.configured) throw new Error('Telegram CRM cannot connect to Telegram right now.')
      setBackendReady(true)
      const flow = await settleFlow(await beginAuth())
      if (flow.step === 'done') return void await finishConnection()
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
        return void await finishConnection()
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
  if (connected) return <CRMProduct />

  return <>
    <LandingPage onConnect={connect} connecting={connecting} backendReady={backendReady} error={error} />
    <PromptModal prompt={authPrompt} onSubmit={submitPrompt} onCancel={() => { setAuthPrompt(null); setConnecting(false) }} />
  </>
}
