import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = resolve(process.cwd(), "../../services/supabase/migrations/20261109094500_p0_rbac_vault.sql");
const sql = existsSync(path) ? readFileSync(path, "utf8") : "";

function functionBody(name: string): string {
  return sql.match(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}[\\s\\S]*?\\$function\\$;`, "i"))?.[0] ?? "";
}

describe("TASK-10.12 P0 RBAC 与 Vault 迁移契约", () => {
  it("在事务内按规范化邮箱回填 NULL 白名单映射并跳过已占用主体", () => {
    expect(sql).toMatch(/^\s*begin;/i);
    expect(sql).toMatch(/update\s+public\.camp_admins\s+a[\s\S]*set\s+auth_user_id\s*=\s*u\.id/i);
    expect(sql).toMatch(/from\s+auth\.users\s+u/i);
    expect(sql).toMatch(/lower\(a\.email\)\s*=\s*lower\(u\.email\)/i);
    expect(sql).toMatch(/a\.auth_user_id\s+is\s+null/i);
    expect(sql).toMatch(/not\s+exists[\s\S]*existing\.auth_user_id\s*=\s*u\.id/i);
    expect(sql).toMatch(/commit;/i);
  });

  it("目录、划拨和审核统一使用当前有效教练关系而不是 coach 白名单播种", () => {
    for (const name of ["admin_get_coach_directory", "allocate_codes_to_coach", "admin_review_box_code_activation_v2"]) {
      const body = functionBody(name);
      expect(body).toMatch(/public\.user_coach_relation/i);
      expect(body).toMatch(/valid_to\s+is\s+null/i);
      expect(body).not.toMatch(/a\.role\s*=\s*'coach'/i);
    }
    expect(functionBody("allocate_codes_to_coach")).not.toMatch(/if\s+not\s+exists\s*\(\s*select\s+1\s+from\s+auth\.users/i);
  });

  it("Admin 鉴权仍保留有效 admin 白名单且目录只输出必要字段", () => {
    const directory = functionBody("admin_get_coach_directory");
    expect(directory).toMatch(/a\.auth_user_id\s*=\s*v_auth_user_id/i);
    expect(directory).toMatch(/a\.role\s*=\s*'admin'/i);
    expect(directory).toMatch(/a\.is_active/i);
    expect(directory).toMatch(/join\s+auth\.users\s+u/i);
    expect(directory).toMatch(/returns\s+table\s*\(\s*coach_id\s+uuid\s*,\s*email\s+text\s*\)/i);
    expect(directory).not.toMatch(/height|weight|records|phone|wechat/i);
  });

  it("云仓从 Vault 读取 pepper 并在缺失时抛出独立错误码", () => {
    const inventory = functionBody("get_my_code_inventory");
    expect(inventory).toMatch(/select\s+decrypted_secret\s+into\s+v_pepper\s+from\s+vault\.decrypted_secrets\s+where\s+name\s*=\s*'box_code_pepper'/i);
    expect(inventory).toMatch(/BOX_CODE_PEPPER_NOT_CONFIGURED/i);
    expect(inventory).not.toMatch(/current_setting\(\s*'app\.box_code_pepper'/i);
    expect(inventory).toMatch(/b\.coach_id\s*=\s*v_auth_user_id/i);
    expect(inventory).toMatch(/b\.state\s*=\s*'unused'/i);
  });
});
