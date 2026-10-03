# syntax=docker/dockerfile:1.7
#
# Chess Hub — one Bun process serving the API, Socket.IO and the built SPA.
#
#   docker build -t chess-hub .
#   docker compose up          # with MongoDB, see docker-compose.yml

ARG BUN_VERSION=1.3.13

# ---------------------------------------------------------------- build SPA
FROM oven/bun:${BUN_VERSION}-slim AS web
WORKDIR /app
COPY package.json bun.lock ./
COPY server/package.json server/
COPY frontend/package.json frontend/
RUN bun install --frozen-lockfile
COPY frontend ./frontend
RUN bun run --cwd frontend build

# ------------------------------------------------- server runtime packages
# Only the server workspace's production dependencies: no React, no Vite, no
# TypeScript compiler. Bun runs the TypeScript sources directly.
FROM oven/bun:${BUN_VERSION}-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY server/package.json server/
COPY frontend/package.json frontend/
RUN bun install --frozen-lockfile --production --filter '@chess-hub/server'

# ------------------------------------------------------------------ runtime
FROM oven/bun:${BUN_VERSION}-slim
ENV NODE_ENV=production \
    PORT=8080 \
    UPLOAD_DIR=/app/uploads
WORKDIR /app

COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=deps --chown=bun:bun /app/server/node_modules ./server/node_modules
COPY --chown=bun:bun package.json ./
COPY --chown=bun:bun server/package.json server/tsconfig.json ./server/
COPY --chown=bun:bun server/src ./server/src
COPY --from=web --chown=bun:bun /app/frontend/dist ./frontend/dist

# Uploaded images live on a volume in production (see docker-compose.yml).
RUN mkdir -p /app/uploads && chown bun:bun /app/uploads
USER bun

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Bun forwards SIGTERM to the process, which drains connections and exits.
CMD ["bun", "server/src/index.ts"]
