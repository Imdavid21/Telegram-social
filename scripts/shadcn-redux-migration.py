from pathlib import Path
import json

# package migration
p=Path('package.json')
data=json.loads(p.read_text())
deps=data['dependencies']
for key in ['@emotion/react','@emotion/styled','@mui/icons-material','@mui/material']:
    deps.pop(key,None)
deps.update({
  '@reduxjs/toolkit':'^2.9.0',
  'react-redux':'^9.2.0',
  '@radix-ui/react-dialog':'^1.1.15',
  '@radix-ui/react-switch':'^1.2.6',
  '@radix-ui/react-avatar':'^1.1.10',
  '@radix-ui/react-tabs':'^1.1.13',
  'class-variance-authority':'^0.7.1',
  'clsx':'^2.1.1',
  'tailwind-merge':'^3.3.1',
  'lucide-react':'^0.468.0'
})
data['devDependencies'].update({'tailwindcss':'^4.1.12','@tailwindcss/vite':'^4.1.12','@types/node':'^22.15.0'})
p.write_text(json.dumps(data,indent=2)+"\n")

Path('components.json').write_text('''{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {"css": "src/shadcn.css", "baseColor": "neutral", "cssVariables": true},
  "aliases": {"components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks"},
  "iconLibrary": "lucide"
}\n''')

# tsconfig aliases
for name in ['tsconfig.json','tsconfig.app.json']:
    p=Path(name); obj=json.loads(p.read_text())
    co=obj.setdefault('compilerOptions',{})
    co['baseUrl']='.'; co['paths']={'@/*':['./src/*']}
    p.write_text(json.dumps(obj,indent=2)+"\n")

# Vite + Tailwind
Path('vite.config.ts').write_text('''import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { proxy: { '/api': 'http://localhost:8787' } }
})
''')

Path('src/lib/utils.ts').write_text('''import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
''')
Path('src/components/ui').mkdir(parents=True,exist_ok=True)
Path('src/components/ui/button.tsx').write_text('''import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
export const buttonVariants=cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[.985]',{variants:{variant:{default:'bg-primary text-primary-foreground hover:opacity-90',secondary:'bg-secondary text-secondary-foreground hover:bg-accent',outline:'border border-border bg-background hover:bg-accent hover:text-accent-foreground',ghost:'hover:bg-accent hover:text-accent-foreground',destructive:'bg-destructive text-destructive-foreground hover:opacity-90'},size:{default:'h-10 px-4 py-2',sm:'h-9 rounded-md px-3',lg:'h-11 rounded-md px-8',icon:'h-10 w-10'}},defaultVariants:{variant:'default',size:'default'}})
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>,VariantProps<typeof buttonVariants>{asChild?:boolean}
export const Button=React.forwardRef<HTMLButtonElement,ButtonProps>(({className,variant,size,asChild=false,...props},ref)=>{const Comp:any=asChild?Slot:'button';return <Comp className={cn(buttonVariants({variant,size}),className)} ref={ref} {...props}/>});Button.displayName='Button'
''')
Path('src/components/ui/skeleton.tsx').write_text('''import { cn } from '@/lib/utils'
export function Skeleton({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('animate-pulse rounded-md bg-muted',className)} {...props}/>}
''')
Path('src/components/ui/input.tsx').write_text('''import * as React from 'react'
import { cn } from '@/lib/utils'
export const Input=React.forwardRef<HTMLInputElement,React.ComponentProps<'input'>>(({className,type,...props},ref)=><input type={type} className={cn('flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',className)} ref={ref} {...props}/>);Input.displayName='Input'
''')
Path('src/components/ui/separator.tsx').write_text('''import { cn } from '@/lib/utils'
export function Separator({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div role="separator" className={cn('h-px w-full bg-border',className)} {...props}/>}
''')
Path('src/components/ui/badge.tsx').write_text('''import { cn } from '@/lib/utils'
export function Badge({className,...props}:React.HTMLAttributes<HTMLSpanElement>){return <span className={cn('inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground',className)} {...props}/>}
''')
Path('src/components/ui/switch.tsx').write_text('''import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'
export const Switch=React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>,React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(({className,...props},ref)=><SwitchPrimitive.Root className={cn('peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition-colors data-[state=checked]:bg-primary',className)} {...props} ref={ref}><SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"/></SwitchPrimitive.Root>);Switch.displayName='Switch'
''')
Path('src/components/ui/avatar.tsx').write_text('''import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cn } from '@/lib/utils'
export const Avatar=React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Root>,React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>>(({className,...props},ref)=><AvatarPrimitive.Root ref={ref} className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full',className)} {...props}/>);Avatar.displayName='Avatar'
export const AvatarImage=React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Image>,React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>>(({className,...props},ref)=><AvatarPrimitive.Image ref={ref} className={cn('aspect-square h-full w-full object-cover',className)} {...props}/>);AvatarImage.displayName='AvatarImage'
export const AvatarFallback=React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Fallback>,React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>>(({className,...props},ref)=><AvatarPrimitive.Fallback ref={ref} className={cn('flex h-full w-full items-center justify-center rounded-full bg-muted text-xs font-semibold',className)} {...props}/>);AvatarFallback.displayName='AvatarFallback'
''')
Path('src/components/ui/dialog.tsx').write_text('''import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
export const Dialog=DialogPrimitive.Root;export const DialogTrigger=DialogPrimitive.Trigger;export const DialogClose=DialogPrimitive.Close
export const DialogPortal=DialogPrimitive.Portal
export const DialogOverlay=React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>,React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(({className,...props},ref)=><DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-[110] bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out',className)} {...props}/>);DialogOverlay.displayName='DialogOverlay'
export const DialogContent=React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>,React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(({className,children,...props},ref)=><DialogPortal><DialogOverlay/><DialogPrimitive.Content ref={ref} className={cn('fixed left-1/2 top-1/2 z-[120] grid w-[calc(100%-24px)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-background p-0 shadow-2xl duration-200 sm:w-full',className)} {...props}>{children}<DialogPrimitive.Close className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close"><X className="h-4 w-4"/></DialogPrimitive.Close></DialogPrimitive.Content></DialogPortal>);DialogContent.displayName='DialogContent'
export function DialogHeader({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('flex flex-col gap-1.5 px-5 pt-5 text-left',className)} {...props}/>}
export function DialogFooter({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('flex items-center justify-end gap-2 border-t border-border px-5 py-4',className)} {...props}/>}
export const DialogTitle=React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>,React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(({className,...props},ref)=><DialogPrimitive.Title ref={ref} className={cn('text-base font-semibold tracking-tight',className)} {...props}/>);DialogTitle.displayName='DialogTitle'
export const DialogDescription=React.forwardRef<React.ElementRef<typeof DialogPrimitive.Description>,React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(({className,...props},ref)=><DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground',className)} {...props}/>);DialogDescription.displayName='DialogDescription'
''')
# Slot dep is needed by button
if '@radix-ui/react-slot' not in deps: deps['@radix-ui/react-slot']='^1.2.3'
Path('package.json').write_text(json.dumps(data,indent=2)+"\n")

# Redux UI state
Path('src/store').mkdir(exist_ok=True)
Path('src/store/uiSlice.ts').write_text('''import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { loadSettings } from '@/lib/storage'
import type { FeedFilter, UserSettings } from '@/types'
type UIState={filter:FeedFilter;query:string;sourceFilter:string|null;searchOpen:boolean;settingsOpen:boolean;sourceBrowserOpen:boolean;discussionItemId:string|null;settings:UserSettings}
const initialState:UIState={filter:'all',query:'',sourceFilter:null,searchOpen:false,settingsOpen:false,sourceBrowserOpen:false,discussionItemId:null,settings:loadSettings()}
const slice=createSlice({name:'ui',initialState,reducers:{setFilter:(s,a:PayloadAction<FeedFilter>)=>{s.filter=a.payload},setQuery:(s,a:PayloadAction<string>)=>{s.query=a.payload},setSourceFilter:(s,a:PayloadAction<string|null>)=>{s.sourceFilter=a.payload},setSearchOpen:(s,a:PayloadAction<boolean>)=>{s.searchOpen=a.payload},setSettingsOpen:(s,a:PayloadAction<boolean>)=>{s.settingsOpen=a.payload},setSourceBrowserOpen:(s,a:PayloadAction<boolean>)=>{s.sourceBrowserOpen=a.payload},setDiscussionItemId:(s,a:PayloadAction<string|null>)=>{s.discussionItemId=a.payload},setSettings:(s,a:PayloadAction<UserSettings>)=>{s.settings=a.payload}}})
export const {setFilter,setQuery,setSourceFilter,setSearchOpen,setSettingsOpen,setSourceBrowserOpen,setDiscussionItemId,setSettings}=slice.actions
export default slice.reducer
''')
Path('src/store/store.ts').write_text('''import { configureStore } from '@reduxjs/toolkit'
import ui from './uiSlice'
export const store=configureStore({reducer:{ui},devTools:import.meta.env.DEV})
export type RootState=ReturnType<typeof store.getState>
export type AppDispatch=typeof store.dispatch
''')
Path('src/store/hooks.ts').write_text('''import { useDispatch,useSelector } from 'react-redux'
import type { TypedUseSelectorHook } from 'react-redux'
import type { AppDispatch,RootState } from './store'
export const useAppDispatch=()=>useDispatch<AppDispatch>()
export const useAppSelector:TypedUseSelectorHook<RootState>=useSelector
''')

# Tailwind/shadcn variables and desktop benchmark overrides
Path('src/shadcn.css').write_text('''@import "tailwindcss";
:root{--background:0 0% 100%;--foreground:240 6% 7%;--card:0 0% 100%;--card-foreground:240 6% 7%;--popover:0 0% 100%;--popover-foreground:240 6% 7%;--primary:200 72% 49%;--primary-foreground:0 0% 100%;--secondary:240 5% 96%;--secondary-foreground:240 6% 10%;--muted:240 5% 96%;--muted-foreground:240 4% 46%;--accent:240 5% 96%;--accent-foreground:240 6% 10%;--destructive:0 72% 51%;--destructive-foreground:0 0% 100%;--border:240 6% 90%;--input:240 6% 90%;--ring:200 72% 49%;--radius:.75rem}
html[data-theme='dark']{--background:240 5% 6%;--foreground:240 5% 96%;--card:240 5% 7%;--card-foreground:240 5% 96%;--popover:240 5% 8%;--popover-foreground:240 5% 96%;--secondary:240 4% 12%;--secondary-foreground:240 5% 96%;--muted:240 4% 12%;--muted-foreground:240 5% 64%;--accent:240 4% 14%;--accent-foreground:240 5% 96%;--border:240 4% 16%;--input:240 4% 16%}
@theme inline{--color-background:hsl(var(--background));--color-foreground:hsl(var(--foreground));--color-primary:hsl(var(--primary));--color-primary-foreground:hsl(var(--primary-foreground));--color-secondary:hsl(var(--secondary));--color-secondary-foreground:hsl(var(--secondary-foreground));--color-muted:hsl(var(--muted));--color-muted-foreground:hsl(var(--muted-foreground));--color-accent:hsl(var(--accent));--color-accent-foreground:hsl(var(--accent-foreground));--color-destructive:hsl(var(--destructive));--color-destructive-foreground:hsl(var(--destructive-foreground));--color-border:hsl(var(--border));--color-input:hsl(var(--input));--color-ring:hsl(var(--ring))}
''')
Path('src/instagram-desktop.css').write_text('''/* Desktop social benchmark: restrained Instagram-like geometry, Telegram behavior */
@media (min-width:1260px){.sg-left-rail{width:245px;padding:28px 20px;border-right:1px solid var(--sg-border-soft)}.sg-main{width:auto;margin-left:245px;margin-right:360px;padding:0 34px 80px;display:block}.sg-feed-column{width:min(630px,100%);margin:0 auto}.sg-context-rail{position:fixed;right:0;top:0;bottom:0;width:360px;padding:42px 34px 30px 22px;overflow:auto;background:var(--sg-bg)}.sg-post{padding:20px 0 28px}.sg-post-head{grid-template-columns:40px minmax(0,1fr) auto auto;height:44px}.sg-avatar{width:40px;height:40px}.sg-media{border-radius:4px}.sg-feed-toolbar{height:58px;display:flex;align-items:center;justify-content:space-between}.sg-primary-nav{margin-top:34px;gap:5px}.sg-primary-nav button,.sg-rail-bottom button{min-height:48px;border-radius:8px;font-size:15px}.sg-brand strong{font-size:21px}}
@media (min-width:768px) and (max-width:1259px){.sg-left-rail{width:76px;padding:26px 12px}.sg-left-rail .sg-brand strong,.sg-primary-nav button>span:last-child,.sg-rail-bottom button>span:last-child{display:none}.sg-main{margin-left:76px;width:auto;padding:0 28px 70px}.sg-feed-column{width:min(630px,100%);margin:auto}.sg-context-rail{display:none}}
.sg-settings-shadcn{max-height:min(88vh,760px);overflow:hidden}.sg-settings-scroll{max-height:calc(88vh - 110px);overflow:auto;padding:0 20px 22px}.sg-settings-section{padding:18px 0}.sg-settings-section h3{margin:0 0 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--sg-text-3)}.sg-settings-row{min-height:48px;display:flex;align-items:center;justify-content:space-between;gap:16px}.sg-settings-row>span{display:grid;gap:2px}.sg-settings-row small{color:var(--sg-text-3);font-size:11px}.sg-theme-segment{display:flex;gap:4px;padding:4px;border-radius:10px;background:var(--sg-surface)}.sg-theme-segment button{height:34px;padding:0 11px;border:0;border-radius:7px;background:transparent;color:var(--sg-text-2);font-size:12px}.sg-theme-segment button.is-active{background:var(--sg-bg);color:var(--sg-text);box-shadow:0 1px 3px rgba(0,0,0,.15)}.sg-profile-settings{display:flex;align-items:center;gap:12px;padding-bottom:4px}.sg-profile-settings-copy{min-width:0;display:grid;gap:2px}.sg-profile-settings-copy strong{font-size:15px}.sg-profile-settings-copy span,.sg-profile-settings-copy p{margin:0;color:var(--sg-text-3);font-size:12px}.sg-capability-grid{display:flex;flex-wrap:wrap;gap:6px}.sg-settings-danger{color:var(--sg-danger)!important}.sg-settings-linkrow{display:flex;gap:8px}
''')

# main.tsx remove MUI theme provider, use Redux theme state
Path('src/main.tsx').write_text('''import { Component, StrictMode, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import App from './App'
import { initInteractionEnvironment } from './lib/interaction'
import { store } from './store/store'
import { useAppSelector } from './store/hooks'
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

function ThemeBridge({children}:{children:ReactNode}){
 const mode=useAppSelector(s=>s.ui.settings.themeMode)
 useEffect(()=>{const apply=()=>{const resolved=mode==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):mode;document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved};apply();if(mode!=='system')return;const media=window.matchMedia('(prefers-color-scheme: light)');media.addEventListener?.('change',apply);return()=>media.removeEventListener?.('change',apply)},[mode])
 return <>{children}</>
}
class RootErrorBoundary extends Component<{children:ReactNode},{error:Error|null}>{state={error:null as Error|null};static getDerivedStateFromError(error:Error){return{error}};componentDidCatch(error:Error,info:ErrorInfo){console.error('Supergram render failure',error,info)};render(){if(!this.state.error)return this.props.children;return <main className="min-h-screen grid place-items-center bg-background text-foreground p-6"><section className="w-full max-w-lg rounded-xl border border-border bg-background p-6"><h1 className="m-0 text-xl font-semibold">Supergram hit a rendering error</h1><p className="mt-2 text-sm text-muted-foreground">Reload the app. If this keeps happening, the latest client build needs attention.</p><button onClick={()=>location.reload()} className="mt-5 h-10 rounded-md border border-border px-4 text-sm font-semibold">Reload Supergram</button></section></main>}}
initInteractionEnvironment()
createRoot(document.getElementById('root')!).render(<StrictMode><Provider store={store}><RootErrorBoundary><ThemeBridge><App/></ThemeBridge></RootErrorBoundary></Provider></StrictMode>)
''')

# App skeleton migration
p=Path('src/App.tsx');s=p.read_text().replace("import { Skeleton } from '@mui/material'","import { Skeleton } from './components/ui/skeleton'")
s=s.replace('<Skeleton variant="circular" width={22} height={22} />','<Skeleton className="h-[22px] w-[22px] rounded-full" />').replace('<Skeleton width={82} height={18} />','<Skeleton className="h-[18px] w-[82px]" />')
s=s.replace('<Skeleton key={i} variant="circular" width={52} height={52} />','<Skeleton key={i} className="h-[52px] w-[52px] rounded-full" />')
s=s.replace('<Skeleton variant="circular" width={36} height={36} />','<Skeleton className="h-9 w-9 rounded-full" />').replace('<Skeleton width={112} height={17} />','<Skeleton className="h-[17px] w-28" />').replace('<Skeleton width={72} height={13} />','<Skeleton className="h-[13px] w-[72px]" />')
s=s.replace('<Skeleton variant="rectangular" width="100%" height={i === 0 ? 340 : 180} />','<Skeleton className={i === 0 ? "h-[340px] w-full rounded-none" : "h-[180px] w-full rounded-none"} />').replace('<Skeleton width="74%" height={16} />','<Skeleton className="h-4 w-[74%]" />').replace('<Skeleton width="54%" height={16} />','<Skeleton className="h-4 w-[54%]" />')
p.write_text(s)

# ProductApp Redux + skeleton migration
p=Path('src/ProductApp.tsx');s=p.read_text().replace("import { Skeleton } from '@mui/material'","import { Skeleton } from './components/ui/skeleton'")
s=s.replace("import { BrandMark } from './components/BrandMark'", "import { BrandMark } from './components/BrandMark'\nimport { useAppDispatch, useAppSelector } from './store/hooks'\nimport { setDiscussionItemId, setFilter as setFilterAction, setQuery as setQueryAction, setSearchOpen as setSearchOpenAction, setSettings as setSettingsAction, setSettingsOpen as setSettingsOpenAction, setSourceBrowserOpen as setSourceBrowserOpenAction, setSourceFilter as setSourceFilterAction } from './store/uiSlice'")
for old in ["  const [filter, setFilter] = useState<FeedFilter>('all')\n","  const [query, setQuery] = useState('')\n","  const [sourceFilter, setSourceFilter] = useState<string | null>(null)\n","  const [settings, setSettings] = useState<UserSettings>(() => loadSettings())\n","  const [searchOpen, setSearchOpen] = useState(false)\n","  const [settingsOpen, setSettingsOpen] = useState(false)\n","  const [sourceBrowserOpen, setSourceBrowserOpen] = useState(false)\n","  const [discussionItem, setDiscussionItem] = useState<FeedItem | null>(null)\n"]: s=s.replace(old,'')
anchor="export default function ProductApp() {\n"
insert="""export default function ProductApp() {\n  const dispatch = useAppDispatch()\n  const { filter, query, sourceFilter, searchOpen, settingsOpen, sourceBrowserOpen, discussionItemId, settings } = useAppSelector(state => state.ui)\n  const setFilter = (value: FeedFilter) => dispatch(setFilterAction(value))\n  const setQuery = (value: string) => dispatch(setQueryAction(value))\n  const setSourceFilter = (value: string | null) => dispatch(setSourceFilterAction(value))\n  const setSearchOpen = (value: boolean) => dispatch(setSearchOpenAction(value))\n  const setSettingsOpen = (value: boolean) => dispatch(setSettingsOpenAction(value))\n  const setSourceBrowserOpen = (value: boolean) => dispatch(setSourceBrowserOpenAction(value))\n  const setSettings = (value: UserSettings) => dispatch(setSettingsAction(value))\n"""
s=s.replace(anchor,insert)
s=s.replace("  const savedMessagesSourceId = me?.id ? `user:${me.id}` : null", "  const savedMessagesSourceId = me?.id ? `user:${me.id}` : null\n  const discussionItem = discussionItemId ? safeFeed.find(item => item.id === discussionItemId) || null : null")
s=s.replace("onDiscussionOpen={post => setDiscussionItem(post)}","onDiscussionOpen={post => dispatch(setDiscussionItemId(post.id))}").replace("onClick={() => setDiscussionItem(null)}","onClick={() => dispatch(setDiscussionItemId(null))}")
# skeleton conversions common
s=s.replace('<Skeleton variant="rounded" width={132} height={34} />','<Skeleton className="h-[34px] w-[132px]" />').replace('<Skeleton key={i} variant="rounded" height={46} />','<Skeleton key={i} className="h-[46px] w-full" />').replace('<Skeleton variant="circular" width={38} height={38} />','<Skeleton className="h-[38px] w-[38px] rounded-full" />').replace('<Skeleton width={120} />','<Skeleton className="h-4 w-[120px]" />').replace('<Skeleton width={76} height={16} />','<Skeleton className="h-4 w-[76px]" />').replace('<Skeleton variant="rounded" width="100%" height={i === 0 ? 320 : 180} />','<Skeleton className={i === 0 ? "h-[320px] w-full" : "h-[180px] w-full"} />').replace('<Skeleton width="88%" />','<Skeleton className="h-4 w-[88%]" />').replace('<Skeleton width="62%" />','<Skeleton className="h-4 w-[62%]" />')
p.write_text(s)

# FeedCard skeleton import/usage
p=Path('src/components/FeedCard.tsx');s=p.read_text().replace("import { Skeleton } from '@mui/material'","import { Skeleton } from './ui/skeleton'")
s=s.replace('<Skeleton variant="circular" width={36} height={36} />','<Skeleton className="h-9 w-9 rounded-full" />')
p.write_text(s)

# Full shadcn settings surface
Path('src/components/SettingsDialog.tsx').write_text('''import type { TelegramAccount,ThemeMode,UserSettings } from '../types'
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Switch } from './ui/switch'
import { Avatar,AvatarFallback,AvatarImage } from './ui/avatar'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
export function SettingsDialog({open,settings,account,favoriteCount,hiddenSourceCount,onClose,onChange,onResetPersonalization,onLogout}:{open:boolean;settings:UserSettings;account:TelegramAccount|null;favoriteCount:number;hiddenSourceCount:number;onClose:()=>void;onChange:(next:UserSettings)=>void;onResetPersonalization:()=>void;onLogout:()=>void}){
 const update=<K extends keyof UserSettings>(key:K,value:UserSettings[K])=>onChange({...settings,[key]:value})
 const name=[account?.firstName,account?.lastName].filter(Boolean).join(' ')||'Connected account'
 const initials=(account?.firstName?.[0]||'T')+(account?.lastName?.[0]||'')
 return <Dialog open={open} onOpenChange={v=>!v&&onClose()}><DialogContent className="sg-settings-shadcn"><DialogHeader><DialogTitle>Settings</DialogTitle><DialogDescription>Feed, appearance, and Telegram account preferences.</DialogDescription></DialogHeader><div className="sg-settings-scroll">
 <section className="sg-settings-section"><h3>Profile</h3><div className="sg-profile-settings"><Avatar className="h-12 w-12"><AvatarImage src={account?.avatar}/><AvatarFallback>{initials}</AvatarFallback></Avatar><div className="sg-profile-settings-copy"><strong>{name}</strong>{account?.username&&<span>@{account.username}</span>}{account?.bio&&<p>{account.bio}</p>}</div></div><div className="sg-capability-grid">{account?.premium&&<Badge>Premium</Badge>}{account?.verified&&<Badge>Verified</Badge>}</div></section><Separator/>
 <section className="sg-settings-section"><h3>Feed</h3><div className="sg-settings-row"><span><strong>Private chats in For You</strong><small>Allow relevant incoming private messages in recommendations.</small></span><Switch checked={settings.includePrivateChatsInForYou} onCheckedChange={v=>update('includePrivateChatsInForYou',v)}/></div><div className="sg-settings-row"><span><strong>Summarize private chats</strong><small>Use local context-aware summaries where eligible.</small></span><Switch checked={settings.summarizePrivateChats} onCheckedChange={v=>update('summarizePrivateChats',v)}/></div><div className="sg-settings-row"><span><strong>Autoplay video</strong><small>Play visible feed videos automatically.</small></span><Switch checked={settings.autoplay==='on'} onCheckedChange={v=>update('autoplay',v?'on':'off')}/></div><div className="sg-settings-row"><span><strong>Personalization</strong><small>{favoriteCount} favorite sources · {hiddenSourceCount} hidden</small></span><Button variant="outline" size="sm" onClick={onResetPersonalization}>Reset</Button></div></section><Separator/>
 <section className="sg-settings-section"><h3>Appearance</h3><div className="sg-settings-row"><span><strong>Theme</strong><small>Match your browser or choose a mode.</small></span><div className="sg-theme-segment">{(['system','light','dark'] as ThemeMode[]).map(mode=><button key={mode} className={settings.themeMode===mode?'is-active':''} onClick={()=>update('themeMode',mode)}>{mode[0].toUpperCase()+mode.slice(1)}</button>)}</div></div></section><Separator/>
 <section className="sg-settings-section"><h3>Telegram</h3><div className="sg-capability-grid">{Object.entries(account?.capabilities||{}).filter(([,enabled])=>enabled).map(([key])=><Badge key={key}>{key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase())}</Badge>)}</div><p className="text-xs text-muted-foreground mt-3">Telegram account settings shown here are read-only unless an action explicitly says otherwise.</p></section><Separator/>
 <section className="sg-settings-section"><h3>Account</h3><div className="sg-settings-linkrow"><Button variant="outline" asChild><a href="/privacy.html">Privacy</a></Button><Button variant="outline" asChild><a href="/terms.html">Terms</a></Button></div><Button variant="ghost" className="sg-settings-danger mt-3 px-0" onClick={onLogout}>Switch Telegram account</Button></section>
 </div><DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter></DialogContent></Dialog>
}
''')

# AuthModal conversion to native shadcn Dialog while preserving API
p=Path('src/components/AuthModal.tsx');old=p.read_text()
# overwrite based on public AuthPrompt API
Path('src/components/AuthModal.tsx').write_text('''import { useEffect,useState } from 'react'
import type { AuthPrompt } from '../types'
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
export function PromptModal({prompt,onSubmit,onCancel}:{prompt:AuthPrompt|null;onSubmit:(value:string)=>void|Promise<void>;onCancel:()=>void}){const[value,setValue]=useState('');const[busy,setBusy]=useState(false);useEffect(()=>{setValue('');setBusy(false)},[prompt?.type]);if(!prompt)return null;async function submit(e:React.FormEvent){e.preventDefault();if(!value.trim()||busy)return;setBusy(true);try{await onSubmit(value.trim())}finally{setBusy(false)}}return <Dialog open={Boolean(prompt)} onOpenChange={v=>!v&&onCancel()}><DialogContent className="max-w-[420px]"><form onSubmit={submit}><DialogHeader><DialogTitle>{prompt.title}</DialogTitle><DialogDescription>{prompt.hint}</DialogDescription></DialogHeader><div className="px-5 py-5"><Input autoFocus value={value} onChange={e=>setValue(e.target.value)} type={prompt.type==='password'?'password':prompt.type==='code'?'text':'tel'} inputMode={prompt.type==='code'?'numeric':prompt.type==='phone'?'tel':undefined} autoComplete={prompt.type==='password'?'current-password':'one-time-code'} /></div><DialogFooter><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={!value.trim()||busy}>{busy?'Checking…':'Continue'}</Button></DialogFooter></form></DialogContent></Dialog>}
''')

# Landing/Demo/body receive shared shadcn utility classes through lightweight structural CSS rather than rewrites
with Path('src/identity.css').open('a') as f:
    f.write('''\n/* shadcn surface unification */\n.sg-auth-modal,.sg-source-browser,.sg-bottom-sheet,.sg-lightbox{--radius:12px}.sg-landing button,.demo-page button{transition:background .15s ease,color .15s ease,border-color .15s ease,transform .1s ease}.sg-landing button:active,.demo-page button:active{transform:scale(.985)}\n''')
