# Supergram

Supergram turns the Telegram activity available to your account into one media-first, continuously scrollable feed. It is an independent, unofficial Telegram API client and is not affiliated with Telegram.

## Production architecture

```text
Browser
  ↓
Vercel: Vite/React frontend
  ↓ same-origin /api/* for auth, feed cursors, updates, avatars, tickets
Vercel stateless API gateway
  ↓ authenticated server-to-server proxy
Railway: persistent Node/Express + Teleproto
  ↓ MTProto
Telegram

Large media path:
Browser → short-lived Railway /media/:ticket → streamed MTProto download
```

The multi-step Telegram phone/code/2FA handshake and live Teleproto connection stay on the persistent Railway process. Vercel never owns MTProto connection state. Large media no longer passes through Vercel after a short-lived authenticated media ticket is created.

## V0.4 feed engine

- Full Telegram dialog inventory, not an 80-dialog slice.
- Explicit main-folder and archived-folder count diagnostics.
- Typed source IDs such as `user:<id>`, `group:<id>`, and `channel:<id>`.
- Global chronological cursor pagination across all loaded sources.
- Per-source history is fetched lazily as the global merge needs it rather than fetching a fixed N messages from every dialog on each refresh.
- Browser-side dynamic-height virtualization keeps only the viewport plus overscan mounted even as thousands of posts accumulate.
- Telegram `NewMessage`, `EditedMessage`, and `DeletedMessage` events feed an incremental long-poll update channel.
- New posts are queued behind an `N new posts` control while the reader is deep in the feed so scroll position is never shifted unexpectedly.
- Expired in-memory feed cursors recover by creating a fresh cursor and deduplicating already loaded messages.

## Media engine

Supergram classifies Telegram media using document MIME types and Telegram document attributes rather than relying only on `message.video`.

Supported presentation includes:

- photos
- video
- animated/GIF media
- voice messages
- audio
- generic documents
- static stickers
- grouped albums
- poll/location/contact placeholders

Telegram animated `.tgs` stickers currently degrade to an explicit placeholder because that Telegram-specific format is not natively rendered by browsers.

For message media, the browser first requests a five-minute media ticket through `/api/media/ticket/:sourceId/:messageId`. The returned URL points directly at Railway. Railway streams Teleproto download chunks into the HTTP response with backpressure, so large media does not get buffered once by Railway and again by Vercel.

Current limitation: the direct stream starts at byte zero and advertises no HTTP range seeking. Progressive playback works, but production-grade arbitrary seeking for large videos is a separate range-request optimization.

## Source identity

The feed, source strip, and post headers use real Telegram profile/channel photos where Telegram provides one. `/api/avatar/:sourceId` downloads and caches the small profile image on the persistent backend. Initials remain only as a fallback when Telegram has no photo or the download fails.

## Live updates

Each active Telegram client registers Teleproto event handlers and keeps a bounded in-memory sequence of recent updates. The browser long-polls:

```text
GET /api/feed/updates?after=<sequence>
```

This replaces the previous once-per-minute full feed refetch. A normal refresh creates a fresh feed cursor, while incoming messages and edits arrive incrementally.

## Feed API

Initial page:

```text
GET /api/feed?limit=40
```

Response includes:

```json
{
  "channels": [],
  "feed": [],
  "nextCursor": "opaque-cursor-or-null",
  "hasMore": true,
  "syncToken": 0,
  "diagnostics": {
    "loaded": 0,
    "telegramTotal": 0,
    "mainTotal": 0,
    "archivedTotal": 0
  }
}
```

Older page:

```text
GET /api/feed?cursor=<opaque-cursor>&limit=40
```

Feed cursors are intentionally opaque, session-bound, in-memory state. They expire after inactivity and are not portable across backend restarts. The frontend handles HTTP `410 CURSOR_EXPIRED` by creating a fresh cursor without discarding the already loaded timeline.

## Stack

- React 19
- Vite 8
- TypeScript
- Express 5
- Teleproto / MTProto
- Vercel for the frontend and stateless API gateway
- Railway for persistent Telegram sessions, pagination state, update state, and direct media streaming

## Local development

Copy `.env.example` to `.env`, replace the Telegram credentials and secrets, then run:

```bash
npm install
npm run dev
```

`npm run dev` starts both Vite and the local Express/Teleproto backend. Vite proxies `/api/*` to port `8787`.

## Railway variables

Required:

```text
TELEGRAM_API_ID
TELEGRAM_API_HASH
SESSION_SECRET
BACKEND_PROXY_SECRET
```

`SESSION_SECRET` and `BACKEND_PROXY_SECRET` must each be at least 32 characters and should be unrelated random values. `railway.json` forces `NODE_ENV=production`.

Recommended in production:

```text
PUBLIC_APP_ORIGIN=https://your-production-vercel-domain
```

`PUBLIC_APP_ORIGIN` is also used as the allowed origin for direct media responses.

Keep the Railway service at one replica for this version. Authentication flows, cursor state, media tickets, and incremental update buffers are process-local. Horizontal scaling needs sticky/session-aware routing or externalized state first.

## Vercel variables

```text
TELEGRAM_BACKEND_URL=https://your-service.up.railway.app
BACKEND_PROXY_SECRET=<same value as Railway>
```

The Telegram API ID, API hash, and session-encryption secret do not live on Vercel.

`api/proxy.mjs` is the only Vercel API gateway. It forwards same-origin `/api/*` requests to Railway and preserves first-party session cookies. Large `/media/:ticket` traffic deliberately bypasses the Vercel function after ticket issuance.

## Health endpoints

```text
GET /api/health
GET /api/ready
```

Expected health shape:

```json
{
  "ok": true,
  "configured": true,
  "runtime": "persistent-node",
  "version": "0.4.0"
}
```

## Security model

- Telegram API credentials exist only on Railway.
- Telegram `StringSession` data is AES-256-GCM encrypted before being stored in an HttpOnly, Secure, SameSite=Lax browser cookie.
- Vercel and Railway authenticate API traffic with `BACKEND_PROXY_SECRET`.
- Production mutating API requests validate browser origin.
- Media tickets are random, short-lived, tied to an active backend Telegram session, and contain no Telegram credentials.
- Login codes, 2FA passwords, API hashes, and raw Telegram session strings are not stored in browser localStorage.
- No centralized Telegram message database is required for the current architecture.

## Current scaling boundaries

The current version is deliberately single-process on Railway. Established encrypted Telegram sessions can reconnect after a process restart, but active authentication flows, feed cursors, media tickets, and update queues are ephemeral. Production horizontal scaling should externalize or affinity-route those states before increasing replicas.
