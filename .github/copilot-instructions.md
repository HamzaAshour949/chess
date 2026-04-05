# GitHub Copilot Instructions

## Project Context
This is a bilingual (EN/AR) chess players & news CMS. Flask API backend with React+Vite frontend. MySQL database. See CLAUDE.md for full details.

## Coding Standards
- Python: Follow PEP 8. Use type hints for function signatures.
- JavaScript/React: Use functional components with hooks. No class components.
- All API endpoints return JSON. Errors use `{"error": "message"}` format.
- Bilingual fields follow the pattern: `field_en` / `field_ar`.

## Security Requirements
- NEVER write raw SQL — use SQLAlchemy ORM only.
- NEVER commit secrets or .env files.
- Always add `@jwt_required()` to admin endpoints.
- Always add rate limiting (`@limiter.limit()`) to endpoints accepting user input.
- Always validate and sanitise file uploads.
- Always use parameterised queries.

## Database
- MySQL 8+ with utf8mb4 charset.
- Use Flask-Migrate for all schema changes — never modify tables manually.
- Run `flask db migrate -m "description"` then `flask db upgrade`.

## Testing
- Test both English and Arabic content paths.
- Verify rate limits don't break legitimate usage.

## Context Management
- **CLAUDE.md** is the single source of truth for project structure and conventions.
- **Always update CLAUDE.md** when adding/removing models, API routes, features, or making architectural changes.
- Read CLAUDE.md at the start of every session to understand the current state of the project.
