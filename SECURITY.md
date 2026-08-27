# Security policy

Report suspected security or privacy issues through a private GitHub security advisory when available. Do not post API keys, Telegram credentials, session cookies, verification codes, private message contents, or other secrets in public issues.

## Secrets

Supergram does not require a shared OpenAI key. Optional OpenAI summaries use a key supplied by the signed-in user and held only in the current page's memory. Refreshing or closing the page clears it.

Telegram application credentials and the backend proxy secret belong only in deployment secret stores. They must never be committed to this repository or exposed to the browser bundle.

## Supported branch

Security fixes target `main`.
