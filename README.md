# Chess Hub

A bilingual (English / Arabic) chess players & news CMS **and** a real-time
multiplayer chess platform. Registered players challenge each other and play
live ranked games with server-validated moves and server-authoritative clocks;
admins curate the player and news catalogue and moderate the community.

> **العربية:** [README.ar.md](README.ar.md)

---

## Contents

- [Stack](#stack)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Project layout](#project-layout)
- [How it works](#how-it-works)
- [Environment variables](#environment-variables)
- [Commands](#commands)
- [API](#api)
- [Testing](#testing)
- [Security](#security)
- [Deployment](#deployment)

---

## Stack

| Layer      | Technology                                                   |
|------------|--------------------------------------------------------------|
| Runtime    | Node.js 20.11+ (ESM), TypeScript 5.9 in strict mode           |
| API        | Express 5                                                     |
| Real-time  | Socket.IO 4                                                   |
| Database   | MongoDB 7+ via Mongoose 9                                     |
| Auth       | JWT bearer tokens (`jsonwebtoken`), bcrypt password hashing   |
| Validation | Zod 4 at every request boundary                               |
| Chess      | `chess.js` server-side, verified in-repo with perft           |
| Images     | `sharp` — uploads are decoded and re-encoded before storage   |
| Email      | Brevo transactional API (console fallback in development)     |
| Logging    | Pino (pretty in dev, structured JSON in production)           |
| Frontend   | React 19, Vite 8, React Router 7                              |
| Chess UI   | `react-chessboard` 5                                          |
| i18n       | `react-i18next` with admin-editable string overrides          |
| Styling    | Tailwind CSS 4, custom dark design system, full RTL support   |
| Tests      | Vitest + Supertest                                            |

---

## Quick start

**Prerequisites:** Node.js 20.11+, npm 10+, and MongoDB 7+ (`mongod` and
`mongosh` on your `PATH`). On macOS: `brew tap mongodb/brew && brew install mongodb-community`.

```bash
git clone https://github.com/HamzaAshour949/chess.git
cd chess
npm install
cp .env.example .env
```

Generate a signing secret and put it in `.env` as `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Start MongoDB, seed the database, and run the app:

```bash
npm run db:start && npm run db:seed && npm run dev
```

- SPA (Vite dev server, hot reload): <http://localhost:3000>
- API + WebSocket: <http://localhost:8080>

The Vite dev server proxies `/api`, `/uploads` and `/socket.io` to port 8080,
so use **<http://localhost:3000>** while developing.

To run the way production does — one process serving the built SPA, the API and
the WebSocket on a single port:

```bash
npm run build && npm start   # http://localhost:8080
```

### About the database script

`npm run db:start` runs [`scripts/mongo-dev.sh`](scripts/mongo-dev.sh), which
starts `mongod` against a project-local `.mongo-data/` directory as a
**single-node replica set**. The replica set is not decoration: MongoDB only
offers multi-document transactions on one, and finishing a game has to update
two player ratings and the game record as a single unit.

`npm run db:stop` stops it, `npm run db:status` reports on it. If you would
rather use Docker:

```bash
docker run -d --name chess-mongo -p 27017:27017 mongo:8 --replSet rs0
docker exec chess-mongo mongosh --quiet --eval "rs.initiate()"
```

---

## Demo accounts

Created by `npm run db:seed` and printed each time it runs.

| Role   | Username | Password          | Where                                          |
|--------|----------|-------------------|------------------------------------------------|
| Admin  | `admin`  | `Admin!2026Chess` | <http://localhost:8080/admin/login>            |
| Player | `magnus` | `ChessHub!2026`   | <http://localhost:8080/login>                  |
| Player | `hikaru` | `ChessHub!2026`   | <http://localhost:8080/login>                  |

Both demo players are pre-verified, so they sign in without an email round-trip.

> **These credentials are in this repository.** Change them before the app is
> reachable by anyone else.

To play a real game against yourself, sign in as `magnus` in a normal window
and as `hikaru` in a private window — the two share `localStorage` otherwise.
Post a challenge from one, accept it from the other, and moves appear on both
boards immediately.

---

## Project layout

```
.
├── server/                     Express + TypeScript API and WebSocket server
│   ├── src/
│   │   ├── index.ts            Entry point: HTTP server + Socket.IO + shutdown
│   │   ├── app.ts              Express app: helmet, CORS, static SPA, errors
│   │   ├── config/env.ts       Zod-validated environment, fails fast at boot
│   │   ├── db/
│   │   │   ├── mongoose.ts     Connection and transaction capability probe
│   │   │   ├── seed.ts         Catalogue + demo accounts (idempotent)
│   │   │   ├── sync-indexes.ts Explicit index creation
│   │   │   └── repair-games.ts Rebuild derived game caches from move lists
│   │   ├── lib/                chess, elo, otp, email, jwt, sanitize, serializers
│   │   ├── middleware/         auth guards, rate limits, error handler
│   │   ├── models/             Ten Mongoose models
│   │   ├── realtime/           Socket.IO server and the publish seam
│   │   ├── routes/             One module per API area
│   │   └── services/           game-service: clocks, results, ratings
│   └── tests/                  Unit + feature suites
│
├── frontend/                   React 19 SPA
│   └── src/
│       ├── api.js              Axios client; picks the right identity's token
│       ├── realtime.js         Shared Socket.IO connection
│       ├── hooks/useLive.js    Live game, chat, lobby and clock hooks
│       ├── context/            Admin auth, player auth, language
│       ├── layouts/            Public and admin shells
│       ├── locales/            en.json / ar.json (284 keys each)
│       └── pages/              public/ and admin/ screens
│
├── scripts/mongo-dev.sh        Local MongoDB replica set helper
└── uploads/                    Uploaded images (git-ignored)
```

---

## How it works

### Two identities, deliberately separate

`admins` and `users` are different collections. An admin is not a player with a
flag set, and no route promotes one to the other.

| Identity | Login endpoint               | Token role | `localStorage` key | Guard          |
|----------|------------------------------|------------|--------------------|----------------|
| Admin    | `POST /api/auth/login`       | `admin`    | `token`            | `requireAdmin` |
| Player   | `POST /api/users/auth/login` | `user`     | `user_token`       | `requireUser`  |

The role is a **signed claim and the token's audience**, so a token minted for
one side is rejected outright as the other. Both guards re-read the account on
every request rather than trusting the token, so a ban, mute or deletion takes
effect immediately instead of whenever the token happens to expire.

### The move list is the source of truth

A game stores `moves` — a space-separated UCI list. `fen`, `pgn` and `moveCount`
are **caches derived from it** and rewritten on every move. Every move request
replays the list from the starting position and validates against the result.

Two things fall out of this:

1. **Threefold repetition is detectable.** A FEN carries no history, so an
   engine loaded from one cannot see a repetition. A replayed game can.
2. **A tampered or stale cache cannot make an illegal position stand.** There is
   a test that rewrites a game's stored FEN to a winning position; the next move
   simply overwrites it from the move list.

`npm run db:repair` rebuilds the caches for every game if they ever drift.

### Concurrency

Every state transition is a **guarded conditional update**, so two racing
requests cannot both win:

- a move updates only if `version` is unchanged since it was read;
- accepting a challenge updates only while the game is still `open`;
- finishing updates only while `active`, and the rating write is additionally
  guarded on `ratingsApplied`, so a retry cannot double-count a result.

All three have tests that fire the requests simultaneously.

### Clocks

Time budgets are stored in **milliseconds** and are server-authoritative. On
each move the server subtracts the elapsed time and adds the Fischer increment;
milliseconds avoid the rounding drift a whole-second budget accumulates in the
mover's favour across a long game.

A flag check runs lazily on every game read and every move attempt, so an
abandoned game resolves as soon as anyone looks at it. Running out of time
against an opponent who cannot possibly mate (a bare king, or king and one minor
piece) is scored a **draw**, per FIDE.

Responses carry `server_time`, letting clients correct for their own clock skew
rather than assuming the two machines agree.

### Real-time

Socket.IO rooms: one per game (`game:<id>`), one for the lobby, and one per
player for direct messages and account notices. Clients subscribe to the boards
they are watching, so an idle game costs nothing.

The REST API stays complete and authoritative. Every live view also polls — at
30 seconds while the socket is connected, at 2 seconds while it is not — so a
client behind a proxy that blocks WebSockets still works.

### Elo

Separate from the editorial `Player.rating`. New accounts start at 1200.
K-factor is 40 while provisional (fewer than 10 games), 20 once established, and
10 at 2400+. Every finished game stores both players' before and after ratings,
and voiding a game reverses the exact deltas it applied.

### Player-profile linking (security-critical)

A player may request to be associated with an editorial `Player` profile. The
link is one-way and confers **identity only**:

- only an admin approving a `LinkRequest` ever sets `User.linkedPlayerId`;
- there is no endpoint through which a player can set it;
- being linked grants **no write access** to the profile — there is a test that
  signs in as a linked player, tries to edit that profile, and is refused;
- a unique partial index guarantees one profile can never back two accounts.

### Bilingual content

Content rows carry `_en` and `_ar` fields. `?lang=en|ar` selects which one fills
the `name` / `title` / `content` field, while both variants stay present for the
admin forms. News additionally has a `region` of `en`, `ar` or `both`, choosing
which language edition it appears in.

The SPA ships static `en.json` / `ar.json` bundles and layers admin-editable
overrides from `GET /api/strings` on top. Arabic switches the document to RTL.

---

## Environment variables

Copy `.env.example` to `.env`. Everything is validated at boot — a missing or
malformed value stops the process with a message naming the field.

| Variable | Purpose | Default |
|---|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` | `development` |
| `PORT` | HTTP + WebSocket port | `8080` |
| `APP_URL` | Public origin, used in emails | `http://localhost:8080` |
| `MONGODB_URI` | Connection string | `mongodb://127.0.0.1:27017/chess_hub?replicaSet=rs0` |
| `JWT_SECRET` | Token signing key — **required**, min 32 chars | — |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `BCRYPT_ROUNDS` | Password hashing cost (10–15) | `12` |
| `CORS_ORIGINS` | Comma-separated allow-list; empty means same-origin only | `http://localhost:3000` |
| `RATE_LIMIT_WINDOW_MS` | Global limiter window | `60000` |
| `RATE_LIMIT_MAX` | Global requests per window per IP | `300` |
| `TRUST_PROXY` | `1` only behind a reverse proxy — see [Security](#security) | `0` |
| `UPLOAD_DIR` | Where images are written | `uploads` |
| `UPLOAD_MAX_BYTES` | Maximum upload size | `5242880` |
| `DEFAULT_RATING` | Starting Elo | `1200` |
| `PROVISIONAL_GAMES` | Games below which the provisional K-factor applies | `10` |
| `BREVO_API_KEY` | Transactional email key; empty logs OTPs to the console | *(empty)* |
| `BREVO_FROM_EMAIL` / `BREVO_FROM_NAME` | Sender identity | `no-reply@chesshub.local` / `Chess Hub` |
| `LOG_LEVEL` | Pino level | `info` |

---

## Commands

Run from the repository root.

| Command | What it does |
|---|---|
| `npm run dev` | API (watch) and Vite dev server together |
| `npm run dev:api` / `npm run dev:web` | Just one of them |
| `npm run build` | Build the SPA, then compile the server |
| `npm start` | Run the compiled server, serving the built SPA |
| `npm test` | Full Vitest suite |
| `npm run typecheck` | `tsc --noEmit` over the server |
| `npm run lint` | ESLint over both workspaces |
| `npm run format` | Prettier |
| `npm run db:start` / `db:stop` / `db:status` | Local MongoDB replica set |
| `npm run db:seed` | Seed the catalogue and demo accounts (idempotent) |
| `npm run db:seed -w @chess-hub/server -- --fresh` | Wipe first, then seed |
| `npm run db:indexes` | Create/update every declared index |
| `npm run db:repair` | Rebuild derived game caches from move lists |

---

## API

73 routes. All are under `/api`, return JSON, and report failures as
`{ "error": "message" }` — with a `details` array for validation errors and a
`code` for cases the SPA branches on (`email_unverified`, `account_banned`).

Lists accept `?page=` and `?per_page=`; bilingual reads accept `?lang=en|ar`.

### Public

```
GET    /api/health
GET    /api/players                 ?lang &page &per_page &search
GET    /api/players/:id             ?lang
GET    /api/players/homepage        ?lang
GET    /api/news                    ?lang &page &per_page &player_id
GET    /api/news/:id                ?lang
GET    /api/strings                 ?lang
GET    /api/games/lobby             ?rated &color &min_tc &max_tc &viewer_rating
GET    /api/games/live              ?min_rating &max_rating
GET    /api/games/recent
GET    /api/games/leaderboard
GET    /api/games/:id
GET    /api/games/:id/chat
POST   /api/auth/login
POST   /api/auth/setup              (only while no admin exists)
POST   /api/users/auth/register     (5/min, 10/hr)
POST   /api/users/auth/verify-otp   (15 per 15 min)
POST   /api/users/auth/resend-otp   (6/hr)
POST   /api/users/auth/login        (10 per 15 min)
```

### Player token required

```
GET    /api/users/auth/me
PATCH  /api/users/auth/me           display_name, country, avatar_url, notif_*
POST   /api/games                   color, rated, time_control_seconds,
                                    increment_seconds, min/max_opp_rating
POST   /api/games/:id/accept | cancel | move | resign
POST   /api/games/:id/draw-offer | draw-accept | draw-decline | claim-time
GET    /api/games/me/games          ?status=active|finished|all
POST   /api/games/:id/chat          (20/min, ≤500 chars, URLs stripped)
GET    /api/messages/threads
GET    /api/messages/unread-count
GET    /api/messages/with/:userId
POST   /api/messages/with/:userId   (30/min, ≤2000 chars, links kept)
GET    /api/messages/blocks
POST   /api/messages/blocks/:userId
DELETE /api/messages/blocks/:userId
POST   /api/links/request           (5/hr)
GET    /api/links/my-requests
```

### Admin token required

```
GET    /api/auth/me
POST   /api/players                 PUT/DELETE /api/players/:id
GET    /api/news/admin              POST /api/news, PUT/DELETE /api/news/:id
GET    /api/strings/all             POST /api/strings
PUT    /api/strings/bulk            DELETE /api/strings/:key
POST   /api/upload/image            (30/min, ≤5 MB, re-encoded)
GET    /api/games/admin/stats
GET    /api/games/admin/games       ?status &search &page
POST   /api/games/admin/games/:id/abort | void | chat-toggle
GET    /api/games/admin/messages    DELETE /api/games/admin/messages/:id
GET    /api/messages/admin/dms      DELETE /api/messages/admin/dms/:id
GET    /api/links/admin/requests
POST   /api/links/admin/requests/:id/approve | reject
GET    /api/links/admin/users       ?status &search &page
POST   /api/links/admin/users/:id/ban | unban | verify | mute | unmute | unlink
```

### WebSocket

Connect to the same origin, path `/socket.io`, with the player token in
`auth.token`. Anonymous connections are allowed — spectating is public.

| Direction | Event | Payload |
|---|---|---|
| → | `game:watch` / `game:unwatch` | game id |
| → | `lobby:watch` / `lobby:unwatch` | — |
| ← | `game:update` | full game, plus `last_move` after a move |
| ← | `game:chat` | one message |
| ← | `lobby:update` | a challenge that was created, cancelled or accepted |
| ← | `dm:new` | one direct message |
| ← | `link:reviewed`, `account:banned` | account notices |

---

## Testing

```bash
npm test
```

160 tests: 8 files, roughly 26 seconds. Feature tests run against a real
MongoDB (`chess_hub_test`, never your development data) and clear collections
between files.

Move generation is verified with **perft** against the six reference positions
from the Chess Programming Wiki. A single missing or spurious move anywhere in
those trees changes the node counts, so this proves the legality rules the whole
security model rests on, rather than taking them on trust from the dependency.

The suite also covers the things that are easy to get wrong and hard to notice:
simultaneous moves, simultaneous challenge accepts, double resignation, flag
falls, threefold repetition, rating reversal on void, and the boundaries between
admin, player and anonymous access.

---

## Security

1. **Two separate identities.** Role is a signed claim *and* the token audience;
   accounts are re-read on every request so moderation is immediate.
2. **Passwords** hashed with bcrypt (cost 12). Failed logins still run a
   comparison against a dummy hash, so a missing account does not return
   measurably faster and become a username oracle.
3. **OTP codes stored hashed**, never in plaintext, with attempt limits, expiry
   and a resend cooldown. Verification and resend give the same answer whether
   or not the address exists.
4. **Every input validated with Zod** at the boundary; user text is escaped
   before it becomes a regex, so a crafted `?search=` cannot inject a pattern.
5. **Uploads decoded and re-encoded with sharp.** Extensions are never trusted,
   filenames are UUIDs, EXIF is stripped, and oversized images are downscaled.
   There is a test that uploads a PHP web shell renamed to `.png`.
6. **Rate limits** on every endpoint that accepts input, tightest on credentials.
7. **CSP and security headers** via helmet; HSTS in production.
8. **CORS is an allow-list** defaulting to same-origin only. A wildcard is never
   accepted.
9. **`TRUST_PROXY` is opt-in.** Trusting `X-Forwarded-For` blindly lets any
   client spoof its IP and walk past every rate limit — enable it only when a
   reverse proxy in front of the app actually sets that header.
10. **Chat links stripped** in-game to blunt off-platform scams, and blocking
    hides the conversation in both directions.
11. **Secrets are never committed.** `.env` is git-ignored; `.env.example`
    documents the shape.

### Before going live

- Set a fresh `JWT_SECRET`, and change the seeded passwords.
- Set `NODE_ENV=production` and a real `APP_URL`.
- Set `CORS_ORIGINS` to your domain, or leave it empty if the app serves the SPA.
- Set `TRUST_PROXY=1` **only** behind a proxy you control.
- Enable MongoDB authentication and point `MONGODB_URI` at a credentialed user.
- Set `BREVO_API_KEY` so verification emails actually send.
- Serve over HTTPS.

---

## Deployment

```bash
npm ci
npm run build          # SPA to frontend/dist, server to server/dist
npm run db:indexes     # several indexes are constraints, not optimisations
npm start
```

One process serves the API, the WebSocket and the built SPA on `PORT`. Behind a
reverse proxy, forward the WebSocket upgrade for `/socket.io` and set
`TRUST_PROXY=1`.

`GET /api/health` is a liveness probe. `SIGTERM` and `SIGINT` shut down cleanly,
closing sockets and the database connection, with a 10-second hard timeout.

**Scaling past one instance** needs two changes: the rate limiter is in-process
memory, so move it to a shared store; and Socket.IO needs an adapter (Redis) so
a push from one instance reaches clients connected to another.

---

## License

MIT.
