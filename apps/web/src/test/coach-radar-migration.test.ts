import { describe, expect, it } from "vitest";
import sql from "../../../../services/supabase/migrations/20261106160000_get_coach_radar_v1.sql?raw";

function radarReturnColumns(): string[] {
  const match = sql.match(/create\s+or\s+replace\s+function\s+public\.get_coach_radar_v1\(\)\s*returns\s+table\s*\(([\s\S]*?)\)\s*language\s+plpgsql/i);
  if (!match) return [];
  return match[1].split(",").map((column) => column.trim().split(/\s+/)[0]);
}

describe("get_coach_radar_v1 SQL 契约", () => {
  it("迁移存在且雷达严格返回五个脱敏字段", () => {
    expect(radarReturnColumns()).toEqual([
      "camper_code",
      "weight_delta",
      "waist_delta",
      "bmi",
      "alert_level",
    ]);
  });

  it("以当前教练关系为驱动并 LEFT JOIN 云端快照，无打卡营员不会丢失", () => {
    expect(sql).toMatch(/from\s+public\.user_coach_relation/i);
    expect(sql).toMatch(/left\s+join\s+public\.checkin_sync/i);
    expect(sql).toMatch(/left\s+join\s+lateral\s+jsonb_each/i);
    expect(sql).toMatch(/r\.valid_to\s+is\s+null/i);
  });

  it("使用 ROW_NUMBER 分别选取唯一最新体重、腰围和有效打卡", () => {
    const rankingCount = sql.match(/row_number\s*\(\s*\)\s*over\s*\(/gi) ?? [];
    expect(rankingCount.length).toBeGreaterThanOrEqual(5);
    expect(sql).toMatch(/partition\s+by\s+record_days\.auth_user_id\s+order\s+by\s+record_days\.record_date\s+desc/i);
    expect(sql).toMatch(/where\s+ranked\.rn\s*=\s*1/i);
  });

  it("只从 auth.uid 和有效角色确定教练可见范围", () => {
    expect(sql).toMatch(/auth\.uid\(\)/i);
    expect(sql).toMatch(/camp_admins/i);
    expect(sql).toMatch(/v_role\s*=\s*'coach'\s+and\s+r\.referrer_id\s*=\s*v_auth_user_id/i);
    expect(sql).toMatch(/v_role\s*=\s*'admin'/i);
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*public,\s*pg_temp/i);
  });

  it("差值、BMI 与代表体重沿用存储契约", () => {
    expect(sql).toMatch(/initial_weight_kg/i);
    expect(sql).toMatch(/height_cm/i);
    expect(sql).toMatch(/0\.6/);
    expect(sql).toMatch(/0\.2/);
    expect(sql).toMatch(/20/);
    expect(sql).toMatch(/clothes/i);
  });

  it("在 Asia/Shanghai 自然日下计算红黄绿，从未打卡为红灯", () => {
    expect(sql).toMatch(/Asia\/Shanghai/);
    expect(sql).toMatch(/latest_activity\.record_date\s+is\s+null\s+then\s+'red'/i);
    expect(sql).toMatch(/>=\s*3\s+then\s+'red'/i);
    expect(sql).toMatch(/=\s*2\s+then\s+'yellow'/i);
    expect(sql).toMatch(/else\s+'green'/i);
  });

  it("雷达只授权 authenticated，辅助函数不对客户端开放", () => {
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.get_coach_radar_v1\(\)\s+from\s+public,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.get_coach_radar_v1\(\)\s+to\s+authenticated/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.coach_radar_representative_weight\(jsonb\)/i);
  });

  it("提供不伪造 expectedVersion 的激活适配并复用十点四原 RPC", () => {
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.activate_box_code\(\s*p_code\s+text,\s*p_idempotency_key\s+text\s*\)/i);
    expect(sql).toMatch(/public\.activate_box_code\(\s*p_code,\s*v_code_expected_version,\s*v_activation_expected_version,\s*p_idempotency_key\s*\)/i);
    expect(sql).toMatch(/result->>'codeVersion'/i);
    expect(sql).toMatch(/result->>'activationVersion'/i);
  });
});
