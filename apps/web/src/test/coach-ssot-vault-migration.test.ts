import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "../../services/supabase/migrations/20261109154000_coach_ssot_vault.sql",
);
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

function functionBody(name: string): string {
  return sql.match(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\b[\\s\\S]*?\\$function\\$;`, "i"),
  )?.[0] ?? "";
}

describe("TASK-10.13 教练身份 SSOT 与 Vault 迁移契约", () => {
  it("coach 角色写入具备 Admin 鉴权、版本、幂等、成功审计和角色保护", () => {
    const body = functionBody("admin_set_coach_role");
    expect(body).toMatch(/staff_rbac_require_admin\(\)/i);
    expect(body).toMatch(/p_expected_version/i);
    expect(body).toMatch(/ROLE_VERSION_CONFLICT/i);
    expect(body).toMatch(/p_idempotency_key/i);
    expect(body).toMatch(/IDEMPOTENCY_CONFLICT/i);
    expect(body).toMatch(/staff_rbac_audit/i);
    expect(body).toMatch(/coach_role_/i);
    expect(body).toMatch(/v_existing\.role\s*<>\s*'coach'/i);
    expect(body).toMatch(/'coach_role'\s*,\s*v_payload_hash/i);
    expect(sql).toMatch(/grant execute on function public\.admin_set_coach_role\(text, boolean, integer, text\) to authenticated/i);
  });

  it("存量回填只同步 coach，不把 admin 或 staff 降权", () => {
    expect(sql).toMatch(/from\s+public\.user_coach_relation\s+r/i);
    expect(sql).toMatch(/r\.valid_to\s+is\s+null/i);
    expect(sql).toMatch(/a\.role\s*=\s*'coach'/i);
    expect(sql).toMatch(/insert\s+into\s+public\.camp_admins/i);
    expect(sql).toMatch(/not\s+exists[\s\S]*camp_admins[\s\S]*auth_user_id/i);
    expect(sql).not.toMatch(/set\s+role\s*=\s*'coach'[\s\S]*where\s+role\s+in\s*\(\s*'admin'\s*,\s*'staff'/i);
  });

  it("目录、划拨、审核、staff 分配和补货不再用学员关系证明教练身份", () => {
    for (const name of [
      "admin_get_coach_directory",
      "allocate_codes_to_coach",
      "admin_review_box_code_activation_v2",
      "request_coach_restock_v1",
    ]) {
      const body = functionBody(name);
      expect(body).toMatch(/camp_admins/i);
      expect(body).toMatch(/role\s*=\s*'coach'/i);
      expect(body).toMatch(/is_active/i);
      expect(body).not.toMatch(/user_coach_relation/i);
    }
    const assignment = functionBody("admin_assign_staff_coach");
    expect(assignment).toMatch(/camp_admins[\s\S]*auth_user_id\s*=\s*p_coach_id[\s\S]*role\s*=\s*'coach'[\s\S]*is_active/i);
  });

  it("教练工作台、云库存、雷达和 profile 统一角色门且保留 staff 边界", () => {
    for (const name of [
      "get_coach_campers_v1",
      "get_coach_camper_followup_v1",
      "set_coach_camper_followup_v1",
      "coach_push_code_v1",
      "get_my_code_inventory",
    ]) {
      expect(functionBody(name)).toMatch(/camp_admins[\s\S]*role\s*=\s*'coach'[\s\S]*is_active/i);
    }
    expect(functionBody("get_my_code_inventory")).toMatch(/staff_finance_denied/i);
    expect(functionBody("admin_get_coach_directory")).toMatch(/a\.role\s*=\s*'admin'/i);
  });

  it("所有受影响 RPC 只读 Vault 并统一缺失错误码", () => {
    for (const name of [
      "generate_platform_codes",
      "request_box_code_activation",
      "activate_box_code",
      "admin_get_pending_box_code_reviews",
      "admin_review_box_code_activation",
      "get_my_code_inventory",
      "coach_push_code_v1",
    ]) {
      const body = functionBody(name);
      expect(body, name).toMatch(/vault\.decrypted_secrets/i);
      expect(body, name).toMatch(/name\s*=\s*'box_code_pepper'/i);
      expect(body, name).toMatch(/BOX_CODE_PEPPER_NOT_CONFIGURED/i);
      expect(body, name).not.toMatch(/current_setting\s*\(\s*'app\.box_code_pepper'/i);
    }
    const twoArgLegacy = sql.match(
      /create\s+or\s+replace\s+function\s+public\.activate_box_code\(\s*p_code\s+text\s*,\s*p_idempotency_key\s+text\s*\)[\s\S]*?\$function\$;/i,
    )?.[0] ?? "";
    expect(twoArgLegacy).toMatch(/vault\.decrypted_secrets/i);
    expect(twoArgLegacy).toMatch(/BOX_CODE_PEPPER_NOT_CONFIGURED/i);
    expect(sql).not.toMatch(/current_setting\s*\(\s*'app\.box_code_pepper'/i);
  });
});
