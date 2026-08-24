# Unofficial Telegram.Social launch checklist

## Production architecture: implemented

- Vercel serves the Vite/React PWA.
- Vercel `/api/*` is a stateless authenticated reverse proxy.
- Railway runs the persistent Express + Teleproto backend.
- Telegram phone → code → 2FA state stays on the persistent Railway process.
- Established Telegram sessions are AES-256-GCM encrypted in an HttpOnly browser cookie.
- The Railway backend uses `/api/ready` as its deployment healthcheck.
- `npm run dev` starts both the local frontend and backend.
- GitHub CI performs dependency install, backend syntax checks, and a frontend build.

## Telegram API compliance: implemented in code

Telegram's API Terms require a third-party client title containing “Telegram” to prefix it with “Unofficial”. The deployable page title, PWA manifest, and in-app title therefore use **Unofficial Telegram.Social**.

The app uses its own product icon rather than the official Telegram logo and prominently discloses that it is an unofficial Telegram API client.

Reference: https://core.telegram.org/api/terms

## Official sponsored messages: baseline implemented

- `messages.getSponsoredMessages`
- five-minute sponsored-message cache
- Sponsored / Recommended labels
- sponsor info disclosure
- impression reporting through `messages.viewSponsoredMessage`
- click reporting through `messages.clickSponsoredMessage`
- confirmation before opening non-Telegram hosts

Reference: https://core.telegram.org/api/sponsored-messages

## Legal/user-facing pages: implemented

- `/privacy.html`
- `/terms.html`
- Telegram API/unofficial-client disclosure in the login flow

## Production variables still required

Railway:

```text
TELEGRAM_API_ID
TELEGRAM_API_HASH
SESSION_SECRET
BACKEND_PROXY_SECRET
```

Optional Railway hardening:

```text
PUBLIC_APP_ORIGIN
```

Vercel:

```text
TELEGRAM_BACKEND_URL
BACKEND_PROXY_SECRET
```

The same `BACKEND_PROXY_SECRET` value must be configured on both services.

## One-time deployment actions

- Deploy the repository as a Railway service.
- Keep the backend at one replica for V0.2.
- Generate a Railway public domain.
- Put that domain into Vercel as `TELEGRAM_BACKEND_URL`.
- Put the shared proxy secret into both Railway and Vercel as `BACKEND_PROXY_SECRET`.
- Update the Telegram developer app title to a compliant title, for example `Unofficial Telegram Social`.
- Trigger a new Vercel production deployment after the new proxy variables are saved.

## Final smoke test

1. `GET <vercel-origin>/api/health` returns `ok: true`, `configured: true`, `runtime: persistent-node`.
2. Connect Telegram.
3. Enter phone number.
4. Enter the code received through Telegram.
5. Enter 2FA password if required.
6. Confirm the real broadcast-channel feed replaces demo data.
7. Refresh the browser and confirm the session reconnects.
8. Confirm image/media endpoints load.
9. Save a post and confirm it reaches Telegram Saved Messages.
10. Disconnect and confirm the session is cleared.

## Operational notes

- Keep the Railway backend on a single replica until auth-flow affinity is implemented. Active auth flows use an in-memory Teleproto client.
- Established login sessions survive process restarts because the encrypted StringSession is stored in the user's cookie and can be reconnected by a fresh backend process.
- A deployment/restart that occurs while a user is entering a phone code may require that user to restart the login flow.
- Monitor Telegram FLOOD_WAIT/RPC errors and Railway restarts before increasing user volume.

## Deliberate product constraints

- Broadcast channels only
- No DMs
- No group feed
- No automated posting
- No member scraping
- No automated joining
- Local read state only, with no silent Telegram read receipts
- No server-side Telegram message database
