# Security policy

Report suspected security or privacy issues through a private GitHub security advisory when available. Do not post API keys, Telegram credentials, session cookies, verification codes, private message contents, or other secrets in public issues.

## Secrets

Supergram does not require a shared OpenAI key. Optional OpenAI summaries and AI transforms use a credential supplied by the signed-in user. The browser stores it in `sessionStorage` so a normal reload in the same tab does not remove it. It is not stored in `localStorage`, sent to the Supergram backend, or included in analytics or logs. Closing the tab or browser session clears it under normal browser sessionStorage behavior.

Any browser-held secret remains exposed to same-origin XSS, compromised dependencies, malicious extensions, and compromised devices while the session is active. Keep the Content Security Policy strict and avoid unnecessary third-party scripts.

Telegram application credentials and the backend proxy secret belong only in deployment secret stores. They must never be committed to this repository or exposed to the browser bundle.

## Supported branch

Security fixes target `main`.
