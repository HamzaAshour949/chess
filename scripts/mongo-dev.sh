#!/usr/bin/env bash
# Start a local MongoDB for development.
#
# Uses a project-local data directory so it never collides with any other
# MongoDB on the machine, and runs as a single-node replica set — MongoDB only
# offers multi-document transactions on a replica set, and the game-finish path
# needs one to update two player ratings and the game atomically.
#
# Usage: ./scripts/mongo-dev.sh [start|stop|status]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT/.mongo-data"
LOG_FILE="$ROOT/.mongo-data/mongod.log"
PORT="${MONGO_PORT:-27017}"
REPL_SET="rs0"

require_mongod() {
  if ! command -v mongod >/dev/null 2>&1; then
    echo "mongod not found. Install it with:  brew tap mongodb/brew && brew install mongodb-community" >&2
    echo "Or run MongoDB in Docker:  docker run -d --name chess-mongo -p 27017:27017 mongo:8 --replSet rs0" >&2
    exit 1
  fi
}

is_up() { mongosh --quiet --port "$PORT" --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1; }

start() {
  require_mongod
  if is_up; then
    echo "MongoDB already running on port $PORT."
  else
    mkdir -p "$DATA_DIR"
    echo "Starting mongod (dbpath: $DATA_DIR, port: $PORT, replica set: $REPL_SET)..."
    mongod --dbpath "$DATA_DIR" --logpath "$LOG_FILE" --bind_ip 127.0.0.1 \
           --port "$PORT" --replSet "$REPL_SET" --fork >/dev/null
    for _ in $(seq 1 30); do is_up && break; sleep 0.5; done
  fi

  # Initiate the replica set once; harmless to re-run.
  if ! mongosh --quiet --port "$PORT" --eval 'rs.status().ok' >/dev/null 2>&1; then
    echo "Initiating replica set $REPL_SET..."
    mongosh --quiet --port "$PORT" --eval \
      "rs.initiate({_id:'$REPL_SET',members:[{_id:0,host:'127.0.0.1:$PORT'}]})" >/dev/null
    for _ in $(seq 1 30); do
      mongosh --quiet --port "$PORT" --eval 'db.hello().isWritablePrimary' 2>/dev/null | grep -q true && break
      sleep 0.5
    done
  fi
  echo "MongoDB ready on mongodb://127.0.0.1:$PORT (replica set $REPL_SET)."
}

stop() {
  if is_up; then
    mongosh --quiet --port "$PORT" --eval 'db.getSiblingDB("admin").shutdownServer()' >/dev/null 2>&1 || true
    echo "MongoDB stopped."
  else
    echo "MongoDB is not running on port $PORT."
  fi
}

status() {
  if is_up; then
    mongosh --quiet --port "$PORT" --eval \
      'print("up — " + db.version() + " — " + (db.hello().setName || "standalone"))'
  else
    echo "down"
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "Usage: $0 [start|stop|status]" >&2; exit 1 ;;
esac
