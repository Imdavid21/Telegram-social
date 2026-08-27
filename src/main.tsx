import { Component, StrictMode, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import App from './App'
import { MotionProvider } from './components/motion/Reactive'
import { initInteractionEnvironment } from './lib/interaction'
import { loadSettings } from './lib/storage'
import { store } from './store/store'
import './shadcn.css'
import './styles.css'
import './production.css'
import './feed.css'
import './feed-engine.css'
import './landing.css'
import './demo.css'
import './identity.css'
import './app-system.css'
import './session-boot.css'
import './ux-overhaul.css'
import './instagram-desktop.css'
import './backend-search.css'
import './social-system.css'
import './product-v2.css'
import './product-ai.css'
import './product-feed.css'
import './product-create.css'
import './product-secondary.css'
import './demo-v3.css'
import './motion-reactive.css'
import './feed-system-cleanup.css'
import './monochrome-ui.css'
import './feed-symmetry.css'

function ThemeBridge({children}:{children:ReactNode}){
 useEffect(()=>{
  const apply=()=>{const mode=loadSettings().themeMode;const resolved=mode==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):mode;document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved}
  apply()
  const media=window.matchMedia('(prefers-color-scheme: light)')
  const changed=()=>apply()
  window.addEventListener('supergram:settings-changed',changed)
  window.addEventListener('supergram:local-data-cleared',changed)
  media.addEventListener?.('change',changed)
  return()=>{window.removeEventListener('supergram:settings-changed',changed);window.removeEventListener('supergram:local-data-cleared',changed);media.removeEventListener?.('change',changed)}
 },[])
 return <>{children}</>
}
class RootErrorBoundary extends Component<{children:ReactNode},{error:Error|null}>{state={error:null as Error|null};static getDerivedStateFromError(error:Error){return{error}};componentDidCatch(error:Error,info:ErrorInfo){console.error('Supergram render failure',error,info)};render(){if(!this.state.error)return this.props.children;return <main className="min-h-screen grid place-items-center bg-background text-foreground p-6"><section className="w-full max-w-lg rounded-xl border border-border bg-background p-6"><h1 className="m-0 text-xl font-semibold">Supergram hit a rendering error</h1><p className="mt-2 text-sm text-muted-foreground">Reload the app. If this keeps happening, the latest client build needs attention.</p><button onClick={()=>location.reload()} className="mt-5 h-10 rounded-md border border-border px-4 text-sm font-semibold">Reload Supergram</button></section></main>}}
initInteractionEnvironment()
createRoot(document.getElementById('root')!).render(<StrictMode><Provider store={store}><RootErrorBoundary><MotionProvider><ThemeBridge><App/></ThemeBridge></MotionProvider></RootErrorBoundary></Provider></StrictMode>)