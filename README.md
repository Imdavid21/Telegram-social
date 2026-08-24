# Telegram.Social

A web-first Telegram channel reader that merges posts from subscribed broadcast channels into one social-style timeline.

> Development codename: `Telegram.Social`. Before public launch, review Telegram's current branding and API terms. Third-party app naming and sponsored-message requirements may apply.

## What it does

- Telegram user authentication via MTProto
- Unified feed across joined broadcast channels
- Text and media posts
- Reactions, views, and replies metadata
- Search and unread filters
- Save posts locally
- Forward posts to Telegram Saved Messages
- Open the original Telegram post
- Share posts
- PWA install support
- Demo mode without Telegram credentials
- Baseline handling for Telegram sponsored messages

## Stack

- React
- Vite
- TypeScript
- Express
- Teleproto / MTProto
- Vercel Functions

## Local development

1. Copy `.env.example` to `.env`.
2. Add your Telegram API credentials from `my.telegram.org`.
3. Install dependencies.
4. Run the development server.

```bash
npm install
npm run dev
```

## Environment variables

```bash
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
SESSION_SECRET=
```

`SESSION_SECRET` should be a long random value. Telegram credentials must never be exposed to the frontend.

## Vercel

This repository includes `vercel.json` and a catch-all Vercel function under `api/[...path].mjs`.

Add the required environment variables in Vercel before enabling live Telegram authentication.

### Important deployment note

The current interactive login handshake keeps temporary authorization state in server memory. That is fine for local development and controlled testing but is not reliable enough for production on stateless serverless infrastructure. Before opening login to real users, move the temporary auth challenge state into a durable short-lived store such as Vercel KV, Redis, or another encrypted server-side store.

## Security model

- Telegram API ID/hash stay server-side.
- Authenticated Telegram sessions are encrypted before being stored in an HttpOnly cookie.
- The app does not require a centralized message database for V0.1.
- Telegram messages are fetched through the user's authorized session.

## Scope

V0.1 deliberately focuses on broadcast channels rather than becoming a full Telegram replacement. DMs and normal group messaging are out of scope for the initial product.

## Product idea

Telegram is the inbox. This app is the feed.

The product takes the core Evergram concept and rebuilds it independently for the web/PWA rather than using or forking Evergram's private Android application code.
