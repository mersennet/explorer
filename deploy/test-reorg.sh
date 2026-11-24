#!/usr/bin/env bash
# Run the indexer's reorg test against a throwaway Postgres in Docker.
set -euo pipefail
cd "$(dirname "$0")/.."
name=explorer-reorg-test-pg
docker rm -f "$name" >/dev/null 2>&1 || true
port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=test -e POSTGRES_USER=mersennet \
  -e POSTGRES_DB=explorer_test -p "127.0.0.1:$port:5432" postgres:16-alpine >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do docker exec "$name" pg_isready -U mersennet -d explorer_test >/dev/null 2>&1 && break; sleep 1; done
sleep 1
DB_PASS=test DB_USER=mersennet DB_HOST=127.0.0.1 DB_PORT="$port" DB_NAME=explorer_test node --test test/*.test.js
