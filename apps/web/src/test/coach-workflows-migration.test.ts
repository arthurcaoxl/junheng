import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 禁止连接数据库，因此本文件只做源码级物理契约检查，不冒充 SQL 行为测试。
const migrationPath = resolve(process.cwd(), "../..", "services/supabase/migrations/20261109120000_coach_workflows.sql");
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

function functionSection(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}`);
  if (start < 0) return "";
  const end = sql.indexOf("\n$function$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end);
}

describe("TASK-10.12 模块二迁移静态契约", () => {
  it("迁移存在，新增表启用 RLS 且浏览器无直接表权限", () => {
    expect(existsSync(migrationPath)).toBe(true);
    for (const table of ["coach_camper_followups", "coach_restock_requests"]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on public.${table} from anon, authenticated`);
    }
  });

  it("本人列表只由 auth.uid 当前关系驱动，并在 SQL 计算窗口活跃口径", () => {
    const section = functionSection("get_coach_campers_v1");
    expect(section).toContain("auth.uid()");
    expect(section).toContain("r.referrer_id = v_auth_user_id");
    expect(section).toContain("r.valid_to is null");
    expect(section).toContain("activity_status");
    expect(section).toContain("new_registered");
    expect(section).toContain("jsonb_each");
    expect(section).not.toContain("p_coach_id");
  });

  it("备注读写分别约束本人当前关系或有效 admin，并校验乐观版本", () => {
    for (const name of ["set_coach_camper_followup_v1", "admin_set_camper_followup_v1"]) {
      const section = functionSection(name);
      expect(section).toContain("p_expected_version");
      expect(section).toContain("FOLLOWUP_VERSION_CONFLICT");
      expect(section).toContain("auth.uid()");
    }
    expect(functionSection("set_coach_camper_followup_v1")).toContain("r.referrer_id = v_auth_user_id");
    expect(functionSection("admin_set_camper_followup_v1")).toContain("a.role = 'admin'");
  });

  it("补货申请只在本人零可用且无 unused 码时创建，Admin 才能读取与关闭", () => {
    const request = functionSection("request_coach_restock_v1");
    expect(request).toContain("available_count = 0");
    expect(request).toContain("state = 'unused'");
    expect(request).toContain("RESTOCK_NOT_EMPTY");
    expect(functionSection("admin_get_coach_restock_requests_v1")).toContain("a.role = 'admin'");
    expect(functionSection("admin_resolve_coach_restock_request_v1")).toContain("RESTOCK_NOT_FULFILLED");
    expect(sql).toContain("coach_restock_requests_one_pending");
  });

  it("直推锁定本人 unused 码和本人当前营员，只进入人工审核而不扣库存", () => {
    const section = functionSection("coach_push_code_v1");
    expect(section).toContain("for update");
    expect(section).toContain("b.coach_id = v_auth_user_id");
    expect(section).toContain("b.inventory_status = 'coach'");
    expect(section).toContain("b.state = 'unused'");
    expect(section).toContain("r.referrer_id = v_auth_user_id");
    expect(section).toContain("r.valid_to is null");
    expect(section).toContain("vault.decrypted_secrets");
    expect(section).toContain("'pending_review'");
    expect(section).toContain("'CodeActivationRequested'");
    expect(section).toContain("p_idempotency_key");
    expect(section).not.toContain("coach_inventory");
    expect(section).not.toContain("available_count = available_count - 1");
    expect(section).not.toContain("state = 'active'");
  });

  it("新增 RPC 撤销公共权限，只授权 authenticated，秘密不写入迁移", () => {
    expect(sql).toContain("grant execute on function public.coach_push_code_v1(uuid, uuid, text) to authenticated");
    expect(sql).toContain("revoke all on function public.get_coach_campers_v1() from public, anon, authenticated");
    expect(sql).not.toMatch(/service_role|box_code_pepper\s*:=\s*'[^']+'/i);
  });
});
