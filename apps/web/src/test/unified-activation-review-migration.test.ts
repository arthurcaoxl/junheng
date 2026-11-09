import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "../../services/supabase/migrations/20261109156000_unified_activation_review.sql",
);
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

function functionBody(name: string): string {
  return sql.match(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}[\\s\\S]*?\\$function\\$;`, "i"),
  )?.[0] ?? "";
}

describe("TASK-10.13 双路径激活唯一终审迁移静态契约", () => {
  it("删除两种遗留自助激活签名，且只向客户端开放 v2 Admin 审核入口", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(sql).toMatch(/^\s*begin;/i);
    expect(sql).toMatch(/drop\s+function\s+public\.activate_box_code\(text,\s*text\)/i);
    expect(sql).toMatch(/drop\s+function\s+public\.activate_box_code\(text,\s*integer,\s*integer,\s*text\)/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.admin_review_box_code_activation\(uuid,\s*text,\s*text,\s*text,\s*text,\s*integer,\s*integer\)\s+from\s+public,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.admin_review_box_code_activation_v2\(uuid,\s*text,\s*uuid,\s*text,\s*text,\s*text,\s*integer,\s*integer\)\s+to\s+authenticated/i);
    expect(sql).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.activate_box_code/i);
    expect(sql).toMatch(/commit;/i);
  });

  it("申请来源是不可变必填字段，历史回填受控绕过且立即恢复版本守护", () => {
    expect(sql).toMatch(/add\s+column\s+request_source\s+text/i);
    expect(sql).toMatch(/request_source\s+in\s*\('manual_code',\s*'coach_push'\)/i);
    expect(sql).toMatch(/alter\s+column\s+request_source\s+set\s+not\s+null/i);
    expect(sql).toMatch(/actor_auth_user_id\s*=\s*a\.auth_user_id\s+then\s+'manual_code'/i);
    expect(sql).toMatch(/actor_auth_user_id\s+is\s+not\s+null\s+then\s+'coach_push'/i);
    expect(sql).toMatch(/e\.event_type\s*=\s*'CodeActivationRequested'/i);
    const disableAt = sql.search(/alter\s+table\s+public\.code_activations\s+disable\s+trigger\s+code_activation_mutation_guard/i);
    const backfillAt = sql.search(/update\s+public\.code_activations\s+a/i);
    const enableAt = sql.search(/alter\s+table\s+public\.code_activations\s+enable\s+trigger\s+code_activation_mutation_guard/i);
    expect(disableAt).toBeGreaterThanOrEqual(0);
    expect(backfillAt).toBeGreaterThan(disableAt);
    expect(enableAt).toBeGreaterThan(backfillAt);
    expect(functionBody("guard_code_activation_source_immutable")).toMatch(/NEW\.request_source\s+is\s+distinct\s+from\s+OLD\.request_source/i);
    expect(sql).toMatch(/before\s+update\s+on\s+public\.code_activations[\s\S]*execute\s+function\s+public\.guard_code_activation_source_immutable\(\)/i);
  });

  it("两条申请路径写入各自来源，并在请求事件中保留相同来源", () => {
    for (const [name, source] of [
      ["request_box_code_activation", "manual_code"],
      ["coach_push_code_v1", "coach_push"],
    ] as const) {
      const body = functionBody(name);
      expect(body).toMatch(new RegExp(`request_source[\\s\\S]*'${source}'`, "i"));
      expect(body).toMatch(new RegExp(`CodeActivationRequested[\\s\\S]*jsonb_build_object\\('requestSource',\\s*'${source}'\\)`, "i"));
      expect(body).toMatch(/vault\.decrypted_secrets/i);
      expect(body).toMatch(/name\s*=\s*'box_code_pepper'/i);
      expect(body).toMatch(/BOX_CODE_PEPPER_NOT_CONFIGURED/i);
      expect(body).not.toMatch(/current_setting\('app\.box_code_pepper'/i);
      expect(body).toMatch(/review_state[\s\S]*'pending'/i);
      expect(body).toMatch(/state\s*=\s*'pending_review'/i);
      expect(body).not.toMatch(/state\s*=\s*'active'/i);
      expect(body).not.toMatch(/available_count\s*=\s*available_count\s*-\s*1/i);
    }
  });

  it("同幂等键在命令读取前串行化，同载荷重放且异载荷冲突", () => {
    for (const name of ["request_box_code_activation", "coach_push_code_v1"]) {
      const body = functionBody(name);
      const lockAt = body.search(/pg_advisory_xact_lock\(\s*hashtextextended\('box-code-command:'/i);
      const commandReadAt = body.search(/from\s+public\.box_code_commands/i);
      expect(lockAt).toBeGreaterThanOrEqual(0);
      expect(commandReadAt).toBeGreaterThan(lockAt);
      expect(body).toMatch(/IDEMPOTENCY_CONFLICT/i);
      expect(body).toMatch(/jsonb_set\(v_command\.result,\s*'\{replayed\}',\s*'true'::jsonb\)/i);
    }
  });

  it("staff 先审计拒绝，非有效 coach 再在 Vault 前拒绝，教练归属边界不变", () => {
    const body = functionBody("coach_push_code_v1");
    const staffCheckAt = body.search(/a\.role\s*=\s*'staff'/i);
    const coachCheckAt = body.search(/a\.role\s*=\s*'coach'/i);
    const vaultReadAt = body.search(/vault\.decrypted_secrets/i);
    expect(staffCheckAt).toBeGreaterThanOrEqual(0);
    expect(coachCheckAt).toBeGreaterThan(staffCheckAt);
    expect(vaultReadAt).toBeGreaterThan(coachCheckAt);
    expect(body.slice(staffCheckAt, coachCheckAt)).not.toMatch(/a\.is_active/i);
    expect(body.slice(coachCheckAt, vaultReadAt)).toMatch(/a\.is_active/i);
    expect(body).toMatch(/staff_finance_denied/i);
    expect(body).toMatch(/b\.coach_id\s*=\s*v_auth_user_id/i);
    expect(body).toMatch(/b\.inventory_status\s*=\s*'coach'/i);
    expect(body).toMatch(/r\.referrer_id\s*=\s*v_auth_user_id/i);
    expect(body).toMatch(/r\.valid_to\s+is\s+null/i);
    expect(body).toMatch(/BOX_CODE_PEPPER_NOT_CONFIGURED/i);
  });

  it("唯一终审保留 Admin、归属与双版本校验，终审审计携带申请来源", () => {
    const legacySql = readFileSync(resolve(
      process.cwd(),
      "../../services/supabase/migrations/20261108130000_manual_review_trusteeship.sql",
    ), "utf8");
    const review = legacySql.match(
      /create\s+or\s+replace\s+function\s+public\.admin_review_box_code_activation[\s\S]*?\$function\$;/i,
    )?.[0] ?? "";
    const auditSource = functionBody("enrich_code_activation_audit_source");
    expect(review).toMatch(/a\.role\s*=\s*'admin'/i);
    expect(review).toMatch(/a\.is_active/i);
    expect(review).toMatch(/v_code\.version\s+is\s+distinct\s+from\s+p_expected_code_version/i);
    expect(review).toMatch(/v_activation\.version\s+is\s+distinct\s+from\s+p_expected_activation_version/i);
    expect(review).toMatch(/for\s+update\s+of\s+b/i);
    expect(review).toMatch(/code_activation_approved/i);
    expect(review).toMatch(/code_activation_rejected/i);
    expect(auditSource).toMatch(/NEW\.action\s+in\s*\('code_activation_approved',\s*'code_activation_rejected'\)/i);
    expect(auditSource).toMatch(/select\s+a\.request_source\s+into\s+v_request_source/i);
    expect(auditSource).toMatch(/'\{requestSource\}'[\s\S]*to_jsonb\(v_request_source\)/i);
    expect(sql).toMatch(/before\s+insert\s+on\s+public\.audit_logs[\s\S]*execute\s+function\s+public\.enrich_code_activation_audit_source\(\)/i);
  });
});
