#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
CONTAINER_NAME="task-10-11-expiry-test-$$"
POSTGRES_PASSWORD="test-only-password"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --pull never -d \
  --name "$CONTAINER_NAME" \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -e POSTGRES_DB=task_10_11_test \
  -v "$ROOT_DIR:/workspace:ro" \
  postgres:15 >/dev/null

for attempt in {1..30}; do
  if docker exec "$CONTAINER_NAME" pg_isready -U postgres -d task_10_11_test >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "PostgreSQL test container did not become ready" >&2
    exit 1
  fi
  sleep 1
done

docker exec \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  "$CONTAINER_NAME" \
  psql -U postgres -d task_10_11_test -v ON_ERROR_STOP=1 \
  -f /workspace/services/supabase/tests/verify_checkin_expiry.test.sql
