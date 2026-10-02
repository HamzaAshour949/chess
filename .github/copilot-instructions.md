# GitHub Copilot Instructions

## Project Context

Bilingual (EN/AR) chess players & news CMS **plus** a real-time multiplayer
chess platform. Express 5 + TypeScript API with Socket.IO, MongoDB via
Mongoose, React 19 + Vite SPA, all on **Bun 1.3** (runtime, package manager,
test runner). Bun workspaces: `server/` and `frontend/`. There is no server
build step: Bun runs `server/src/*.ts` directly.

**See `CLAUDE.md` for full details.** It is the source of truth.

## Coding Standards

- TypeScript strict, ESM, `moduleResolution: bundler`, `noEmit` (tsc only
  type-checks). Keep the `.js` extension on relative imports, as the existing
  code does. No `any` without a reason.
- Use Bun APIs where they replace a dependency (`Bun.password`, `--env-file`,
  `import.meta.main`, `import.meta.dir`, `bun:test`). Never add npm lockfiles.
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
- Clock maths lives in `lib/clock.ts`: each side's first move is untimed but
  must come within `FIRST_MOVE_TIMEOUT_SECONDS`; keep `deadlineAt` in step with
  any clock change so the sweeper (`startSweeper()`) settles games on time.

## Concurrency

Never read-then-write. Every state transition is a conditional update guarded on
`version` or `status`, so two racing requests cannot both succeed. See
`services/game-service.ts` and `routes/games.ts`.

## Security Requirements

- Validate every request body and query with **Zod** at the boundary.
- Player tokens carry `ver` (`User.tokenVersion`); bump it to revoke sessions.
- Reserve an OTP/reset attempt with a guarded `$inc` **before** checking the
  code. Hash passwords only through `lib/password.ts`.
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
- `autoIndex` is off. Indexes sync on boot (`DB_SYNC_INDEXES=1`) or with
  `bun run db:indexes`. Several are **constraints** the code relies on
  (case-insensitive usernames, one open seek per player, one profile link).
- `bson` is pinned to 7.2.0 in root `overrides`: 7.3 breaks Mongoose on Bun.
- A unique index on a field stored as explicit `null` must be **partial**, not
  sparse.

## Testing

- `bun run test` — `bun test` + Supertest against a real MongoDB
  (`chess_hub_test`); `server/bunfig.toml` preloads the test environment.
- Cover both English and Arabic content paths.
- For anything concurrent, write a test that fires the requests simultaneously.
- Keep the **base** keys of `frontend/src/locales/en.json` and `ar.json` equal;
  Arabic adds the `_zero`/`_two`/`_few`/`_many` plural forms where `count` is used.

## Frontend

- Pages are lazy-loaded; fetch with `useFetch`, give feedback with `useToast()`
  and `useConfirm()`, never `alert`/`confirm`.
- Wrap user names in `<bdi>`, use `isolate()` when interpolating them, give
  user text `dir="auto"`, and keep boards `dir="ltr"`.
- No coloured accent stripe along one edge of a card, row or nav item; use a
  tint, a full border, a badge, a dot or text weight.

## Before Committing

`bun run check && bun run build`, and update `CLAUDE.md` when adding models,
routes, or changing architecture.
