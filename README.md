# Unofficial Telegram.Social

A web-first Telegram channel reader that merges posts from subscribed broadcast channels into one social-style timeline.

## Production architecture

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

The multi-step Telegram phone/code/2FA handshake stays on a persistent Railway process. Vercel does not own MTProto connection state.

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

Copy `.env.example` to `.env`, replace the Telegram credentials and secrets, then run:

```bash
npm install
npm run dev
```

`npm run dev` starts both Vite and the local Express/Teleproto backend. Vite proxies `/api/*` to port `8787`.

## Railway variables

Required on the Railway backend service:

```text
TELEGRAM_API_ID
TELEGRAM_API_HASH
SESSION_SECRET
BACKEND_PROXY_SECRET
```

`SESSION_SECRET` and `BACKEND_PROXY_SECRET` must each be at least 32 characters and should be unrelated random values. `railway.json` forces `NODE_ENV=production` automatically.

Optional hardening:

```text
PUBLIC_APP_ORIGIN=https://your-production-vercel-domain
```

The proxy already forwards the browser host for origin validation, so `PUBLIC_APP_ORIGIN` is not required for the normal Vercel setup.

Railway config is defined in `railway.json`. The service starts `server/index.mjs` and uses `/api/ready` as its deployment healthcheck. Keep this service at one replica for V0.2.

## Vercel variables

Required on Vercel:

```text
TELEGRAM_BACKEND_URL=https://your-service.up.railway.app
BACKEND_PROXY_SECRET=<same value as Railway>
```

The Telegram API ID, API hash, and session-encryption secret do not need to live on Vercel after this migration.

`api/[...path].mjs` is a stateless reverse proxy. It forwards the browser's same-origin `/api/*` calls to Railway and forwards `Set-Cookie` back to the browser, so Telegram session cookies remain first-party on the Vercel application domain.

## Health endpoints

Railway exposes:

```text
GET /api/health
GET /api/ready
```

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
- Established sessions survive backend process restarts because the encrypted Telegram session is held by the browser and can be reconnected by a fresh backend process.

## Scaling note

Active login handshakes use an in-process Teleproto client, so keep the Railway backend at one replica for this version. Established sessions are restart-safe, but an authorization flow in progress during a backend restart/deployment may need to be started again.

## Scope

The app deliberately focuses on broadcast channels. DMs and normal group messaging are out of scope.
