import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const Base = ({ children, ...p }: P) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{children}</svg>
export const HomeIcon = (p:P)=><Base {...p}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/></Base>
export const SearchIcon=(p:P)=><Base {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></Base>
export const BookmarkIcon=(p:P)=><Base {...p}><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4z"/></Base>
export const ImageIcon=(p:P)=><Base {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></Base>
export const SettingsIcon=(p:P)=><Base {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 16 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.37.33.7.6 1 .28.28.66.42 1.1.4h.1v4h-.1c-.44-.02-.82.12-1.1.4-.27.3-.48.63-.6 1z"/></Base>
export const MoreIcon=(p:P)=><Base {...p}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></Base>
export const SendIcon=(p:P)=><Base {...p}><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></Base>
export const EyeIcon=(p:P)=><Base {...p}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.5"/></Base>
export const MessageIcon=(p:P)=><Base {...p}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></Base>
export const BellIcon=(p:P)=><Base {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></Base>
export const CheckIcon=(p:P)=><Base {...p}><path d="m5 12 4 4L19 6"/></Base>
export const CloseIcon=(p:P)=><Base {...p}><path d="m6 6 12 12M18 6 6 18"/></Base>
export const RefreshIcon=(p:P)=><Base {...p}><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.6-2.6L20 8M4 16l2.3 2.6A7 7 0 0 0 17.9 16"/></Base>
export const LogOutIcon=(p:P)=><Base {...p}><path d="M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/></Base>
