# Supergram

Supergram turns the Telegram account you already use into a continuous, media-first feed. It is an independent third-party client built on the Telegram API and is not affiliated with Telegram.

## Product position

Telegram is organized around chats. Supergram is organized around attention.

The product keeps the source graph and provenance intact, then changes the reading model. Users can switch between a personalized `For You` view and strict reverse-chronological `Latest`, filter by unread/media/saved state, favorite or hide sources, inspect why a ranked post is being shown, and return to the original Telegram context when needed.

Older history loads as you scroll, fresh posts wait above the current viewport instead of moving content under the reader, media receives a renderer matching its Telegram type, and the visible DOM stays bounded as history grows.

## Production architecture

```text
Browser
  ↓
Vercel: Vite + React + MUI
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
- Public homepage and working feed preview before account connection
- `For You` relevance-ranked feed and strict chronological `Latest` feed
- Secondary All, Unread, Media, and Saved filters that work alongside source selection
- Searchable source browser with Channels, Groups, People, and Favorites views
- Favorite sources, hide-from-For-You controls, hide-post controls, and explicit More/Less Like This feedback
- Human-readable `Why this post?` ranking explanations
- Private-chat summaries disabled by default, with an explicit user preference to enable them
- Persistent System, Light, and Dark appearance modes shared by MUI and the custom feed surface
- Explicit autoplay preference, with automatic autoplay suppression when `prefers-reduced-motion` is enabled
- Cursor-paginated feed across loaded Telegram sources
- Incremental Telegram updates instead of full-feed polling
- Typed source IDs such as `user:123` and `channel:123`
- Real Telegram source avatars with initials as fallback
- Media classification for photos, video, GIFs, audio, voice, documents, stickers, polls, contacts, locations, and albums
- Short-lived authenticated media delivery for large files
- Telegram reactions, replies, forwarding, views, unread state, save state, and Telegram Saved Messages forwarding
- Bounded feed virtualization for long sessions
- Dwell-based local relevance signals and buffered new-post handling
- Accessible MUI authentication, Settings, source browser, and focus-managed bottom-sheet overlays

## Feed model

`Latest` is intentionally simple: posts are ordered by Telegram timestamp, newest first.

`For You` combines freshness, unread state, source affinity, explicit user feedback, favorite sources, media preference, engagement, source diversity, and cross-source story signals. Ranking weights are centralized in `src/lib/ranking.ts` rather than distributed through rendering components. The feed also exposes semantic reasons through `Why this post?` instead of requiring users to trust an invisible score.

Explicit negative controls affect the ranked feed without destroying access to Telegram data. Hiding a source from `For You`, for example, does not remove that source from `Latest` or from the source browser.

## Frontend interaction model

The interaction system follows four rules.

First, motion explains state instead of decorating it. New posts stay buffered until the reader chooses to move to the top, media reveals progressively, and press states respond immediately.

Second, the feed preserves context. Cursor pagination adds older history without resetting the current viewport, and virtualization keeps measured heights for rows that are no longer mounted.

Third, expensive media work stays close to the viewport. Media tickets, image loading, video preload, and playback are visibility-driven. Autoplay is user-controlled and reduced-motion aware.

Fourth, ranking does not remove agency. Users can switch to `Latest`, favorite sources, tune relevance with More/Less Like This, hide a source only from `For You`, and reset personalization without clearing saved/read state or favorite sources.

## Brand

The current Supergram mark is a high-contrast black-and-white plane-inspired mark in a rounded square. It is used through the landing page, session boot, product shell, and app identity. The product should remain clearly described as an independent Telegram client and should not use Telegram-like visual trust signals such as treating a username as verification.

The interface avoids generic product-marketing filler. Copy should describe a real user action, product behavior, or implementation fact. Avoid claims such as "seamless", "revolutionary", "next-generation", "powerful", or "all-in-one" unless a concrete sentence immediately proves the claim.

## Local development

Copy `.env.example` to `.env`, add the Telegram credentials and local secrets, then run:

```bash
npm install
npm run dev
```

`npm run dev` starts Vite and the local Express/Teleproto backend. Vite proxies `/api/*` to port `8787`.

The repository currently uses npm in CI. The CI workflow runs server/API syntax checks followed by the production Vite build.

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
- Feed-personalization actions and preferences are stored locally in the browser unless explicitly moved to a server-backed system later.

## Health endpoints

Railway exposes:

```text
GET /api/health
GET /api/ready
```

Through Vercel, `/api/health` should report a configured persistent Node runtime.

## Product constraints

Supergram is still an unofficial Telegram client. Telegram API limits, MTProto behavior, source visibility, archived-folder behavior, and sponsored-message requirements remain upstream constraints and should be tested against real accounts before broad release.

Current known follow-up scope includes full-history Telegram search, richer backend reaction ownership/verification metadata, and a deeper evidence view for cross-source story clusters.
