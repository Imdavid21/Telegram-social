import { useEffect, useState } from 'react'
import { SocialComposer } from './SocialComposer'
import { SendIcon } from './Icons'

export function GlobalSocialLayer() {
  const [composerOpen, setComposerOpen] = useState(false)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setComposerOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  return <>
    <button className="sg-global-create" type="button" onClick={() => setComposerOpen(true)} aria-label="Create post"><SendIcon /><span>Create</span></button>
    <SocialComposer open={composerOpen} channels={[]} onClose={() => setComposerOpen(false)} />
  </>
}