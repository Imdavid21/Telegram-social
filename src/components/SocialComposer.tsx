import { useMemo, useState } from 'react'
import type { Audience, Channel, PostDraft } from '../types'
import { createEmptyDraft, deleteDraft, loadDrafts, saveDraft } from '../lib/socialSystem'
import { CloseIcon, ImageIcon, SendIcon } from './Icons'

type Props = { open: boolean; channels: Channel[]; onClose: () => void }

export function SocialComposer({ open, channels, onClose }: Props) {
  const [draft, setDraft] = useState<PostDraft>(() => createEmptyDraft())
  const [drafts, setDrafts] = useState(() => loadDrafts())
  const destinations = useMemo(() => channels.filter(channel => channel.type === 'channel' || channel.type === 'group').slice(0, 40), [channels])
  if (!open) return null

  const update = (patch: Partial<PostDraft>) => setDraft(current => ({ ...current, ...patch, updatedAt: Date.now() }))
  const persist = () => { saveDraft(draft); setDrafts(loadDrafts()) }
  const reset = () => setDraft(createEmptyDraft())

  return <div className="sg-social-modal" role="dialog" aria-modal="true" aria-label="Create post">
    <button className="sg-social-backdrop" type="button" onClick={onClose} aria-label="Close composer" />
    <section className="sg-composer-panel">
      <header><div><strong>Create</strong><span>Post to your Supergram network</span></div><button type="button" onClick={onClose} aria-label="Close"><CloseIcon /></button></header>
      <textarea autoFocus value={draft.text} maxLength={4096} onChange={event => update({ text: event.target.value })} placeholder="Share an update…" />
      <div className="sg-composer-row">
        <label>Audience<select value={draft.audience} onChange={event => update({ audience: event.target.value as Audience })}><option value="everyone">Everyone</option><option value="followers">Followers</option><option value="close-friends">Close Friends</option><option value="selected">Selected people</option></select></label>
        <label>Destination<select value={draft.destinationId || ''} onChange={event => update({ destinationId: event.target.value || undefined })}><option value="">My profile</option>{destinations.map(channel => <option value={channel.id} key={channel.id}>{channel.title}</option>)}</select></label>
      </div>
      <div className="sg-composer-tools"><button type="button" disabled title="Media upload will use the Telegram upload path"><ImageIcon /> Media</button><label>Schedule<input type="datetime-local" onChange={event => update({ scheduledAt: event.target.value ? new Date(event.target.value).getTime() : undefined })} /></label></div>
      <footer><button type="button" onClick={persist}>Save draft</button><button className="sg-primary-action" type="button" disabled={!draft.text.trim()} onClick={() => { persist(); onClose() }}><SendIcon /> {draft.scheduledAt ? 'Schedule' : 'Publish'}</button></footer>
      {drafts.length > 0 && <aside className="sg-draft-list"><strong>Drafts</strong>{drafts.slice(0, 5).map(item => <div key={item.id}><button type="button" onClick={() => setDraft(item)}>{item.text.slice(0, 70) || 'Untitled draft'}</button><button type="button" onClick={() => { deleteDraft(item.id); setDrafts(loadDrafts()); if (item.id === draft.id) reset() }} aria-label="Delete draft">×</button></div>)}</aside>}
    </section>
  </div>
}