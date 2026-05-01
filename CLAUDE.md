# CLAUDE.md — Chess Platform Project Context

> **Living Document Rule:** This file must be updated whenever there is a structural change to the project — new models, new API routes, new features, changed architecture, or any modification that would affect how another developer (or AI) understands the codebase. Treat this as the single source of truth for project context.

## Project Overview
A bilingual (English / Arabic) chess players & news CMS **plus** a multiplayer online chess platform built with **Flask** (backend API) and **React + Vite** (frontend SPA). Registered users can play live ranked games against each other; admins curate the players/news catalogue. The frontend is built to static files and served by Flask in production.

---

## Tech Stack

| Layer     | Technology                   |
|-----------|------------------------------|
| Backend   | Python 3, Flask 3.1          |
| Database  | MySQL 8+ via PyMySQL         |
| ORM       | Flask-SQLAlchemy + Flask-Migrate (Alembic) |
| Auth      | Flask-JWT-Extended (JWT bearer tokens, dual-role) |
| Chess     | python-chess 1.11 (server-authoritative move validation) |
| Email     | Brevo (Sendinblue) transactional API |
| Security  | Flask-Limiter (rate limiting), Flask-Talisman (security headers) |
| Frontend  | React 19, Vite, React Router |
| Chess UI  | react-chessboard, chess.js (client-side preview only) |
| Carousel  | Swiper                       |
| Animation | framer-motion                |
| i18n      | react-i18next (en/ar locales) |
| Styling   | Tailwind CSS 4, custom dark design system |

---

## Directory Structure

```
├── config.py           # App configuration (reads .env)
├── run.py              # Entry point — builds frontend, starts Flask
├── seed.py             # DB seeding script (admin + sample data)
├── start.sh            # Quick-start script (activates venv, runs app)
├── .env                # Local env vars (NOT committed — see .env.example)
├── .env.example        # Template for required env vars
├── requirements.txt    # Python dependencies
│
├── app/
│   ├── __init__.py     # Flask app factory (create_app)
│   ├── models.py       # SQLAlchemy models: Admin, Player, News, SiteString, User, LinkRequest, Game
│   ├── services/
│   │   ├── email.py    # Brevo wrapper + bilingual OTP email templates
│   │   ├── otp.py      # OTP generation, expiry, resend cooldown
│   │   └── elo.py      # K-factor + Elo rating calculation
│   └── routes/
│       ├── auth.py     # Admin auth: POST /api/auth/login, /setup, GET /me
│       ├── user_auth.py    # User auth: register, OTP verify/resend, login, /me, PATCH /me
│       ├── players.py  # CRUD /api/players (+ /homepage)
│       ├── news.py     # CRUD /api/news
│       ├── upload.py   # POST /api/upload/image
│       ├── site_strings.py  # /api/strings (i18n overrides)
│       ├── games.py    # Online chess: lobby, challenges, moves, draws, leaderboard
│       └── links.py    # Player-profile linking (user requests + admin approval)
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx, main.jsx
│   │   ├── api.js           # Axios instance → /api/*
│   │   ├── components/      # Reusable UI components
│   │   ├── context/         # AuthContext, LanguageContext
│   │   ├── layouts/         # AdminLayout, PublicLayout
│   │   ├── locales/         # en.json, ar.json
│   │   └── pages/           # admin/ and public/ page components
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── uploads/            # User-uploaded images (gitignored except .gitkeep)
```

---

## Environment Variables (.env)

| Variable               | Purpose                                      | Example                                          |
|------------------------|----------------------------------------------|--------------------------------------------------|
| `DATABASE_URL`         | MySQL connection string                      | `mysql+pymysql://root@localhost:3306/chess_db`   |
| `SECRET_KEY`           | Flask secret key                             | random string                                    |
| `JWT_SECRET_KEY`       | JWT signing key                              | random string                                    |
| `RATELIMIT_DEFAULT`    | Global rate limit (optional)                 | `200 per minute`                                 |
| `RATELIMIT_STORAGE_URI`| Rate limit backend (optional)                | `memory://` or `redis://localhost:6379`           |
| `BREVO_API_KEY`        | Brevo transactional email API key            | xkeysib-… (leave empty in dev to console-print)   |
| `BREVO_FROM_EMAIL`     | Sender email for OTP messages                | `no-reply@chesshub.local`                         |
| `BREVO_FROM_NAME`      | Sender display name                          | `Chess Hub`                                       |
| `FLASK_ENV`            | Set to `production` to enable secure cookies | `production`                                     |

---

## How to Run Locally

```bash
# 1. Start MySQL (macOS)
brew services start mysql

# 2. Create the database
mysql -u root -e "CREATE DATABASE IF NOT EXISTS chess_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 3. Set up Python env
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 4. Configure .env (copy .env.example and adjust)
cp .env.example .env

# 5. Seed the database
python3 seed.py

# 6. Run the app (builds frontend + starts Flask on :8080)
python3 run.py
```

Or simply: `./start.sh` (requires venv to already be set up).

---

## Security Measures in Place

1. **Rate Limiting** (Flask-Limiter)
   - Global: 200 requests/min per IP
   - Login: 10 requests/min (brute-force protection)
   - Setup: 5 requests/hour
   - Upload: 30 requests/min
2. **Security Headers** (Flask-Talisman)
   - Strict-Transport-Security (HSTS)
   - X-Content-Type-Options: nosniff
   - X-Frame-Options: DENY
   - Content-Security-Policy (customisable)
3. **JWT Authentication** — all admin routes require valid bearer tokens
4. **File Upload Validation** — whitelist of allowed extensions, 5 MB max size, UUID filenames
5. **SQL Injection Protection** — all queries use SQLAlchemy ORM (parameterised)
6. **CORS** — configured on `/api/*` routes only
7. **Secure Cookies** — HTTPOnly, SameSite=Lax; Secure flag in production
8. **MySQL Connection Pooling** — pool_pre_ping and pool_recycle to handle stale connections

---

## Guardrails & Safety Rules

> **Follow these rules strictly when modifying the project.**

### DO NOT
- **Never** commit `.env` files or secrets to git
- **Never** use raw SQL queries — always use SQLAlchemy ORM
- **Never** disable rate limiting or security headers without explicit approval
- **Never** allow `*` CORS origins in production — restrict to your actual domain
- **Never** store passwords in plain text — always use `werkzeug.security` hashing
- **Never** trust user input — validate and sanitise at the API boundary
- **Never** serve user-uploaded files without filename sanitisation (already using `secure_filename` + UUID)
- **Never** expose stack traces or internal errors to the client in production

### DO
- **Always** use Flask-Migrate (`flask db migrate` / `flask db upgrade`) for schema changes
- **Always** add rate limits to new endpoints that accept user input
- **Always** require `@jwt_required()` on admin-only endpoints
- **Always** validate uploaded file types against the whitelist
- **Always** use parameterised queries via ORM
- **Always** test both English and Arabic content when modifying i18n
- **Always** run `python3 seed.py` after fresh database creation
- **Always** build the frontend (`npm run build` in /frontend) before deploying
- **Always** update `CLAUDE.md` when adding/removing models, API routes, features, or making architectural changes

### Database Rules
- The database is **MySQL 8+** with `utf8mb4` charset
- Use `db.Text` for long content fields (not `db.String`)
- Add `mysql_charset` and `mysql_collate` table args for tables with Arabic text
- When adding migrations: `flask db migrate -m "description"` then `flask db upgrade`

### API Design Standards
- All API routes are under `/api/`
- Use proper HTTP status codes (200, 201, 400, 401, 404)
- Return JSON with `error` key for errors
- Support `?lang=en|ar` query param for bilingual content
- Paginate list endpoints with `?page=` and `?per_page=`

---

## Models Quick Reference

| Model       | Key Fields                                      |
|-------------|--------------------------------------------------|
| Admin       | username, email, password_hash                   |
| Player      | name_en, name_ar, bio_en, bio_ar, country, rating, title, image_url, date_of_birth, **is_player_of_month**, **is_tournament_winner** |
| News        | title_en, title_ar, content_en, content_ar, region, image_url, published, **is_featured**, player_id |
| SiteString  | key, lang, value (unique on key+lang)            |
| User        | username, email, password_hash, display_name, avatar_url, country, **is_verified**, otp_code, otp_expires_at, otp_attempts, **online_rating** (default 1200), games_played/won/lost/drawn, **linked_player_id** (FK→players, admin-only mutation), **is_banned**, **banned_at**, **ban_reason**, **chat_muted**, **notif_email**, **notif_dm**, **notif_game_chat**, **notif_sound** |
| LinkRequest | user_id, player_id, message, status (pending/approved/rejected), admin_note, reviewed_by_admin_id, reviewed_at |
| Game        | white_user_id, black_user_id, creator_user_id, creator_color, status (open/active/white_wins/black_wins/draw/aborted), result, **fen** (server-authoritative), pgn, move_count, time_control_seconds, **increment_seconds** (Fischer), white/black_time_remaining, rated, white/black_rating_before/after, draw_offer_by, started_at, last_move_at, ended_at, **min_opp_rating**, **max_opp_rating**, **chat_disabled**, **voided_by_admin_id**, **void_reason** |
| GameMessage | game_id, user_id, content (≤500 chars, URLs stripped), is_deleted, deleted_by_admin_id |
| DirectMessage | sender_id, recipient_id, content (≤2000), is_read, is_deleted, deleted_by_admin_id |
| BlockedUser | blocker_id, blocked_id (unique pair) |

---

## Authentication & Authorization (CRITICAL)

The platform has **two distinct identity types** sharing one JWT system:

| Identity | Login endpoint              | JWT claim     | localStorage key | Backend guard                              |
|----------|------------------------------|---------------|-------------------|---------------------------------------------|
| Admin    | `POST /api/auth/login`       | (no `role`)   | `token`           | `@jwt_required()` + reject `role=="user"`    |
| User     | `POST /api/users/auth/login` | `role="user"` | `user_token`      | `@user_required` (must be verified)          |

- Admin tokens carry **no role claim** (legacy compatibility); user tokens carry `additional_claims={"role": "user"}`.
- `app/routes/user_auth.py::current_user()` returns `None` if `role != "user"` — prevents admin tokens from acting as users.
- `_admin_required` (in `links.py`, etc.) rejects requests where `get_jwt().get("role") == "user"`.
- Frontend `api.js` request interceptor inspects URL prefix and attaches the correct token: `/users/`, `/games`, `/links/request`, `/links/my-requests` use the **user** token; everything else uses the **admin** token. Auto-redirect on 401 only fires for `/admin/*` routes.

## Online Chess Platform

- **Server-authoritative**: every move is validated by `python-chess`. The client previews legality with `chess.js` but the server's `Game.fen` is the source of truth.
- **Polling, not WebSockets**: clients GET `/api/games/<id>` every ~1.5s; the response carries `version = move_count*2 + (1 if ended else 0)` so clients can cheaply detect changes. Chat polls every 2.5s.
- **Elo system** (separate from `Player.rating`): default 1200, K-factor 40 while provisional (<10 games), 20 normal, 10 if rating ≥ 2400. Rating snapshots stored on every finished game.
- **Time controls** are server-authoritative budgets per side + Fischer `increment_seconds`. On every move the server subtracts `(now - last_move_at)` from the mover's clock and adds the increment. `_enforce_clocks` is called lazily on every game GET and move attempt — flags loss-on-time. Clients can call `POST /<id>/claim-time` to force the check.
- **Outcome detection** uses `board.outcome(claim_draw=True)` so threefold/50-move draws are detected.
- **Spectator mode**: anyone (logged-in or not) can GET `/api/games/<id>` and `/api/games/live`; only the two participants can move/resign/offer draw/chat. The `/play/:id` route is public — spectators see the board but get a "Spectating" badge in the sidebar.
- **In-game chat**: messages limited to 500 chars; URLs are auto-stripped server-side (`_URL_RE`) to prevent off-platform contact/scams. Users can mute notifications client-side (localStorage `mute_game_chat`). Admins can globally `chat_muted` a user or `chat_disabled` a single game. Spectators see chat read-only.
- **Direct messages**: ≤2000 chars, URLs preserved (DMs not chat). Users can block (`BlockedUser`) — blocking prevents both DMs and game-accept across the pair. `notif_dm=False` blocks incoming DMs. `chat_muted` blocks outgoing.
- **Lobby filters**: `rated`, `color`, `min_tc`, `max_tc`, `viewer_rating` (auto-hides challenges whose `min_opp_rating`/`max_opp_rating` exclude the viewer). Challenge creators set their accepted rating range when posting.
- **Voiding games**: admin can void a finished game with a reason; the Elo deltas and game-count stats are reverted on both players.

## Player-Profile Linking (SECURITY-CRITICAL)

Users can request to link their account to an existing `Player` row, but **never modify FIDE-side data**:

- The link is one-way: `User.linked_player_id` references `Player.id`.
- The Player row is **read-only from the user's perspective** — there is no API surface that lets a user mutate a Player by virtue of being linked. Only `@jwt_required` admin endpoints in `players.py` can edit players.
- The link is set **only** by an admin approving a `LinkRequest` (route `POST /api/links/admin/requests/<id>/approve`). Direct mutation of `linked_player_id` by a user is impossible — there is no endpoint that accepts it.
- Approval also enforces uniqueness: a Player can be linked to at most one User; if another user is already linked, approval returns 409.
- An admin can break a link via `POST /api/links/admin/users/<id>/unlink`.

## API Routes Summary

**Public (no auth):**
- `GET /api/players`, `GET /api/players/<id>`, `GET /api/players/homepage`
- `GET /api/news`, `GET /api/news/<id>`
- `GET /api/strings`
- `GET /api/games/lobby` (filters: `rated`, `color`, `min_tc`, `max_tc`, `viewer_rating`)
- `GET /api/games/recent`, `GET /api/games/leaderboard`, `GET /api/games/<id>`
- `GET /api/games/live` (active games for spectators; filters: `min_rating`, `max_rating`)
- `GET /api/games/<id>/chat` (read-only for spectators)

**User (requires verified user JWT):**
- `POST /api/users/auth/register` (rate 5/min;30/hr)
- `POST /api/users/auth/verify-otp` (10/min)
- `POST /api/users/auth/resend-otp` (3/min;10/hr)
- `POST /api/users/auth/login` (10/min)
- `GET /api/users/auth/me`, `PATCH /api/users/auth/me` (also notif prefs: notif_email, notif_dm, notif_game_chat, notif_sound)
- `POST /api/games` (create, body: `color`, `time_control_seconds`, `increment_seconds`, `rated`, `min_opp_rating`, `max_opp_rating`)
- `POST /api/games/<id>/cancel`, `/accept`, `/move`, `/resign`, `/draw-offer`, `/draw-accept`, `/draw-decline`, `/claim-time`
- `POST /api/games/<id>/chat` (20/min, ≤500 chars, URLs auto-stripped, blocked when chat_muted or chat_disabled)
- `GET /api/games/me/games?status=active|finished|all`
- `GET /api/messages/threads`, `GET /api/messages/with/<user_id>`, `POST /api/messages/with/<user_id>`
- `GET /api/messages/unread-count`
- `GET /api/messages/blocks`, `POST /api/messages/blocks/<user_id>`, `DELETE /api/messages/blocks/<user_id>`
- `POST /api/links/request` (5/hr), `GET /api/links/my-requests`

**Admin (requires admin JWT):**
- `POST /api/auth/setup`, `POST /api/auth/login`, `GET /api/auth/me`
- `POST/PUT/DELETE /api/players`, `POST/PUT/DELETE /api/news`
- `POST /api/upload/image`
- CRUD `/api/strings`
- `GET /api/links/admin/requests`, `POST /api/links/admin/requests/<id>/approve|reject`
- `POST /api/links/admin/users/<id>/unlink`
- `GET /api/links/admin/users?status=all|active|banned|unverified&search=&page=&per_page=`
- `POST /api/links/admin/users/<id>/ban|unban|verify`
- `POST /api/links/admin/users/<id>/mute|unmute` (chat-mute toggle)
- `GET /api/games/admin/games?status=open|active|finished|voided&search=&page=`
- `POST /api/games/admin/games/<id>/abort` (aborts active game, no rating change)
- `POST /api/games/admin/games/<id>/void` (reverts Elo + stats; body `{reason}`)
- `POST /api/games/admin/games/<id>/chat-toggle`
- `GET /api/games/admin/messages` (game-chat moderation, paginated, filterable)
- `DELETE /api/games/admin/messages/<id>`
- `GET /api/messages/admin/dms` (DM moderation), `DELETE /api/messages/admin/dms/<id>`

---

## Homepage Features

The public homepage has several dynamic sections managed via the admin panel:

| Feature | How It Works |
|---------|-------------|
| **Featured News** | One news article with `is_featured=True` appears as the large spotlight card. Only one at a time (toggling auto-unsets the previous). Falls back to the latest news if none is marked. |
| **Player of the Month** | One player with `is_player_of_month=True` is shown in a gold card. Set via the player edit form. Only one at a time. |
| **Tournament Winner** | One player with `is_tournament_winner=True` is shown in a blue card. Set via the player edit form. Only one at a time. |

**API Endpoint:** `GET /api/players/homepage?lang=en` returns `{ player_of_month, tournament_winner }` for the homepage cards.
