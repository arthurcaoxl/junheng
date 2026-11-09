import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = resolve(process.cwd(), "../../services/supabase/migrations/20261109157000_coach_promotion.sql");
const sql = existsSync(path) ? readFileSync(path, "utf8") : "";

function functionBody(name: string): string {
  return sql.match(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}[\\s\\S]*?\\$function\\$;`, "i"))?.[0] ?? "";
}

// 静态检查只补充迁移契约；真实状态、权限与并发以 PostgreSQL Docker 测试为准。
describe("coach promotion migration contract (static only)", () => {
  it("ships the server-side state archive and controlled RPCs", () => {
    expect(existsSync(path)).toBe(true);
    expect(sql).toMatch(/create table public\.coach_promotions/i);
    expect(sql).toMatch(/promotion_pending[\s\S]*promotion_rejected[\s\S]*probational_coach[\s\S]*coach/i);
    expect(sql).toMatch(/coach_promotions_one_pending/i);
    expect(sql).toMatch(/coach_promotions_one_current/i);
    for (const name of ["request_coach_promotion", "admin_review_coach_promotion", "get_my_coach_promotion"]) {
      expect(functionBody(name)).toMatch(/auth\.uid\(\)/i);
      expect(functionBody(name)).toMatch(/security definer/i);
      expect(functionBody(name)).toMatch(/set search_path = public, pg_temp/i);
    }
  });

  it("seeds final values but reads thresholds from SystemConfig at runtime", () => {
    expect(sql).toMatch(/'coach_promotion_required_checkins'\s*,\s*'21'::jsonb/i);
    expect(sql).toMatch(/'probational_coach_required_recruits'\s*,\s*'8'::jsonb/i);
    expect(functionBody("request_coach_promotion")).toMatch(/coach_promotion_config\(/i);
    expect(functionBody("coach_promotion_effective_checkin_days")).toMatch(/checkin_daily_claims/i);
    expect(functionBody("admin_review_coach_promotion")).toMatch(/coach_promotion_effective_checkin_days/i);
    expect(functionBody("evaluate_coach_promotion")).toMatch(/coach_promotion_real_recruit_count/i);
  });

  it("uses relation-triggered atomic promotion and preserves coach SSOT", () => {
    expect(sql).toMatch(/create trigger user_coach_relation_promotion_eval/i);
    expect(functionBody("evaluate_coach_promotion")).toMatch(/pg_advisory_xact_lock/i);
    expect(functionBody("evaluate_coach_promotion")).toMatch(/for update/i);
    expect(functionBody("evaluate_coach_promotion")).toMatch(/insert into public\.camp_admins/i);
    expect(functionBody("evaluate_coach_promotion")).toMatch(/coach_promotion_promoted/i);
    expect(functionBody("evaluate_coach_promotion")).not.toMatch(/insert into public\.coach_lifecycles/i);
  });

  it("puts probational guards inside privileged RPCs before Vault access", () => {
    for (const name of ["get_my_code_inventory", "coach_push_code_v1", "request_coach_restock_v1", "allocate_codes_to_coach", "generate_platform_codes"]) {
      expect(functionBody(name)).toMatch(/coach_promotion_is_probational/i);
    }
    const inventory = functionBody("get_my_code_inventory");
    expect(inventory.indexOf("coach_promotion_is_probational")).toBeLessThan(inventory.indexOf("vault.decrypted_secrets"));
    expect(functionBody("get_coach_camp_trends_v1")).toMatch(/v_is_probational/i);
    expect(functionBody("get_coach_camp_trends_v1")).toMatch(/v_scope = 'all'[\s\S]*FORBIDDEN/i);
  });
});
