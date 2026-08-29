# GitHub Copilot Instructions

## Project Context

Bilingual (EN/AR) chess players & news CMS **plus** a real-time multiplayer
chess platform. Express 5 + TypeScript API with Socket.IO, MongoDB via
Mongoose, React 19 + Vite SPA. npm workspaces: `server/` and `frontend/`.

**See `CLAUDE.md` for full details.** It is the source of truth.

## Coding Standards

- TypeScript strict, ESM (`NodeNext`) — relative imports need the `.js`
  extension. No `any` without a reason.
- React: function components and hooks only. Never declare a component inside
  another component's render.
- API responses are JSON. Errors are `{ "error": "message" }`, plus `details`
  for validation and `code` for machine-readable cases.
- Documents are camelCase; the API wire format is snake_case, mapped explicitly
  in `server/src/lib/serializers.ts`. Never return a Mongoose document directly.
- Bilingual fields: `fieldEn` / `fieldAr` in the model, `field_en` / `field_ar`
  on the wire.

## Chess Rules (most important thing to get right)

- `Game.moves` (space-separated UCI) is the **source of truth**. `fen`, `pgn`
  and `moveCount` are caches rebuilt on every write.
- Validate moves by replaying `moves` via `lib/chess.ts::playMove()`. **Never**
  validate against the stored FEN — replaying is what makes threefold
  repetition detectable and stops a tampered cache from taking hold.
- `pgn` is movetext only: use `buildPgn()`, never chess.js's `pgn()`.
- Bump `version` on any observable change, including draw offers.

## Concurrency

Never read-then-write. Every state transition is a conditional update guarded on
`version` or `status`, so two racing requests cannot both succeed. See
`services/game-service.ts` and `routes/games.ts`.

## Security Requirements

- Validate every request body and query with **Zod** at the boundary.
- `requireAdmin` on admin routes, `requireUser` on player routes. The role is a
  signed claim *and* the token audience; never infer it another way.
- Add a rate limiter to any endpoint accepting input.
- Uploads: decode and re-encode with `sharp`. Never trust an extension or the
  client's MIME type.
- Escape user input before it becomes a `RegExp` (`escapeRegex()`).
- Strip URLs from chat **before** truncating, never after.
- Never commit `.env` or secrets. Never allow `*` CORS. Never enable
  `TRUST_PROXY` without an actual reverse proxy.
- A user linked to a `Player` profile gets identity only — never write access.

## Database

- MongoDB 7+, replica set required for transactions.
- No migration runner: schema changes are edits to `server/src/models/`.
- `autoIndex` is off. After adding an index, run `npm run db:indexes`. Several
  indexes are **constraints** the code relies on, not optimisations.
- A unique index on a field stored as explicit `null` must be **partial**, not
  sparse.

## Testing

- `npm test` — Vitest + Supertest against a real MongoDB.
- Cover both English and Arabic content paths.
- For anything concurrent, write a test that fires the requests simultaneously.
- Keep `frontend/src/locales/en.json` and `ar.json` key-for-key equal.

## Before Committing

`npm test && npm run typecheck && npm run lint`, and update `CLAUDE.md` when
adding models, routes, or changing architecture.
