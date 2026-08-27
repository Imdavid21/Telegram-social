import { useEffect, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Fade, LinearProgress, TextField } from '@mui/material'
import type { AuthPrompt } from '../types'

export function PromptModal({ prompt, onSubmit, onCancel }: { prompt: AuthPrompt | null; onSubmit: (value: string) => void | Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { setValue(''); setBusy(false) }, [prompt?.type])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!prompt || !value.trim() || busy) return
    setBusy(true)
    try { await onSubmit(value.trim()) } finally { setBusy(false) }
  }

  return (
    <Dialog open={Boolean(prompt)} onClose={busy ? undefined : onCancel} fullWidth maxWidth="xs" slots={{
      transition: Fade
    }}>
      {busy ? <LinearProgress /> : null}
      <form onSubmit={submit}>
        <DialogTitle>{prompt?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{prompt?.hint}</DialogContentText>
          <TextField
            autoFocus
            fullWidth
            value={value}
            onChange={event => setValue(event.target.value)}
            disabled={busy}
            type={prompt?.type === 'password' ? 'password' : prompt?.type === 'phone' ? 'tel' : 'text'}
            inputMode={prompt?.type === 'code' ? 'numeric' : prompt?.type === 'phone' ? 'tel' : undefined}
            autoComplete={prompt?.type === 'password' ? 'current-password' : prompt?.type === 'phone' ? 'tel' : 'one-time-code'}
            label={prompt?.type === 'phone' ? 'Phone number' : prompt?.type === 'password' ? 'Password' : 'Verification code'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!value.trim() || busy}>{busy ? 'Checking' : 'Continue'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
