type BrandMarkProps = { className?: string; title?: string }

export function BrandMark({ className = '', title }: BrandMarkProps) {
  return <svg className={className} viewBox="0 0 32 32" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
    <rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="#0A0A0B" />
    <path d="M6.4 13.7 24.2 7.4c1.3-.5 2.5.7 2 2l-4.8 17.4c-.4 1.4-2.2 1.8-3.1.6l-5.1-6.2-3.6 3.7c-.9.9-2.3.4-2.5-.8l-1-5.9-3.8-1.8c-1.4-.6-1.3-2.3.1-2.7Zm3.6 2.7 4.1 1.9c.6.3.9.8 1 1.4l.4 2.2 3.2-3.3 4.7-7.5L10 16.4Z" fill="#FAFAFA" fillRule="evenodd" />
  </svg>
}
