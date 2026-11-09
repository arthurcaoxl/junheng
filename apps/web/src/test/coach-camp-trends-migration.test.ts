import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = resolve(process.cwd(), "../../services/supabase/migrations/20261109153000_coach_camp_trends.sql");
const sql = existsSync(path) ? readFileSync(path, "utf8") : "";

function functionBody(name: string): string {
  return sql.match(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}[\\s\\S]*?\\$function\\$;`, "i"))?.[0] ?? "";
}

const trends = functionBody("get_coach_camp_trends_v1");

// 这些用例只做迁移静态契约校验；没有数据库时不能据此宣称 RPC 行为已执行验证。
describe("coach camp trends RPC migration contract (static only)", () => {
  it(" exposes exactly the 21-point aggregate fields and no identity or raw-record columns", () => {
    const columns = trends.match(/returns\s+table\s*\(([\s\S]*?)\)\s*language/i)?.[1] ?? "";
    expect(columns.split(",").map((column) => column.trim().split(/\s+/).slice(0, 2).join(" "))).toEqual([
      "day_index integer",
      "participants integer",
      "weight_samples integer",
      "waist_samples integer",
      "avg_weight_change_percent numeric",
      "avg_waist_change_percent numeric",
      "meal_completion_rate numeric",
      "water_rate numeric",
      "movement_rate numeric",
      "sleep_rate numeric",
    ]);
    expect(columns).not.toMatch(/auth_user_id|email|user_code|camper_code|record_date|start_date|records|coach_id|referrer_id/i);
    expect(trends).toMatch(/p_scope\s+text/i);
    expect(trends).toMatch(/order\s+by\s+days\.day_index/i);
  });

  it("allows authenticated Admin/coach all and keeps staff and ordinary users out", () => {
    expect(trends).toMatch(/v_auth_user_id\s+uuid\s*:=\s*auth\.uid\(\)/i);
    expect(trends).toMatch(/v_auth_user_id\s+is\s+null[\s\S]*UNAUTHORIZED/i);
    expect(trends).toMatch(/a\.auth_user_id\s*=\s*v_auth_user_id/i);
    expect(trends).toMatch(/a\.is_active/i);
    expect(trends).toMatch(/v_role\s+not\s+in\s*\(\s*'admin'\s*,\s*'coach'\s*\)/i);
    expect(trends).not.toMatch(/v_scope\s*=\s*'all'\s+and\s+v_role\s*<>/i);
    expect(trends).toMatch(/p_scope\s+is\s+null\s+or\s+p_scope\s+not\s+in\s*\(\s*'own'\s*,\s*'all'\s*\)/i);
    expect(trends).toMatch(/INVALID_SCOPE/i);
    expect(trends).not.toMatch(/staff_coach_assignment/i);
  });

  it("filters own by the caller's current coach relation and gives both allowed roles stack-wide all", () => {
    expect(trends).toMatch(/from\s+public\.checkin_sync\s+c/i);
    expect(trends).toMatch(/where\s*\(\s*v_scope\s*=\s*'all'\s*\)\s*or\s*\(/i);
    expect(trends).toMatch(/exists\s*\(\s*select\s+1\s+from\s+public\.user_coach_relation\s+r/i);
    expect(trends).toMatch(/r\.auth_user_id\s*=\s*c\.auth_user_id/i);
    expect(trends).toMatch(/r\.referrer_id\s*=\s*v_auth_user_id/i);
    expect(trends).toMatch(/r\.valid_to\s+is\s+null/i);
    expect(trends).toMatch(/v_scope\s*=\s*'own'/i);
  });

  it("aligns every camper to D1-D21 and excludes out-of-window values and baselines", () => {
    expect(trends).toMatch(/generate_series\s*\(\s*1\s*,\s*21\s*\)/i);
    expect(trends).toMatch(/record_date\s+between\s+parsed\.start_date\s+and\s+parsed\.start_date\s*\+\s*20/i);
    expect(trends).toMatch(/parsed\.record_date\s*-\s*parsed\.start_date\s*\+\s*1/i);
    expect(trends).toMatch(/partition\s+by\s+record_days\.auth_user_id[\s\S]*order\s+by\s+record_days\.record_date\s+asc/i);
    expect(trends).toMatch(/public\.coach_radar_representative_weight\s*\(\s*raw\.day\s*\)/i);
    expect(trends).toMatch(/left\s+join\s+aggregated\s+a\s+on\s+a\.day_index\s*=\s*days\.day_index/i);
  });

  it("returns zero counts and null metrics for empty samples with independent metric denominators", () => {
    expect(trends).toMatch(/coalesce\s*\(\s*a\.participants\s*,\s*0\s*\)::integer/i);
    expect(trends).toMatch(/coalesce\s*\(\s*a\.weight_samples\s*,\s*0\s*\)::integer/i);
    expect(trends).toMatch(/coalesce\s*\(\s*a\.waist_samples\s*,\s*0\s*\)::integer/i);
    expect(trends).toMatch(/count\s*\(\s*\*\s*\)\s*filter\s*\(\s*where\s+rd\.has_content\s*\)/i);
    expect(trends).toMatch(/weight_samples/i);
    expect(trends).toMatch(/waist_samples/i);
    expect(trends).toMatch(/case\s+when\s+coalesce\s*\(\s*a\.participants\s*,\s*0\s*\)\s*=\s*0\s+then\s+null/i);
    expect(trends).toMatch(/round\s*\(\s*avg\s*\(\s*rd\.weight_change_percent\s*\)\s*,\s*1\s*\)/i);
    expect(trends).toMatch(/round\s*\(\s*avg\s*\(\s*rd\.waist_change_percent\s*\)\s*,\s*1\s*\)/i);
  });

  it("is STABLE, read-only, definer-safe and granted only to authenticated callers", () => {
    expect(trends).toMatch(/language\s+plpgsql\s+stable\s+security\s+definer\s+set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
    expect(trends).not.toMatch(/\b(insert|update|delete|merge|truncate)\s+into\b|\bdelete\s+from\b|\bfor\s+update\b/i);
    expect(trends).not.toMatch(/auth\.jwt|auth\.users/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.get_coach_camp_trends_v1\(text\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.get_coach_camp_trends_v1\(text\)\s+to\s+authenticated/i);
    expect(sql).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.get_coach_camp_trends_v1\(text\)\s+to\s+(public|anon)/i);
  });
});
