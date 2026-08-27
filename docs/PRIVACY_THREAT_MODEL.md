# Privacy threat model

## Assets

Telegram session material, authentication inputs, private message content, media, local interaction history, and optional user-owned OpenAI API keys.

## Trust boundaries

Browser to Supergram gateway, gateway to private Telegram backend, backend to Telegram, and browser to OpenAI when the user explicitly enables BYOK summaries.

## BYOK design

The OpenAI key is stored in browser `sessionStorage`, not `localStorage`, Redux, URLs, logs, analytics, or the Supergram backend. This allows a normal page reload in the same browser tab to keep the credential while avoiding durable cross-session storage. Closing the tab or browser session clears it under normal browser sessionStorage behavior.

OpenAI is the only text-summary and AI-transform provider. There is no local text-summary fallback. Without a connected OpenAI key, Supergram keeps AI text features unavailable and makes default discovery surfaces media-first. Private-chat summarization remains a separate opt-in. Requests specify `store: false`.

This does not make a browser-held secret invulnerable. Same-origin XSS, a malicious extension, compromised dependencies, or a compromised device could read sessionStorage while the page is open. Therefore Supergram should avoid third-party scripts, enforce a strict Content Security Policy, minimize dependencies, and maintain dependency and secret scanning.

## Telegram session design

Telegram session material is encrypted server-side with AES-256-GCM before being placed in an HttpOnly cookie. Production backend access is gated by a private proxy secret. State-changing requests receive origin checks. Authentication attempts are rate-limited.

## Residual risks

The 30-day Telegram session lifetime increases exposure on shared or compromised devices. Local interaction state reveals behavioral metadata. A sessionStorage BYOK credential remains accessible to same-origin script execution for the lifetime of the browser tab. All mutation endpoints should receive abuse limits, and security headers and CSP should be verified at the deployed edges rather than assumed from source code.
