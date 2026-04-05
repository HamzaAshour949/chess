# CLAUDE.md — Chess Platform Project Context

> **Living Document Rule:** This file must be updated whenever there is a structural change to the project — new models, new API routes, new features, changed architecture, or any modification that would affect how another developer (or AI) understands the codebase. Treat this as the single source of truth for project context.

## Project Overview
A bilingual (English / Arabic) chess players & news CMS built with **Flask** (backend API) and **React + Vite** (frontend SPA). The frontend is built to static files and served by Flask in production.

---

## Tech Stack

| Layer     | Technology                   |
|-----------|------------------------------|
| Backend   | Python 3, Flask 3.1          |
| Database  | MySQL 8+ via PyMySQL         |
| ORM       | Flask-SQLAlchemy + Flask-Migrate (Alembic) |
| Auth      | Flask-JWT-Extended (JWT bearer tokens) |
| Security  | Flask-Limiter (rate limiting), Flask-Talisman (security headers) |
| Frontend  | React 18, Vite, React Router |
| i18n      | react-i18next (en/ar locales) |
| Styling   | Tailwind CSS                 |

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
│   ├── models.py       # SQLAlchemy models: Admin, Player, News, SiteString
│   └── routes/
│       ├── auth.py     # POST /api/auth/login, /setup, GET /me
│       ├── players.py  # CRUD /api/players
│       ├── news.py     # CRUD /api/news
│       ├── upload.py   # POST /api/upload/image
│       └── site_strings.py  # /api/strings (i18n overrides)
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

---

## Homepage Features

The public homepage has several dynamic sections managed via the admin panel:

| Feature | How It Works |
|---------|-------------|
| **Featured News** | One news article with `is_featured=True` appears as the large spotlight card. Only one at a time (toggling auto-unsets the previous). Falls back to the latest news if none is marked. |
| **Player of the Month** | One player with `is_player_of_month=True` is shown in a gold card. Set via the player edit form. Only one at a time. |
| **Tournament Winner** | One player with `is_tournament_winner=True` is shown in a blue card. Set via the player edit form. Only one at a time. |

**API Endpoint:** `GET /api/players/homepage?lang=en` returns `{ player_of_month, tournament_winner }` for the homepage cards.
