# Privacy threat model

## Assets

Telegram session material, authentication inputs, private message content, media, local interaction history, and optional user-owned OpenAI API keys.

## Trust boundaries

Browser to Supergram gateway, gateway to private Telegram backend, backend to Telegram, and browser to OpenAI when the user explicitly enables BYOK summaries.

## BYOK design

The OpenAI key is stored only in JavaScript module memory. It is never persisted in Web Storage, Redux, URLs, logs, or the Supergram backend. Local summarization is the default. OpenAI is opt-in. Private-chat summarization is a second independent opt-in. OpenAI failures fall back to the local summary. Requests specify `store: false`.

This does not make a browser-held secret invulnerable. Same-origin XSS, a malicious extension, compromised dependencies, or a compromised device could read it while the page is open. Therefore Supergram should avoid third-party scripts, enforce a strict Content Security Policy, minimize dependencies, and maintain dependency/secret scanning.

## Telegram session design

Telegram session material is encrypted server-side with AES-256-GCM before being placed in an HttpOnly cookie. Production backend access is gated by a private proxy secret. State-changing requests receive origin checks. Authentication attempts are rate-limited.

## Residual risks

The 30-day session lifetime increases exposure on shared or compromised devices. Local interaction state reveals behavioral metadata. The gateway should move toward an explicit backend-route allowlist. All mutation endpoints should receive abuse limits. Security headers and CSP should be verified at the deployed edges, not assumed from source code.
