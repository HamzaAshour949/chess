# CLAUDE.md — Chess Hub Project Context

> **Living Document Rule:** Update this file whenever there is a structural
> change — new models, new API routes, new features, changed architecture, or
> anything that would alter how another developer (or AI) understands the
> codebase. This is the single source of truth for project context.

## Project Overview

A bilingual (English / Arabic) chess players & news CMS **plus** a real-time
multiplayer chess platform, built as an **Express + TypeScript** API with a
**React + Vite** SPA on **MongoDB**. Registered players play live ranked games
with server-validated moves and server-authoritative clocks; admins curate the
catalogue and moderate. In production one Node process serves the API, the
WebSocket and the built SPA on a single port.

---

## Tech Stack

| Layer      | Technology                                                  |
|------------|-------------------------------------------------------------|
| Runtime    | Node.js 20.11+ (ESM), TypeScript 5.9 strict, `NodeNext`      |
| API        | Express 5                                                    |
| Real-time  | Socket.IO 4 (rooms per game, per lobby, per user)            |
| Database   | MongoDB 7+ via Mongoose 9                                    |
| Auth       | JWT bearer tokens; bcrypt password and OTP hashing           |
| Validation | Zod 4 at every request boundary                              |
| Chess      | `chess.js` server-side, verified in-repo with perft          |
| Images     | `sharp` — decode and re-encode before storage                |
| Email      | Brevo transactional API; console fallback in development     |
| Logging    | Pino (`pino-http`), pretty in dev, JSON in production        |
| Frontend   | React 19, Vite 8 (Rolldown), React Router 7                  |
| Chess UI   | `react-chessboard` 5 (options API)                           |
| i18n       | `react-i18next`, with admin-editable overrides from the API  |
| Styling    | Tailwind CSS 4, custom dark design system, RTL support       |
| Tests      | Vitest + Supertest (160 tests)                               |
| Tooling    | ESLint flat config, Prettier, npm workspaces                 |

---

## Directory Structure

```
├── package.json                 npm workspaces root; all scripts live here
├── tsconfig.base.json           Shared strict TS settings
├── eslint.config.js             Flat config for both workspaces
├── .env / .env.example          Single env file at the repo root
├── scripts/mongo-dev.sh         Local MongoDB single-node replica set
│
├── server/
│   ├── src/
│   │   ├── index.ts             HTTP server + Socket.IO + graceful shutdown
│   │   ├── app.ts               Express app, helmet/CORS, static SPA, errors
│   │   ├── config/env.ts        Zod-validated env; throws at boot if invalid
│   │   ├── db/
│   │   │   ├── mongoose.ts      Connection; `supportsTransactions()` probe
│   │   │   ├── sync-indexes.ts  Explicit index creation (autoIndex is off)
│   │   │   ├── seed.ts          Catalogue + demo accounts (idempotent)
│   │   │   ├── repair-games.ts  Rebuild fen/pgn/moveCount from move lists
│   │   │   └── seed-data/       content.json — the migrated catalogue
│   │   ├── lib/
│   │   │   ├── chess.ts         replay/playMove/outcome/perft helpers
│   │   │   ├── elo.ts           K-factor and rating maths
│   │   │   ├── otp.ts           Generation, hashing, expiry, cooldown
│   │   │   ├── email.ts         Brevo wrapper + bilingual OTP template
│   │   │   ├── jwt.ts           Sign/verify with role as claim AND audience
│   │   │   ├── sanitize.ts      Chat cleaning, trimming, regex escaping
│   │   │   ├── serializers.ts   Every API response shape, explicitly
│   │   │   ├── validate.ts      Zod request parsing helpers
│   │   │   ├── http-error.ts    HttpError with status/code/details
│   │   │   └── async-handler.ts Async route wrapper
│   │   ├── middleware/
│   │   │   ├── auth.ts          authenticate, requireUser/Admin, optionalUser
│   │   │   ├── rate-limit.ts    Named limiters per endpoint class
│   │   │   └── error-handler.ts Single place errors become JSON
│   │   ├── models/              Ten Mongoose models + index.ts barrel
│   │   ├── realtime/
│   │   │   ├── io.ts            Socket.IO server, rooms, handshake auth
│   │   │   └── publish.ts       Seam so routes never import the socket server
│   │   ├── routes/              One module per area + index.ts mounting
│   │   └── services/game-service.ts  Clocks, results, ratings
│   └── tests/{unit,feature,helpers}/
│
├── frontend/src/
│   ├── api.js                   Axios; picks the correct identity's token
│   ├── realtime.js              Shared Socket.IO connection
│   ├── hooks/useLive.js         useLiveGame/useLiveChat/useLiveLobby/clocks
│   ├── context/                 AuthContext, UserAuthContext, LanguageContext
│   ├── layouts/                 PublicLayout, AdminLayout
│   ├── locales/                 en.json / ar.json — must stay key-for-key equal
│   └── pages/{public,admin}/    Admin pages are lazy-loaded
│
└── uploads/                     Uploaded images (git-ignored)
```

---

## Environment Variables

One `.env` at the repo root, validated by `server/src/config/env.ts`. A missing
or malformed value stops the process at boot with the offending field named.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | HTTP + WebSocket port (default `8080`) |
| `APP_URL` | Public origin, used in emails |
| `MONGODB_URI` | Connection string; include `?replicaSet=rs0` locally |
| `JWT_SECRET` | **Required**, minimum 32 characters |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `BCRYPT_ROUNDS` | 10–15 (default 12) |
| `CORS_ORIGINS` | Comma-separated allow-list; empty = same-origin only |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | Global limiter |
| `TRUST_PROXY` | `1` only behind a real reverse proxy |
| `UPLOAD_DIR` / `UPLOAD_MAX_BYTES` | Image storage |
| `DEFAULT_RATING` / `PROVISIONAL_GAMES` | Elo configuration |
| `BREVO_API_KEY` / `BREVO_FROM_EMAIL` / `BREVO_FROM_NAME` | Email |
| `LOG_LEVEL` | Pino level |

---

## How to Run Locally

```bash
npm install
cp .env.example .env      # then set JWT_SECRET
npm run db:start          # mongod as a single-node replica set in .mongo-data/
npm run db:seed
npm run dev               # SPA on :3000 (proxied), API + WS on :8080
```

Production-shaped run: `npm run build && npm start` → everything on `:8080`.

---

## Models Quick Reference

Mongo documents use **camelCase**; the API wire format is **snake_case**, mapped
explicitly in `lib/serializers.ts`.

| Model | Key fields |
|---|---|
| `Admin` | username, email, passwordHash *(`select: false`)* |
| `Player` | nameEn/Ar, bioEn/Ar, country, rating, title, imageUrl, dateOfBirth, **isPlayerOfMonth**, **isTournamentWinner** |
| `News` | titleEn/Ar, contentEn/Ar, region (`en`\|`ar`\|`both`), imageUrl, published, **isFeatured**, publishedAt, playerId |
| `SiteString` | key, lang, value — unique on (key, lang) |
| `User` | username, email, passwordHash, displayName, avatarUrl, country, **isVerified**, otpCodeHash *(bcrypt)*, otpExpiresAt, otpAttempts, otpLastSentAt, **onlineRating** (1200), gamesPlayed/Won/Lost/Drawn, **linkedPlayerId** *(admin-only, unique)*, isBanned, bannedAt, banReason, chatMuted, notifEmail/Dm/GameChat/Sound, lastLoginAt |
| `LinkRequest` | userId, playerId, message, status, adminNote, reviewedByAdminId, reviewedAt |
| `Game` | white/black/creatorUserId, creatorColor, status, result, **termination**, **moves** *(UCI — source of truth)*, fen, pgn, moveCount, **version**, timeControlSeconds, incrementSeconds, **whiteTimeMs/blackTimeMs**, rated, min/maxOppRating, white/blackRatingBefore/After, **ratingsApplied**, drawOfferBy, chatDisabled, voidedAt, voidedByAdminId, voidReason, startedAt, lastMoveAt, endedAt |
| `GameMessage` | gameId, userId, content (≤500, URLs stripped), isDeleted, deletedByAdminId |
| `DirectMessage` | senderId, recipientId, content (≤2000), readAt, isDeleted, deletedByAdminId, **pairKey** *(sorted id pair)* |
| `BlockedUser` | blockerId, blockedId — unique pair |

### Indexes that are constraints, not optimisations

`autoIndex` is **off**; `npm run db:indexes` creates them. The application
depends on these three:

- `users.linkedPlayerId` — unique, **partial** on `{ $type: 'objectId' }`.
  Partial, not sparse: every unlinked account stores an explicit `null`, and a
  sparse index only skips *missing* fields, so it would reject the second
  unlinked account.
- `link_requests.userId` — unique, partial on `{ status: 'pending' }`.
- `games.creatorUserId` — unique, partial on `{ status: 'open' }`.

---

## Authentication & Authorization (CRITICAL)

Two identities in **separate collections**. An admin is not a user with a flag;
no route promotes one to the other.

| Identity | Login | Token role | `localStorage` | Guard |
|---|---|---|---|---|
| Admin | `POST /api/auth/login` | `admin` | `token` | `requireAdmin` |
| Player | `POST /api/users/auth/login` | `user` | `user_token` | `requireUser` |

- The role is a **signed claim and the token's `aud`**; `verifyToken` rejects a
  token whose audience does not match its role, so one side's token can never be
  spent as the other's.
- Both guards **re-read the account on every request**. A ban, mute or deletion
  takes effect immediately rather than at token expiry.
- `optionalUser` loads the player if signed in but permits anonymous access —
  used where spectators and participants share a route.
- The frontend `api.js` picks the token by URL prefix; `/games/admin`,
  `/messages/admin` and `/links/admin` resolve to the **admin** token even
  though their prefixes are otherwise player-facing.

---

## Chess Engine Rules (CRITICAL)

**`Game.moves` (space-separated UCI) is the source of truth.** `fen`, `pgn` and
`moveCount` are caches recomputed from it on every write.

- `lib/chess.ts::replayGame()` replays from the start position on every move
  request. This is what makes **threefold repetition** detectable — a FEN
  carries no history — and it means a tampered or stale cache can never let an
  illegal position stand.
- `playMove()` returns everything to persist. Never write `fen` or `pgn` from
  anywhere else. `pgn` is **movetext only**; use `buildPgn()`, never chess.js's
  `pgn()`, which emits a seven-tag header block.
- Threefold repetition and the fifty-move rule are applied **automatically**,
  not left as a claim.
- Replaying a 200-ply game costs well under a millisecond.
- `npm run db:repair` rebuilds the caches for every game.

### Concurrency

Every transition is a **guarded conditional update**:

| Action | Guard |
|---|---|
| Move | `{ _id, status: 'active', version }` — a stale read writes nothing |
| Accept | `{ _id, status: 'open' }` — only one of two racing accepts wins |
| Finish | `{ _id, status: 'active' }` + `ratingsApplied` for the rating write |
| Void | `{ _id, voidedAt: null }` — cannot reverse Elo twice |

All are covered by tests firing simultaneous requests.

### Clocks

Milliseconds, server-authoritative. On each move the server subtracts elapsed
time and adds the Fischer increment; milliseconds avoid the rounding drift a
whole-second budget accumulates in the mover's favour. `enforceClock()` runs
lazily on every game read and move attempt. Flagging against an opponent who
cannot mate (`canMate()`: bare king, or king and one minor piece) is a **draw**.
Responses carry `server_time` so clients correct for their own skew.

### Elo

Separate from `Player.rating`. Start 1200. K = 40 provisional (<10 games), 20
established, 10 at 2400+. Both players' before/after are stored on the game, so
voiding reverses the exact deltas applied.

---

## Real-time (Socket.IO)

- Rooms: `game:<id>`, `lobby`, `user:<id>`.
- Handshake reads the player token from `auth.token`; anonymous is allowed
  (spectating is public) and simply joins no user room.
- Routes publish through `realtime/publish.ts`, never by importing the socket
  server. That keeps the dependency one-way and makes publishing a no-op in
  tests.
- **The REST API stays complete and authoritative.** Every live view also polls
  — 30s while connected, 2s while not — so a client behind a WebSocket-blocking
  proxy still works.
- Clients accept an update only when `version` is newer, so an out-of-order
  frame cannot move the board backwards.
- `version` increments on **any** observable change, including draw offers and
  chat toggles — not just moves.

---

## Player-Profile Linking (SECURITY-CRITICAL)

Users may request association with an editorial `Player`. The link is one-way
and confers **identity only**:

- Only an admin approving a `LinkRequest` ever sets `User.linkedPlayerId`.
  No endpoint accepts it from a user.
- Being linked grants **no write access** to the `Player` row. Only
  `requireAdmin` routes in `players.ts` can mutate players. There is a feature
  test that signs in as a linked user, attempts the edit, and asserts 403.
- A unique partial index guarantees one profile cannot back two accounts.
- `POST /api/links/admin/users/:id/unlink` breaks a link.

---

## API Routes Summary

73 routes, all under `/api`, all JSON. Errors are `{ error }` plus `details` for
validation failures and `code` for cases the SPA branches on
(`email_unverified`, `account_banned`). Lists take `?page=` / `?per_page=`;
bilingual reads take `?lang=en|ar`.

**Public:** `GET /health`, `/players`, `/players/:id`, `/players/homepage`,
`/news`, `/news/:id`, `/strings`, `/games/lobby`, `/games/live`,
`/games/recent`, `/games/leaderboard`, `/games/:id`, `/games/:id/chat`;
`POST /auth/login`, `/auth/setup`, `/users/auth/{register,verify-otp,resend-otp,login}`.

**Player token:** `GET|PATCH /users/auth/me`; `POST /games`;
`POST /games/:id/{accept,cancel,move,resign,draw-offer,draw-accept,draw-decline,claim-time,chat}`;
`GET /games/me/games`; `/messages/{threads,unread-count}`;
`GET|POST /messages/with/:userId`; `/messages/blocks*`;
`POST /links/request`; `GET /links/my-requests`.

**Admin token:** `GET /auth/me`; players and news CRUD; `GET /news/admin`;
`/strings/{all,bulk}` and `POST|DELETE /strings*`; `POST /upload/image`;
`/games/admin/{stats,games,messages}` incl. `abort`, `void`, `chat-toggle`;
`/messages/admin/dms*`; `/links/admin/requests*`; `/links/admin/users*`
(`ban`, `unban`, `verify`, `mute`, `unmute`, `unlink`).

---

## Homepage Features

| Feature | How it works |
|---|---|
| **Featured News** | One article with `isFeatured` is the spotlight card. Setting it clears the previous one. Falls back to the latest article. |
| **Player of the Month** | One player with `isPlayerOfMonth`, shown in a gold card. Exclusive. |
| **Tournament Winner** | One player with `isTournamentWinner`, shown in a blue card. Exclusive. |

`GET /api/players/homepage?lang=en` returns `{ player_of_month, tournament_winner }`.

---

## Guardrails & Safety Rules

### DO NOT

- **Never** commit `.env` or secrets.
- **Never** write `fen`, `pgn` or `moveCount` from anywhere but `playMove()`.
  They are caches; `moves` is the truth.
- **Never** validate a move against the stored FEN — always replay `moves`.
- **Never** read a game, decide, then write without a guard. Use a conditional
  update on `version` or `status`.
- **Never** use chess.js's `pgn()` for the API — it emits header tags.
- **Never** allow `*` CORS origins, or enable `TRUST_PROXY` without a proxy.
- **Never** trust a file extension or client MIME type on upload.
- **Never** interpolate user input into a `RegExp` — use `escapeRegex()`.
- **Never** add a field to a model and assume it is private; serializers list
  fields explicitly, so add it deliberately or not at all.
- **Never** use a `sparse` unique index where the field is stored as explicit
  `null` — use `partialFilterExpression`.
- **Never** truncate chat before stripping URLs; the replacement can grow it.
- **Never** import the Socket.IO server from a route; publish through
  `realtime/publish.ts`.

### DO

- **Always** validate request input with Zod at the boundary.
- **Always** add a rate limiter to new endpoints accepting input.
- **Always** guard admin endpoints with `requireAdmin`, player endpoints with
  `requireUser`.
- **Always** bump `version` when changing anything a client can observe.
- **Always** serialize responses through `lib/serializers.ts`.
- **Always** add both `en` and `ar` keys when adding a UI string — the locale
  files must stay key-for-key equal.
- **Always** run `npm run db:indexes` after adding an index; several are
  constraints the code relies on.
- **Always** run `npm test`, `npm run typecheck` and `npm run lint` before
  committing.
- **Always** update this file when adding models, routes, or changing
  architecture.

### Database Rules

- MongoDB 7+; **a replica set is required** for transactions (the game-finish
  path). `supportsTransactions()` degrades to sequential writes on standalone,
  but the guards still prevent double-application.
- Schema changes are code changes in `server/src/models/`; there is no migration
  runner. Adding an index means updating the model and running `db:indexes`.
- Documents are camelCase; the wire format is snake_case via serializers.

### API Design Standards

- All routes under `/api/`; proper status codes (200, 201, 400, 401, 403, 404,
  409, 422, 429).
- Errors are `{ "error": "message" }`, with `details` for validation and `code`
  for machine-readable cases.
- `?lang=en|ar` for bilingual content; `?page=` / `?per_page=` for lists.
- Bilingual fields follow `fieldEn` / `fieldAr` (`field_en` / `field_ar` on the
  wire).

---

## Testing

`npm test` — 160 tests, ~26s, against a real MongoDB (`chess_hub_test`).

- **Unit:** chess (incl. perft against six reference positions), Elo, sanitisers.
- **Feature:** auth and role separation, CMS and uploads, games and concurrency,
  Socket.IO delivery, social and moderation.
- `tests/helpers/app.ts` provides `request()`, `resetDatabase()`, `makeUser()`,
  `makeAdmin()`, `auth(token)`. It syncs indexes before the first assertion
  because several are constraints under test.
- Perft is not ceremony: move legality is the entire security model of a chess
  server, so it is verified here rather than trusted to the dependency.
