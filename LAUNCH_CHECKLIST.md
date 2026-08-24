# Telegram.Social launch checklist

## Blocker: public name

`Telegram.Social` is the development codename used in this repository.

Telegram's API Terms of Service state that a third-party client title must not include the word **Telegram**, unless the title prefixes it with **Unofficial**. The public product therefore needs a compliant name before launch.

Reference: https://core.telegram.org/api/terms

## Implemented: official sponsored messages

A third-party app that displays Telegram channel content must support Telegram's official sponsored messages.

V0.1 includes a baseline implementation:

- `messages.getSponsoredMessages`
- five-minute sponsored-message cache
- Sponsored / Recommended labels
- sponsor info disclosure
- impression reporting through `messages.viewSponsoredMessage`
- click reporting through `messages.clickSponsoredMessage`
- confirmation before opening non-Telegram hosts

Reference: https://core.telegram.org/api/sponsored-messages

Before production launch, validate placement and behavior against Telegram's current test channel and current API layer.

## Required before public production

- Pick the compliant public name and replace the development codename in the manifest, page title, copy, and icon metadata.
- Create the production Telegram API application and configure `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` server-side.
- Use a strong production `SESSION_SECRET` from a secret manager.
- Terminate TLS at the application edge. Never serve auth over plain HTTP in production.
- Add production privacy policy and terms pages.
- Add abuse monitoring around login FLOOD_WAITs and Telegram RPC limits.
- Exercise login for phone code, in-app code, 2FA, expired codes, and flood-limit errors.
- Exercise official sponsored-message behavior against Telegram's documented test channel.
- Add automated integration tests against Telegram test DC accounts before production accounts.
- Add a session-revocation UX and incident runbook.
- Perform a security review focused on encrypted session cookies, XSS, CSRF, logs, and deployment secrets.

## Deliberate V0.1 product constraints

- Broadcast channels only
- No DMs
- No group feed
- No automated posting
- No member scraping
- No automated joining
- Local read state only, with no silent Telegram read receipts
- No server-side Telegram message database
