# Supergram

Supergram turns the Telegram account you already use into a continuous, media-first feed. It is an independent third-party client built on the Telegram API and is not affiliated with Telegram.

## Product position

Telegram is organized around chats. Supergram is organized around attention.

The product keeps the source graph intact, then changes the reading model: older history loads as you scroll, fresh posts wait above the current viewport, media receives a renderer that matches its real Telegram type, and the visible feed stays bounded even as history grows.

## Production architecture

```text
Browser
  ↓
Vercel: Vite + React
  ↓ same-origin /api/*
Vercel stateless API gateway
  ↓ authenticated server-to-server proxy
Railway: persistent Node + Express + Teleproto
  ↓ MTProto
Telegram
```

The Telegram phone, code, and two-step-verification handshake stays on a persistent Railway process. Vercel serves the product and proxies authenticated API traffic without owning MTProto connection state.

## Current product behavior

- Telegram user authentication through MTProto
- Public homepage before account connection
- Cursor-paginated feed across loaded Telegram sources
- Incremental Telegram updates instead of full-feed polling
- Typed source IDs such as `user:123` and `channel:123`
- Real Telegram source avatars with initials as fallback
- Media classification for photos, video, GIFs, audio, voice, documents, stickers, polls, contacts, locations, and albums
- Short-lived authenticated media delivery for large files
- Reactions, views, replies metadata, search, unread state, save, share, and Telegram Saved Messages forwarding
- Bounded feed virtualization for long sessions
- Dwell-based read state and buffered new-post handling
- Dark and light themes

## Frontend interaction model

The motion system follows three rules.

First, motion explains state instead of decorating it. New posts stay buffered until the reader returns to the top, media reveals progressively, and press states respond immediately.

Second, the feed preserves position. Cursor pagination adds older history without resetting the current viewport, and the virtualization layer keeps measured heights for rows that are no longer mounted.

Third, expensive media work stays close to the viewport. Video autoplay, ticket retrieval, image loading, and document preparation are all visibility-driven.

## Brand

The Supergram mark is a single continuous `S` stroke inside a blue rounded square. It is deliberately distinct from Telegram's paper-plane mark, readable at favicon size, and used consistently across the homepage, product shell, and app icon.

The interface avoids generic product-marketing filler. Copy should be specific to a user action, a product behavior, or an implementation fact. Avoid claims such as "seamless", "revolutionary", "next-generation", "powerful", or "all-in-one" unless a concrete sentence immediately proves the claim.

## Local development

Copy `.env.example` to `.env`, add the Telegram credentials and local secrets, then run:

```bash
npm install
npm run dev
```

`npm run dev` starts Vite and the local Express/Teleproto backend. Vite proxies `/api/*` to port `8787`.

## Railway variables

Required on the Railway backend service:

```text
TELEGRAM_API_ID
TELEGRAM_API_HASH
SESSION_SECRET
BACKEND_PROXY_SECRET
```

`SESSION_SECRET` and `BACKEND_PROXY_SECRET` must each be at least 32 characters and should be unrelated random values. `railway.json` sets the production runtime and `/api/ready` deployment healthcheck.

Optional hardening:

```text
PUBLIC_APP_ORIGIN=https://your-production-vercel-domain
```

Keep the Railway backend at one replica until active authorization flow state is moved out of process memory or the service gains explicit session affinity.

## Vercel variables

Required on Vercel:

```text
TELEGRAM_BACKEND_URL=https://your-service.up.railway.app
BACKEND_PROXY_SECRET=<same value as Railway>
```

Telegram API credentials and the Telegram session-encryption secret stay on Railway.

## Security model

- Telegram API credentials exist only on the persistent backend.
- Telegram `StringSession` data is encrypted with AES-256-GCM before it is placed in an HttpOnly, Secure, SameSite=Lax cookie.
- Vercel and Railway authenticate server-to-server traffic with `BACKEND_PROXY_SECRET`.
- Production mutating requests validate the browser origin.
- Login codes, Telegram passwords, API hashes, and raw session strings are not stored in browser localStorage.
- The service does not require a centralized database containing the user's Telegram messages.
- Established sessions survive backend process restarts because the browser carries the encrypted Telegram session cookie.

## Health endpoints

Railway exposes:

```text
GET /api/health
GET /api/ready
```

Through Vercel, `/api/health` should report a configured persistent Node runtime.

## Product constraints

Supergram is still an unofficial Telegram client. Telegram API limits, MTProto behavior, source visibility, archived-folder behavior, and sponsored-message requirements remain upstream constraints and should be tested against real accounts before broad release.
