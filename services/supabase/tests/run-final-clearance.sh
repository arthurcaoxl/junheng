#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
CONTAINER_NAME="task-10-13-final-clearance-test-$$"
POSTGRES_PASSWORD="test-only-password"
POSTGRES_DB="task_10_13_final_clearance_test"
PSQL_ON_ERROR_STOP="${PSQL_ON_ERROR_STOP:-1}"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --pull never -d \
  --name "$CONTAINER_NAME" \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -e POSTGRES_DB="$POSTGRES_DB" \
  -v "$ROOT_DIR:/workspace:ro" \
  postgres:15 >/dev/null

for attempt in {1..30}; do
  if docker exec "$CONTAINER_NAME" pg_isready -U postgres -d "$POSTGRES_DB" >/dev/null 2>&1; then
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
  psql -U postgres -d "$POSTGRES_DB" -v ON_ERROR_STOP="$PSQL_ON_ERROR_STOP" \
  -f /workspace/services/supabase/tests/final_clearance.test.sql \
  -f /workspace/services/supabase/tests/final_staff_allocation.test.sql
