# CLAUDE.md — Chess Hub Project Context

> **Living Document Rule:** Update this file whenever there is a structural
> change — new models, new API routes, new features, changed architecture, or
> anything that would alter how another developer (or AI) understands the
> codebase. This is the single source of truth for project context.

## Project Overview

A bilingual (English / Arabic) chess players & news CMS **plus** a real-time
multiplayer chess platform, built as an **Express + TypeScript** API on **Bun**
with a **React + Vite** SPA on **MongoDB**. Registered players play live rated
games with server-validated moves and server-authoritative clocks; admins curate
the catalogue and moderate. In production one Bun process serves the API, the
WebSocket and the built SPA on a single port.

---

## Tech Stack

| Layer      | Technology                                                  |
|------------|-------------------------------------------------------------|
| Runtime    | **Bun 1.3** (`packageManager: bun@1.3.13`); runs `.ts` directly |
| Language   | TypeScript 5.9 strict, `module: Preserve`, `moduleResolution: bundler`, `noEmit` |
| API        | Express 5, `compression`, `helmet`                           |
| Real-time  | Socket.IO 4 (rooms per game, per lobby, per user; presence)  |
| Database   | MongoDB 7+ (replica set) via Mongoose 9                      |
| Auth       | JWT (HS256) with a `ver` claim; bcrypt via `Bun.password`    |
| Validation | Zod 4 at every request boundary                              |
| Chess      | `chess.js` server-side, verified in-repo with perft          |
| Images     | `sharp` + `multer` — decode and re-encode before storage     |
| Email      | Brevo transactional API; console fallback outside production |
| Logging    | Pino (`pino-http`), pretty in dev, JSON in production        |
| Frontend   | React 19, Vite 8 (run with `bun --bun vite`), React Router 7 |
| Chess UI   | `react-chessboard` 5 (options API), `chess.js` client-side for legal-move hints |
| i18n       | `react-i18next` with plurals, admin-editable overrides from the API |
| Styling    | Tailwind CSS 4, custom dark design system, RTL support       |
| Tests      | `bun test` + Supertest (218 tests, ~35s)                     |
| Tooling    | ESLint flat config, Prettier, Bun workspaces                 |
| Shipping   | `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml` |

---

## Directory Structure

```
├── package.json                 Bun workspaces root; all scripts live here
├── bun.lock                     The lockfile (there is no package-lock.json)
├── tsconfig.base.json           Shared strict TS settings
├── eslint.config.js             Flat config for both workspaces
├── .env / .env.example          Single env file at the repo root
├── Dockerfile                   SPA build → server prod deps → slim runtime
├── docker-compose.yml           App + mongo:8 replica set
├── .github/workflows/ci.yml     typecheck, lint, test, build, docker build
├── scripts/up.ts                `bun run up` — the one-command dev start
├── scripts/mongo-dev.sh         Local MongoDB single-node replica set
│
├── server/
│   ├── bunfig.toml              Test preload (tests/setup.ts)
│   ├── src/
│   │   ├── index.ts             HTTP + Socket.IO, index sync, sweeper, shutdown
│   │   ├── app.ts               Express app, helmet/CORS, compression, static SPA
│   │   ├── config/env.ts        Zod-validated env; throws at boot if invalid
│   │   ├── db/
│   │   │   ├── mongoose.ts      Connection; `supportsTransactions()` (cached),
│   │   │   │                    `isDatabaseConnected()`
│   │   │   ├── sync-indexes.ts  Explicit index creation (autoIndex is off)
│   │   │   ├── seed.ts          Catalogue + demo accounts (idempotent; --fresh, --if-empty)
│   │   │   ├── repair-games.ts  Rebuild fen/pgn/moveCount from move lists
│   │   │   └── seed-data/       content.json — the migrated catalogue
│   │   ├── lib/
│   │   │   ├── chess.ts         replay/playMove/outcome/perft, buildPgnDocument
│   │   │   ├── clock.ts         Pure clock maths: first-move window, deadlines
│   │   │   ├── elo.ts           K-factor and rating maths
│   │   │   ├── password.ts      hash/verify via Bun.password, rehash, dummy hash
│   │   │   ├── otp.ts           Generation, hashing, expiry, cooldown
│   │   │   ├── email.ts         Brevo wrapper + bilingual templates
│   │   │   ├── images.ts        multer upload, sharp re-encode, removal
│   │   │   ├── jwt.ts           Sign/verify: role as claim AND audience, `ver`
│   │   │   ├── sanitize.ts      Chat cleaning, trimming, regex escaping
│   │   │   ├── serializers.ts   Every API response shape, explicitly
│   │   │   ├── validate.ts      Zod request parsing helpers
│   │   │   ├── http-error.ts    HttpError with status/code/details
│   │   │   ├── logger.ts        Pino instance
│   │   │   └── async-handler.ts Async route wrapper
│   │   ├── middleware/
│   │   │   ├── auth.ts          authenticate, requireUser/Admin, optionalUser
│   │   │   ├── rate-limit.ts    Named limiters; per-account keys when signed in
│   │   │   └── error-handler.ts Single place errors become JSON
│   │   ├── models/              Ten Mongoose models + index.ts barrel
│   │   ├── realtime/
│   │   │   ├── io.ts            Socket.IO server, rooms, handshake auth, presence
│   │   │   └── publish.ts       Seam so routes never import the socket server
│   │   ├── routes/              One module per area + index.ts mounting
│   │   └── services/
│   │       ├── game-service.ts  Load, clocks, finish/abort, ratings, sweeper
│   │       ├── account-service.ts  withdrawFromPlay, deleteAccount
│   │       └── blocks.ts        blockedBetween, hasBlocked
│   └── tests/{unit,feature,helpers}/ + setup.ts
│
├── frontend/
│   ├── public/                  favicon.svg, manifest, robots.txt, boot.js
│   └── src/
│       ├── api.js               Axios; picks the correct identity's token
│       ├── realtime.js          Shared Socket.IO connection
│       ├── hooks/               useLive (game/chat/lobby/clocks/countdown),
│       │                        useFetch, useDebounced, useDocumentTitle
│       ├── lib/                 format.js, chess-view.js, sound.js
│       ├── components/          ui/{Toaster,Dialog,PasswordInput}, Avatar,
│       │                        MiniBoard, NotificationCenter, UserSearch, …
│       ├── context/             AuthContext, UserAuthContext, LanguageContext
│       ├── layouts/             PublicLayout, AdminLayout
│       ├── locales/             en.json / ar.json
│       └── pages/{public,admin}/  Every page is lazy-loaded; game/ holds the
│                                board's sub-components
│
└── uploads/                     Uploaded images (git-ignored)
```

---

## Environment Variables

One `.env` at the repo root. Bun loads it (`--env-file=../.env` in the server
scripts; a missing file is skipped, and a real environment variable wins).
`server/src/config/env.ts` validates it; a missing or malformed value stops the
process at boot with the offending field named.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | HTTP + WebSocket port (default `8080`) |
| `APP_URL` | Where the site is opened (dev: `http://localhost:3000`); builds email links, the PGN `Site` tag and the seed summary |
| `MONGODB_URI` | Connection string; include `?replicaSet=rs0` locally |
| `DB_SYNC_INDEXES` | Sync indexes on boot (default `1`) |
| `JWT_SECRET` | **Required**, minimum 32 characters; placeholders refused in production |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `BCRYPT_ROUNDS` | 10–15 (default 12) |
| `CORS_ORIGINS` | Comma-separated allow-list; empty = same-origin only |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | Global limiter |
| `TRUST_PROXY` | `1` only behind a real reverse proxy |
| `UPLOAD_DIR` / `UPLOAD_MAX_BYTES` | Image storage |
| `DEFAULT_RATING` / `PROVISIONAL_GAMES` | Elo configuration |
| `FIRST_MOVE_TIMEOUT_SECONDS` | Window for each side's first move (default 45) |
| `CHALLENGE_TTL_MINUTES` | Unaccepted seeks expire after this (default 30) |
| `BREVO_API_KEY` / `BREVO_FROM_EMAIL` / `BREVO_FROM_NAME` | Email; key required in production unless `EMAIL_CONSOLE=1` |
| `EMAIL_CONSOLE` | Log emails instead of sending |
| `LOG_LEVEL` | Pino level |
| `PRODUCTION_APP_URL` / `PRODUCTION_CORS_ORIGINS` | Read by `docker-compose.yml` in place of `APP_URL` / `CORS_ORIGINS`, so dev values never reach the container |

---

## How to Run Locally

```bash
bun run up                # everything: SPA on :3000, API + WS on :8080
```

`scripts/up.ts` installs dependencies, creates `.env` from `.env.example` with
a fresh `JWT_SECRET` on first run, refuses to start if :8080 or :3000 is taken,
starts the local MongoDB (unless `MONGODB_URI` is remote), runs
`db:seed --if-empty` (never touches a database with an admin or a player), then
runs `bun run dev` **in its own process group** and waits for both servers.
Ctrl+C, SIGTERM or SIGHUP stops the whole group, then MongoDB if `up` started
it. The group matters: `bun run --parallel` does not forward a SIGTERM sent to
it alone, which used to orphan both servers. `up` takes `PORT` from `.env`
even if the caller's environment sets one, and passes `VITE_API_ORIGIN` to
match. The manual equivalent is `db:start`, `db:seed`, `dev`.

Production-shaped run: `bun run build && bun run start` → everything on `:8080`.
There is no server build step. `bun run check` runs typecheck, lint and tests.

### Bun-specific notes (read before changing dependencies or dev tooling)

- **`bson` is pinned to 7.2.0** in root `overrides`. bson 7.3.x calls
  `v8.startupSnapshot.isBuildingSnapshot()`, which Bun does not implement, and
  Mongoose fails to import. Do not remove the override without testing.
- **The dev socket bypasses the Vite proxy.** Vite's WS proxy calls a Node
  `net.Socket` method Bun lacks and crashes. `vite.config.js` defines
  `__SOCKET_ORIGIN__` as the API origin under `vite serve` (empty in builds, so
  production is same-origin), and the proxy covers only `/api` and `/uploads`.
  This is why `CORS_ORIGINS` must include `http://localhost:3000` in dev.
- `sharp` is in `trustedDependencies` so its postinstall runs.
- Entry scripts use `import.meta.main`; paths use `import.meta.dir`.
- `closeRealtime(io, server, graceMs)` closes connections synchronously when
  `graceMs` is 0 — under Bun, `io.close()` alone never calls back while an
  upgraded socket is open, which used to hang the test suite.

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
| `User` | username, email, passwordHash, **tokenVersion**, displayName, avatarUrl, country, **lang**, **isVerified**, otpCodeHash/ExpiresAt/Attempts/LastSentAt, **resetCodeHash/ExpiresAt/Attempts/LastSentAt**, **onlineRating** (1200), gamesPlayed/Won/Lost/Drawn, **linkedPlayerId** *(admin-only, unique)*, isBanned, bannedAt, banReason, chatMuted, notifEmail/Dm/GameChat/Sound, lastLoginAt, **deletedAt** |
| `LinkRequest` | userId, playerId, message, status, adminNote, reviewedByAdminId, reviewedAt |
| `Game` | white/black/creatorUserId, creatorColor, **invitedUserId**, **direct**, **rematchOfGameId**, status, result, **termination**, **moves** *(UCI — source of truth)*, fen, pgn, moveCount, **version**, timeControlSeconds, incrementSeconds, **whiteTimeMs/blackTimeMs**, **deadlineAt**, rated, min/maxOppRating, white/blackRatingBefore/After, **ratingsApplied**, drawOfferBy, chatDisabled, voidedAt, voidedByAdminId, voidReason, startedAt, lastMoveAt, endedAt |
| `GameMessage` | gameId, userId, content (≤500, URLs stripped), isDeleted, deletedByAdminId |
| `DirectMessage` | senderId, recipientId, content (≤2000), readAt, isDeleted, deletedByAdminId, **pairKey** *(sorted id pair)* |
| `BlockedUser` | blockerId, blockedId — unique pair |

`Game.status` is `open | active | white_wins | black_wins | draw | aborted`.
`termination` adds `abandoned` (no first move), `aborted`, and, for challenges
that never became games, `cancelled | declined | expired` to the usual
`checkmate | stalemate | insufficient_material | threefold_repetition |
fifty_moves | resignation | timeout | agreement`.

A deleted account is **anonymised, not removed**: username `del_<id>`, email
`deleted+<id>@invalid.local`, `deletedAt` set, `tokenVersion` bumped, and its
seeks withdrawn, so finished games and ratings stay consistent.

### Indexes that are constraints, not optimisations

`autoIndex` is **off**. Indexes are synced on boot (unless `DB_SYNC_INDEXES=0`)
and by `bun run db:indexes`. The application depends on these:

- `users.username_ci_unique` — unique with collation `{ locale: 'en', strength: 2 }`
  (`USERNAME_COLLATION`), so `Magnus` and `magnus` collide. Queries by username
  must pass the same collation to use it.
- `users.unverified_ttl` — TTL on `createdAt`, partial on `{ isVerified: false }`:
  abandoned sign-ups expire after 7 days, so names and emails cannot be squatted.
- `users.linkedPlayerId` — unique, **partial** on `{ $type: 'objectId' }`.
  Partial, not sparse: every unlinked account stores an explicit `null`, and a
  sparse index only skips *missing* fields, so it would reject the second
  unlinked account.
- `link_requests.userId` — unique, partial on `{ status: 'pending' }`.
- `games.one_open_seek_per_creator` — unique `creatorUserId`, partial on
  `{ status: 'open', direct: false }`.
- `games.one_open_invite_per_pair` — unique (`creatorUserId`, `invitedUserId`),
  partial on `{ status: 'open', direct: true }`.

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
  spent as the other's. The algorithm is fixed to HS256.
- Player tokens carry `ver` = `User.tokenVersion`. Password change, password
  reset, `POST /users/auth/me/sessions/revoke` and account deletion bump it;
  `tokenStillValid()` rejects older tokens.
- Both guards **re-read the account on every request**. A ban, mute, deletion
  or revocation takes effect immediately rather than at token expiry.
- `optionalUser` loads the player if signed in but permits anonymous access —
  used where spectators and participants share a route.
- Passwords: `lib/password.ts`. `verifyPassword()` returns `{ valid,
  needsRehash }`; logins rehash when the cost differs from `BCRYPT_ROUNDS`.
  Unknown accounts still run `verifyAgainstNothing()` so timing leaks nothing;
  its stand-in hash is made at boot (`prepareDummyHash()`, awaited before
  `listen`), since making it lazily doubled the first unknown-account check.
- OTP and reset attempts are **reserved with a guarded `$inc` before the code
  is checked**, so parallel guesses cannot exceed the limit.
- Usernames in `RESERVED_USERNAMES` (`admin`, `support`, …) cannot be registered.
- The frontend `api.js` picks the token by URL prefix (`audienceFor`);
  `/games/admin`, `/messages/admin` and `/links/admin` resolve to the **admin**
  token even though their prefixes are otherwise player-facing. A 401 on a
  signed-in request fires `SESSION_EXPIRED_EVENT`.

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
  `pgn()`, which emits a seven-tag header block. The downloadable file
  (`GET /games/:id/pgn`) is built by `buildPgnDocument(tags, sanMoves)`.
- Threefold repetition and the fifty-move rule are applied **automatically**,
  not left as a claim.
- Replaying a 200-ply game costs well under a millisecond.
- `bun run db:repair` rebuilds the caches for every game.

### Concurrency

Every transition is a **guarded conditional update**:

| Action | Guard |
|---|---|
| Move | `{ _id, status: 'active', version }` — a stale read writes nothing |
| Accept / quick pair | `{ _id, status: 'open' }` — only one of two racing accepts wins |
| Finish | `{ _id, status: 'active' }` + `ratingsApplied` for the rating write |
| Abort / cancel / decline / expire | `abortGame(id, termination, { from })` — guarded on the allowed statuses |
| Void | `{ _id, voidedAt: null }` — cannot reverse Elo twice |

All are covered by tests firing simultaneous requests. Starting a game
(`startChallenge`) also withdraws the players' other open seeks.

### Clocks (`lib/clock.ts`, `services/game-service.ts`)

Milliseconds, server-authoritative. On each move the server subtracts elapsed
time and adds the Fischer increment; milliseconds avoid the rounding drift a
whole-second budget accumulates in the mover's favour.

- **First moves are free** (`FREE_PLIES = 2`): the clock starts after Black's
  first move. Until then each side has `env.firstMoveTimeoutMs` from the game
  start / White's move; missing it aborts the game as `abandoned`, unrated.
  `clock_running` on the wire tells clients whether to tick.
- Every active game stores **`deadlineAt`** (`deadlineFor(game)`), rewritten on
  every move. `startSweeper()` (every 3s, from `index.ts`) settles games past
  their deadline and announces them, backfills missing deadlines, and expires
  open seeks older than `CHALLENGE_TTL_MINUTES`. All its writes are guarded, so
  several instances can sweep at once.
- `enforceClock()` also runs lazily on every game read and move attempt.
- Flagging against an opponent who cannot mate (`canMate()`: bare king, or king
  and one minor piece) is a **draw**.
- Responses carry `server_time`; the client stamps `_receivedAt`/`_skew` and
  corrects for its own clock.

### Game flow rules

- Draw offers: offering while the opponent's offer stands is an **agreement**.
  An offer survives the offerer's own next move and is cleared by the
  opponent's move.
- Abort is allowed only before the second ply; resign any time while active.
- Rematch: `POST /games/:id/rematch` creates a direct challenge with colours
  swapped (`rematchOfGameId`); if the opponent already offered one, it is
  accepted instead.
- Blocking in either direction prevents direct challenges and quick pairing.

### Elo

Separate from `Player.rating`. Start 1200. K = 40 provisional (<10 games), 20
established, 10 at 2400+. Both players' before/after are stored on the game, so
voiding reverses the exact deltas applied. Aborted games are never rated.

---

## Real-time (Socket.IO)

- Rooms: `game:<id>`, `lobby`, `user:<id>`.
- Handshake reads the player token from `auth.token`, **re-checks the account**
  (banned, deleted and revoked tokens are refused), and tracks presence
  (`isOnline`). Anonymous is allowed (spectating is public) and joins no user
  room. `disconnectUser()` kicks a banned or deleted account.
- Routes publish through `realtime/publish.ts` (`publishGame`,
  `publishGameMessage`, `publishDirectMessage`, `notifyUser`), never by importing
  the socket server. That keeps the dependency one-way and makes publishing a
  no-op in tests. `services/game-service.ts::announce()` wraps the common case.
- Server → client events: `game:update`, `game:chat`, `lobby:update`, `dm:new`,
  `challenge:received`, `challenge:closed`, `game:started`, `link:reviewed`,
  `account:banned`, `account:deleted`.
- **The REST API stays complete and authoritative.** Every live view also polls
  — 30s while connected, 2s while not — so a client behind a WebSocket-blocking
  proxy still works.
- Clients accept an update only when `version` is newer, so an out-of-order
  frame cannot move the board backwards. Frontend live state is keyed by game
  id so navigating between games never shows the previous board.
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
  Approving a request auto-rejects the other pending requests for that player.
- The user is told the outcome live (`link:reviewed`) and by email.
- `POST /api/links/admin/users/:id/unlink` breaks a link.

---

## API Routes Summary

90 routes, all under `/api`, all JSON. Errors are `{ error }` plus `details` for
validation failures and `code` for cases the SPA branches on
(`email_unverified`, `account_banned`). Lists take `?page=` / `?per_page=`;
bilingual reads take `?lang=en|ar`. The full list with rate limits is in
`README.md`.

**Public:** `GET /health` (503 when the DB is down), `/players`, `/players/:id`,
`/players/homepage`, `/news`, `/news/:id`, `/strings`, `/games/lobby`,
`/games/live`, `/games/recent`, `/games/leaderboard`, `/games/:id`,
`/games/:id/pgn`, `/games/:id/chat`, `/users?search`, `/users/:username`,
`/users/:username/games`, `/users/:username/rating-history`;
`POST /auth/login`, `/auth/setup`,
`/users/auth/{register,verify-otp,resend-otp,login,forgot-password,reset-password}`.

**Player token:** `GET|PATCH|DELETE /users/auth/me`;
`POST /users/auth/me/{avatar,password,sessions/revoke}`; `POST /games`,
`POST /games/quick`;
`POST /games/:id/{accept,cancel,decline,move,resign,abort,claim-time,draw-offer,draw-accept,draw-decline,rematch,chat}`;
`GET /games/me/games`, `/games/me/challenges`;
`GET /messages/{threads,unread-count}`; `GET|POST /messages/with/:userId`,
`POST /messages/with/:userId/read`; `/messages/blocks*`;
`POST /links/request`; `GET /links/my-requests`.

**Admin token:** `GET /auth/me`; players and news CRUD; `GET /news/admin`;
`/strings/{all,bulk}` and `POST|DELETE /strings*`; `POST /upload/image`;
`/games/admin/{stats,games,messages}` incl. `abort`, `void`, `chat-toggle`;
`/messages/admin/dms*`; `/links/admin/requests*`; `/links/admin/users*`
(`ban`, `unban`, `verify`, `mute`, `unmute`, `unlink`).

Route order matters in `routes/index.ts`: `/health` is mounted before
`authenticate`; `/users/auth` before `/users`; `/games/admin` and
`/messages/admin` before `/games` and `/messages`.

---

## Frontend Conventions

- **Pages are lazy** (`App.jsx`), each wrapped in an `ErrorBoundary` keyed by
  pathname. Player-only routes use `ProtectedUserRoute`, which keeps the return
  path. `/profile` redirects to `/settings`; public profiles are `/u/:username`.
- **Data fetching:** `useFetch(url)` keys its result by URL, so a slow earlier
  response never overwrites a newer one. Prefer derived state to setting state
  inside an effect (the lint config enforces the React hooks rules).
- **Feedback:** `useToast()` for results, `useConfirm()` for confirmations and
  prompts (pass `input` for a text field). Never `window.alert`/`confirm`.
- **Bidi:** wrap user names and handles in `<bdi>`; use `isolate()` from
  `lib/format.js` when interpolating them into translated strings; give
  user-written text `dir="auto"`; boards and move lists are `dir="ltr"`.
- **Language** is set before first paint by `public/boot.js` (CSP-safe, no
  inline script). A signed-in player's language is stored on the account.
- **Styling:** component classes live in `@layer components` in `index.css` so
  utilities (e.g. `hidden`) can override them. Respect `prefers-reduced-motion`.
- **No edge accent stripes** on cards, rows or nav items; show state with a
  background tint, a full border, a badge, a dot or text weight.
- The board uses click-to-move and drag, with `lib/chess-view.js` for legal
  targets; the server remains the authority, and a refused optimistic move is
  rolled back.

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
- **Never** check an OTP/reset code and then count the attempt; reserve the
  attempt first.
- **Never** hard-delete a `User` that has played; use `deleteAccount()`.
- **Never** add `package-lock.json` or run npm; Bun owns the lockfile.

### DO

- **Always** validate request input with Zod at the boundary.
- **Always** add a rate limiter to new endpoints accepting input.
- **Always** guard admin endpoints with `requireAdmin`, player endpoints with
  `requireUser`.
- **Always** bump `version` when changing anything a client can observe.
- **Always** keep `deadlineAt` in step when changing a live game's clock state.
- **Always** serialize responses through `lib/serializers.ts`.
- **Always** add both `en` and `ar` keys when adding a UI string. The two files
  must have the same **base** keys; `ar.json` additionally carries the Arabic
  plural suffixes (`_zero`, `_one`, `_two`, `_few`, `_many`, `_other`) wherever
  a key uses `count`.
- **Always** run `bun run db:indexes` (or restart with `DB_SYNC_INDEXES=1`)
  after adding an index; several are constraints the code relies on.
- **Always** run `bun run check` (typecheck, lint, test) and `bun run build`
  before committing.
- **Always** update this file when adding models, routes, or changing
  architecture.

### Database Rules

- MongoDB 7+; **a replica set is required** for transactions (the game-finish
  path). `supportsTransactions()` degrades to sequential writes on standalone,
  but the guards still prevent double-application.
- Schema changes are code changes in `server/src/models/`; there is no migration
  runner. Adding an index means updating the model and syncing indexes.
- Documents are camelCase; the wire format is snake_case via serializers.

### API Design Standards

- All routes under `/api/`; proper status codes (200, 201, 400, 401, 403, 404,
  409, 422, 429, 503). Unknown `/api/*` paths return a JSON 404.
- Errors are `{ "error": "message" }`, with `details` for validation and `code`
  for machine-readable cases. 4xx errors raised by middleware get a generic
  message; nothing internal reaches the client.
- `?lang=en|ar` for bilingual content; `?page=` / `?per_page=` for lists.
- Bilingual fields follow `fieldEn` / `fieldAr` (`field_en` / `field_ar` on the
  wire).

---

## Testing

`bun run test` — 218 tests in 12 files, ~35s, against a real MongoDB
(`chess_hub_test`).

- `server/bunfig.toml` preloads `tests/setup.ts`, which force-sets the test
  environment (database name, `BCRYPT_ROUNDS=10`, …) before any module loads.
  The helpers refuse a database whose name does not end in `_test`.
- **Unit:** chess (incl. perft against six reference positions, PGN documents),
  clock, Elo, password, sanitisers.
- **Feature:** auth and role separation, account (reset, revoke, delete,
  avatar), CMS and uploads, games and concurrency, matchmaking (quick pairing,
  direct challenges, rematch, first-move timeout, sweeper), Socket.IO delivery,
  social and moderation.
- `tests/helpers/app.ts` provides `request()`, `resetDatabase()`, `makeUser()`,
  `makeAdmin()`, `auth(token)`, `sleep()`. It syncs indexes before the first
  assertion because several are constraints under test.
- Mongoose ignores writes to immutable fields such as `createdAt`; to backdate
  in a test, write through `Model.collection.updateOne`.
- Perft is not ceremony: move legality is the entire security model of a chess
  server, so it is verified here rather than trusted to the dependency.
