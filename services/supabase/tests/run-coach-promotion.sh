#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
CONTAINER_NAME="task-10-13-core-unlock-test-$$"
POSTGRES_PASSWORD="test-only-password"
POSTGRES_DB="task_10_13_core_unlock_test"
TMP_DIR="$ROOT_DIR/services/supabase/tests/.coach-promotion-test-$$"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
mkdir -p "$TMP_DIR"

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

PSQL=(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER_NAME" psql -U postgres -d "$POSTGRES_DB" -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f /workspace/services/supabase/tests/coach_promotion.test.sql

# 两个独立数据库会话同时申请；服务端锁与部分唯一索引必须收敛为一条 pending。
"${PSQL[@]}" -q -c "select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000030', false); select public.request_coach_promotion();" >"$TMP_DIR/request-a.out" 2>&1 &
REQUEST_A=$!
"${PSQL[@]}" -q -c "select set_config('app.test_auth_uid', '00000000-0000-0000-0000-000000000030', false); select public.request_coach_promotion();" >"$TMP_DIR/request-b.out" 2>&1 &
REQUEST_B=$!
set +e
wait "$REQUEST_A"; REQUEST_A_STATUS=$?
wait "$REQUEST_B"; REQUEST_B_STATUS=$?
set -e
if [ "$REQUEST_A_STATUS" -ne 0 ] || [ "$REQUEST_B_STATUS" -ne 0 ]; then
  for output_file in "$TMP_DIR/request-a.out" "$TMP_DIR/request-b.out"; do
    while IFS= read -r line; do printf '%s\n' "$line" >&2; done <"$output_file"
  done
  exit 1
fi
"${PSQL[@]}" -q -c "select test.assert_true((select count(*) = 1 from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000030' and state = 'promotion_pending'), 'concurrent requests must create exactly one pending row');"

# 两个独立会话同时写入第 8/9 名；角色、状态和审计必须原子且只晋升一次。
"${PSQL[@]}" -q -c "select test.attach_relation('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000031');" >"$TMP_DIR/promote-a.out" 2>&1 &
PROMOTE_A=$!
"${PSQL[@]}" -q -c "select test.attach_relation('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000031');" >"$TMP_DIR/promote-b.out" 2>&1 &
PROMOTE_B=$!
set +e
wait "$PROMOTE_A"; PROMOTE_A_STATUS=$?
wait "$PROMOTE_B"; PROMOTE_B_STATUS=$?
set -e
if [ "$PROMOTE_A_STATUS" -ne 0 ] || [ "$PROMOTE_B_STATUS" -ne 0 ]; then
  for output_file in "$TMP_DIR/promote-a.out" "$TMP_DIR/promote-b.out"; do
    while IFS= read -r line; do printf '%s\n' "$line" >&2; done <"$output_file"
  done
  exit 1
fi
"${PSQL[@]}" -q -c "select test.assert_true((select state = 'coach' from public.coach_promotions where auth_user_id = '00000000-0000-0000-0000-000000000031'), 'concurrent eighth/ninth recruits must end in coach'); select test.assert_true((select count(*) = 1 from public.camp_admins where auth_user_id = '00000000-0000-0000-0000-000000000031' and role = 'coach' and is_active), 'concurrent promotion must create exactly one coach role'); select test.assert_true((select count(*) = 1 from public.audit_logs audit join public.coach_promotions p on p.promotion_id = audit.target_id where p.auth_user_id = '00000000-0000-0000-0000-000000000031' and audit.action = 'coach_promotion_promoted'), 'concurrent promotion must write exactly one promotion audit');"

echo "PASS: real two-session request idempotency and atomic automatic promotion"
