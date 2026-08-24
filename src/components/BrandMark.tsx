type BrandMarkProps = { className?: string; title?: string }

export function BrandMark({ className = '', title }: BrandMarkProps) {
  return <svg className={className} viewBox="0 0 32 32" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
    <rect width="32" height="32" rx="8" fill="currentColor" />
    <path d="M22.4 9.2H13c-2.9 0-4.8 1.5-4.8 3.7 0 2.1 1.7 3.3 4.6 3.9l6.2 1.3c2 .4 2.9 1.2 2.9 2.4 0 1.5-1.3 2.4-3.4 2.4H8.9" fill="none" stroke="white" strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}
