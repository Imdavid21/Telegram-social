# Telegram.Social

A web-first Telegram channel reader that merges posts from subscribed broadcast channels into one social-style timeline.

> `Telegram.Social` is the development/product codename. Review Telegram's current API branding terms before a broad public launch.

## Production architecture

The production deployment deliberately separates the stateless web layer from the stateful Telegram client:

```text
Browser
  ↓
Vercel: Vite/React PWA
  ↓ same-origin /api/*
Vercel API gateway
  ↓ authenticated server-to-server proxy
Railway: persistent Node/Express + Teleproto
  ↓ MTProto
Telegram
```

The multi-step Telegram phone/code/2FA handshake must stay on a persistent process. Vercel does not own MTProto state anymore.

## What it does

- Telegram user authentication via MTProto
- Unified feed across joined broadcast channels
- Text and media posts
- Reactions, views, and replies metadata
- Search and unread filters
- Save posts locally
- Forward posts to Telegram Saved Messages
- Open original Telegram posts
- Share posts
- PWA install support
- Demo mode before Telegram connection
- Telegram sponsored-message retrieval and reporting baseline

## Stack

- React 19
- Vite 8
- TypeScript
- Express 5
- Teleproto / MTProto
- Vercel for the frontend and stateless API gateway
- Railway for the persistent Telegram backend

## Local development

Copy `.env.example` to `.env`, replace the Telegram credentials and session secret, then run:

```bash
npm install
npm run dev
```

`npm run dev` now starts both Vite and the local Express/Teleproto server. Vite proxies `/api/*` to port `8787`.

## Railway variables

Set these on the Railway backend service:

```text
TELEGRAM_API_ID
TELEGRAM_API_HASH
SESSION_SECRET
BACKEND_PROXY_SECRET
NODE_ENV=production
PUBLIC_APP_ORIGIN=https://your-production-vercel-domain
```

`SESSION_SECRET` and `BACKEND_PROXY_SECRET` must each be at least 32 characters and should be unrelated random values.

Railway config is defined in `railway.json`. The service starts `server/index.mjs` and uses `/api/ready` as its deployment healthcheck.

Generate a public Railway domain after the backend is healthy.

## Vercel variables

Set these on the Vercel project:

```text
TELEGRAM_BACKEND_URL=https://your-service.up.railway.app
BACKEND_PROXY_SECRET=<same value as Railway>
```

The Telegram API ID, API hash, and session-encryption secret do not need to live on Vercel after this migration.

`api/[...path].mjs` is now a stateless reverse proxy. It forwards the browser's same-origin `/api/*` calls to Railway and forwards `Set-Cookie` back to the browser, so Telegram session cookies remain first-party on the Vercel application domain.

## Health endpoints

Railway exposes:

```text
GET /api/health
GET /api/ready
```

`/api/health` always describes backend availability without exposing secrets. `/api/ready` returns success only when the production Telegram/backend secrets are configured.

Through the Vercel application, `/api/health` should return a payload similar to:

```json
{
  "ok": true,
  "configured": true,
  "runtime": "persistent-node",
  "version": "0.2.0"
}
```

## Security model

- Telegram API credentials exist only on the persistent backend.
- Telegram `StringSession` data is AES-256-GCM encrypted before being placed in an HttpOnly, Secure, SameSite=Lax cookie.
- The Vercel gateway and Railway backend authenticate server-to-server using `BACKEND_PROXY_SECRET`.
- Production mutating API requests validate their browser origin.
- No Telegram password, login code, API hash, or session string is stored in localStorage.
- No centralized Telegram message database is required.
- Established sessions survive backend process restarts because the encrypted Telegram session is held by the browser; the backend reconnects from it as needed.

## Scaling note

Keep the Railway Telegram backend at one replica for this version. Active login handshakes use an in-process Teleproto client. Established sessions are restart-safe, but an authorization flow that is in progress during a backend restart/deployment may need to be started again.

Horizontal scaling should only be enabled after auth-flow affinity or a purpose-built persistent Telegram session service is introduced.

## Scope

The app deliberately focuses on broadcast channels. DMs and normal group messaging are out of scope.

Telegram is the inbox. This app is the feed.
