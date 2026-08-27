import { useState } from 'react'
import type { Audience, Channel, PostDraft } from '../types'
import { createEmptyDraft, deleteDraft, loadDrafts, saveDraft } from '../lib/socialSystem'
import { CloseIcon, ImageIcon, SendIcon } from './Icons'

type Props = { open: boolean; channels: Channel[]; onClose: () => void }

export function SocialComposer({ open, channels, onClose }: Props) {
  const [draft, setDraft] = useState<PostDraft>(() => createEmptyDraft())
  const [drafts, setDrafts] = useState(() => loadDrafts())
  if (!open) return null

  const update = (patch: Partial<PostDraft>) => setDraft(current => ({ ...current, ...patch, updatedAt: Date.now() }))
  const persist = () => { saveDraft(draft); setDrafts(loadDrafts()) }
  const reset = () => setDraft(createEmptyDraft())

  return <div className="sg-social-modal" role="dialog" aria-modal="true" aria-label="Create post">
    <button className="sg-social-backdrop" type="button" onClick={onClose} aria-label="Close composer" />
    <section className="sg-composer-panel">
      <header><div><strong>Create</strong><span>Draft a public post without interrupting your feed.</span></div><button type="button" onClick={onClose} aria-label="Close"><CloseIcon /></button></header>
      <textarea autoFocus value={draft.text} maxLength={4096} onChange={event => update({ text: event.target.value })} placeholder="Share an update…" />
      <div className="sg-composer-row">
        <label>Audience<select value={draft.audience} onChange={event => update({ audience: event.target.value as Audience })}><option value="everyone">Everyone</option><option value="followers">Followers</option><option value="close-friends">Close Friends</option><option value="selected">Selected people</option></select></label>
        <label>Destination<select value={draft.destinationId || ''} onChange={event => update({ destinationId: event.target.value || undefined })}><option value="">My profile</option>{channels.slice(0, 40).map(channel => <option value={channel.id} key={channel.id}>{channel.title}</option>)}</select></label>
      </div>
      <div className="sg-composer-tools"><button type="button" disabled title="Media publishing needs a server-backed upload path"><ImageIcon /> Media</button><label>Planned publish time<input type="datetime-local" onChange={event => update({ scheduledAt: event.target.value ? new Date(event.target.value).getTime() : undefined })} /></label></div>
      <p className="sg-composer-capability">Public publishing is not exposed until the server-backed Supergram post endpoint exists. Drafts stay on this device.</p>
      <footer><button className="sg-primary-action" type="button" disabled={!draft.text.trim()} onClick={() => { persist(); onClose() }}><SendIcon /> Save draft</button></footer>
      {drafts.length > 0 && <aside className="sg-draft-list"><strong>Drafts</strong>{drafts.slice(0, 5).map(item => <div key={item.id}><button type="button" onClick={() => setDraft(item)}>{item.text.slice(0, 70) || 'Untitled draft'}</button><button type="button" onClick={() => { deleteDraft(item.id); setDrafts(loadDrafts()); if (item.id === draft.id) reset() }} aria-label="Delete draft">×</button></div>)}</aside>}
    </section>
  </div>
}