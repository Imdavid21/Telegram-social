import { useEffect, useRef, useState } from 'react'
import type { AuthPrompt } from '../types'
import { CloseIcon } from './Icons'

export function PromptModal({ prompt, onSubmit, onCancel }: {
  prompt: AuthPrompt | null
  onSubmit: (value: string) => void | Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue('')
    setSubmitting(false)
    setTimeout(() => input.current?.focus(), 40)
  }, [prompt?.type])

  if (!prompt) return null

  return <div className="modal-backdrop" role="presentation">
    <form className="modal" onSubmit={async e => {
      e.preventDefault()
      if (!value.trim() || submitting) return
      setSubmitting(true)
      try { await onSubmit(value.trim()) }
      finally { setSubmitting(false) }
    }}>
      <button type="button" className="icon-button modal-close" onClick={onCancel} aria-label="Cancel Telegram login"><CloseIcon /></button>
      <div className="eyebrow">TELEGRAM AUTH</div>
      <h2>{prompt.title}</h2>
      <p>{prompt.hint}</p>
      <input ref={input} className="text-input" type={prompt.type === 'password' ? 'password' : 'text'} value={value} onChange={e => setValue(e.target.value)} autoComplete={prompt.type === 'password' ? 'current-password' : 'one-time-code'} />
      <button className="primary-button" type="submit" disabled={!value.trim() || submitting}>{submitting ? 'Checking…' : 'Continue'}</button>
    </form>
  </div>
}
