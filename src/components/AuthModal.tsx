import { useEffect, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import type { AuthPrompt } from '../types'

export function PromptModal({ prompt, onSubmit, onCancel }: {
  prompt: AuthPrompt | null
  onSubmit: (value: string) => void | Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setValue('')
    setSubmitting(false)
  }, [prompt?.type])

  if (!prompt) return null

  const isPhone = prompt.type === 'phone'
  const isCode = prompt.type === 'code'
  const type = prompt.type === 'password' ? 'password' : isPhone ? 'tel' : 'text'
  const autoComplete = prompt.type === 'password' ? 'current-password' : isPhone ? 'tel' : 'one-time-code'
  const label = isPhone ? 'Telegram phone number' : isCode ? 'Verification code' : 'Telegram password'

  return <Dialog open onClose={submitting ? undefined : onCancel} fullWidth maxWidth="xs" aria-labelledby="telegram-auth-title">
    <form onSubmit={async event => {
      event.preventDefault()
      if (!value.trim() || submitting) return
      setSubmitting(true)
      try { await onSubmit(value.trim()) }
      finally { setSubmitting(false) }
    }}>
      <DialogTitle id="telegram-auth-title">{prompt.title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{prompt.hint}</Typography>
        <TextField
          autoFocus
          fullWidth
          label={label}
          type={type}
          value={value}
          onChange={event => setValue(event.target.value)}
          autoComplete={autoComplete}
          inputProps={{ inputMode: isCode ? 'numeric' : isPhone ? 'tel' : undefined, 'aria-describedby': 'auth-disclosure' }}
          disabled={submitting}
        />
        <Typography id="auth-disclosure" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, lineHeight: 1.55 }}>
          Supergram signs in through Telegram’s API. Your login code and password are used only to authorize your Telegram session. Supergram is an independent client and is not affiliated with Telegram.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button type="button" color="inherit" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={!value.trim() || submitting}>{submitting ? 'Checking…' : 'Continue'}</Button>
      </DialogActions>
    </form>
  </Dialog>
}
