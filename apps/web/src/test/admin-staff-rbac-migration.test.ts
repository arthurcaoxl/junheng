import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = resolve(process.cwd(), "../../services/supabase/migrations/20261109120000_admin_staff_rbac.sql");
const sql = existsSync(path) ? readFileSync(path, "utf8") : "";

function functionBody(name: string): string {
  return sql.match(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}[\\s\\S]*?\\$function\\$;`, "i"))?.[0] ?? "";
}

describe("Admin 员工 RBAC 与教练联系方式迁移契约", () => {
  it("教练目录只在有效 Admin 鉴权后返回邮箱、姓名和手机号", () => {
    const directory = functionBody("admin_get_coach_directory");
    expect(directory).toMatch(/returns\s+table\s*\(\s*coach_id\s+uuid\s*,\s*email\s+text\s*,\s*name\s+text\s*,\s*phone\s+text\s*\)/i);
    expect(directory).toMatch(/auth\.uid\(\)/i);
    expect(directory).toMatch(/a\.auth_user_id\s*=\s*v_auth_user_id/i);
    expect(directory).toMatch(/a\.role\s*=\s*'admin'/i);
    expect(directory).toMatch(/a\.is_active/i);
    expect(directory).toMatch(/public\.user_coach_relation/i);
    expect(directory).toMatch(/r\.valid_to\s+is\s+null/i);
    expect(directory).toMatch(/left\s+join\s+public\.user_profiles/i);
    expect(directory).toMatch(/raw_user_meta_data/i);
    expect(directory).toMatch(/limit\s+10/i);
    expect(directory).not.toMatch(/records|height_cm|initial_weight_kg|wechat/i);
    expect(sql).toMatch(/drop\s+function\s+public\.admin_get_coach_directory\(text\)/i);
  });

  it("角色和分配表默认关闭客户端直写并保留版本与审计", () => {
    expect(sql).toMatch(/role\s*=\s*'admin'\s*,\s*'coach'\s*,\s*'staff'|role\s+in\s*\(\s*'admin'\s*,\s*'coach'\s*,\s*'staff'\s*\)/i);
    expect(sql).toMatch(/create\s+table\s+public\.staff_coach_assignment/i);
    expect(sql).toMatch(/expectedVersion|p_expected_version/i);
    expect(sql).toMatch(/p_idempotency_key/i);
    expect(sql).toMatch(/alter\s+table\s+public\.staff_coach_assignment\s+enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.staff_coach_assignment\s+from\s+anon,\s*authenticated/i);
    expect(sql).toMatch(/create\s+table\s+public\.staff_rbac_audit/i);
    expect(sql).toMatch(/before\s+update\s+or\s+delete\s+on\s+public\.staff_rbac_audit/i);
  });

  it("所有员工管理 RPC 经统一 auth.uid Admin 门禁且写审计", () => {
    expect(functionBody("staff_rbac_require_admin")).toMatch(/a\.auth_user_id\s*=\s*v_auth_user_id/i);
    expect(functionBody("staff_rbac_require_admin")).toMatch(/a\.role\s*=\s*'admin'/i);
    expect(functionBody("staff_rbac_require_admin")).toMatch(/access_denied/i);
    for (const name of ["admin_get_staff_directory", "admin_set_staff_role", "admin_assign_staff_coach", "admin_revoke_staff_coach"]) {
      expect(functionBody(name)).toMatch(/staff_rbac_require_admin\(\)/i);
    }
    expect(functionBody("admin_set_staff_role")).toMatch(/staff_role_/i);
    expect(functionBody("admin_assign_staff_coach")).toMatch(/staff_assignment_created/i);
    expect(functionBody("admin_revoke_staff_coach")).toMatch(/staff_assignment_revoked/i);
  });

  it("staff 雷达严格限于当前有效分配且仍只返回五个脱敏字段", () => {
    const radar = functionBody("get_coach_radar_v1");
    expect(radar).toMatch(/v_role\s+not\s+in\s*\(\s*'coach'\s*,\s*'admin'\s*,\s*'staff'\s*\)/i);
    expect(radar).toMatch(/v_role\s*=\s*'staff'/i);
    expect(radar).toMatch(/public\.staff_coach_assignment/i);
    expect(radar).toMatch(/sa\.staff_id\s*=\s*v_auth_user_id/i);
    expect(radar).toMatch(/sa\.coach_id\s*=\s*r\.referrer_id/i);
    expect(radar).toMatch(/sa\.state\s*=\s*'active'/i);
    expect(radar).toMatch(/sa\.valid_to\s+is\s+null\s+or\s+sa\.valid_to\s*>\s*now\(\)/i);
    const columns = radar.match(/returns\s+table\s*\(([\s\S]*?)\)\s*language/i)?.[1] ?? "";
    expect(columns.split(",").map((column) => column.trim().split(/\s+/)[0])).toEqual([
      "camper_code", "weight_delta", "waist_delta", "bmi", "alert_level",
    ]);
  });

  it("历史统计 RPC 与直读策略同步收口到有效 admin 角色", () => {
    const overview = functionBody("admin_checkin_overview");
    expect(overview).toMatch(/a\.auth_user_id\s*=\s*auth\.uid\(\)/i);
    expect(overview).toMatch(/a\.role\s*=\s*'admin'/i);
    expect(overview).toMatch(/a\.is_active/i);
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"checkin_sync_admin_readonly_admin_module"/i);
    expect(sql).toMatch(/create\s+policy\s+"checkin_sync_admin_readonly_admin_module"[\s\S]*a\.role\s*=\s*'admin'/i);
  });

  it("staff 云仓调用由后端拒绝并审计，Vault 口径不变", () => {
    const inventory = functionBody("get_my_code_inventory");
    expect(inventory).toMatch(/a\.role\s*=\s*'staff'/i);
    expect(inventory).toMatch(/staff_finance_denied/i);
    expect(inventory).toMatch(/FORBIDDEN/i);
    expect(inventory).toMatch(/vault\.decrypted_secrets/i);
    expect(inventory).toMatch(/box_code_pepper/i);
    expect(inventory).toMatch(/BOX_CODE_PEPPER_NOT_CONFIGURED/i);
    expect(inventory).not.toMatch(/current_setting\(\s*'app\.box_code_pepper'/i);
  });

  it("软容量超过 5 名教练或 150 名体验官只警告不阻断", () => {
    const assign = functionBody("admin_assign_staff_coach");
    expect(assign).toMatch(/>\s*5/i);
    expect(assign).toMatch(/>\s*150/i);
    expect(assign).toMatch(/STAFF_CAPACITY_WARNING/i);
    expect(assign).toMatch(/staff_governance_followup/i);
    expect(assign).not.toMatch(/if\s+v_coach_count\s*>?\s*=?\s*5\s+then\s+raise/i);
    expect(assign).not.toMatch(/if\s+v_camper_count\s*>?\s*=?\s*150\s+then\s+raise/i);
  });

  it("幂等重放同时核对命令类型、载荷哈希和调用者，拒绝异键复用", () => {
    for (const [name, commandType] of [
      ["admin_set_staff_role", "staff_role"],
      ["admin_assign_staff_coach", "assignment_create"],
      ["admin_revoke_staff_coach", "assignment_revoke"],
    ] as const) {
      const body = functionBody(name);
      expect(body).toMatch(/c\.command_type\s*<>\s*v_command_type/i);
      expect(body).toMatch(/c\.payload_hash\s*<>\s*v_payload_hash/i);
      expect(body).toMatch(/c\.caller_auth_user_id\s*<>\s*v_admin_id/i);
      expect(body).toContain(`v_command_type text := '${commandType}'`);
      expect(body).not.toMatch(/v_payload_hash\s*<>\s*v_payload_hash/i);
    }
  });
});
