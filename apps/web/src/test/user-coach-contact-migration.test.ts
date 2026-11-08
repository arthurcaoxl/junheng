import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "../../services/supabase/migrations/20261108224000_user_coach_contact.sql");
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("get_my_coach_contact_v1 SQL 契约", () => {
  it("提供独立受限的教练联系方式配置表", () => {
    expect(sql).toMatch(/create\s+table\s+public\.coach_contact_profiles/i);
    expect(sql).toMatch(/coach_id\s+uuid\s+primary\s+key\s+references\s+auth\.users/i);
    expect(sql).toMatch(/enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.coach_contact_profiles\s+from\s+anon,\s*authenticated/i);
  });

  it("只按 auth.uid 的当前有效归属返回手机号和微信号", () => {
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.get_my_coach_contact_v1\(\)/i);
    expect(sql).toMatch(/returns\s+table\s*\(\s*phone\s+text\s*,\s*wechat\s+text\s*\)/i);
    expect(sql).toMatch(/r\.auth_user_id\s*=\s*auth\.uid\(\)/i);
    expect(sql).toMatch(/r\.valid_to\s+is\s+null/i);
    expect(sql).toMatch(/r\.referrer_id\s*=\s*c\.coach_id/i);
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*public,\s*pg_temp/i);
  });

  it("只授权已登录用户执行，不返回健康原始记录", () => {
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.get_my_coach_contact_v1\(\)\s+from\s+public,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.get_my_coach_contact_v1\(\)\s+to\s+authenticated/i);
    const returns = sql.match(/returns\s+table\s*\(([\s\S]*?)\)\s*language/i)?.[1] ?? "";
    expect(returns).not.toMatch(/height|weight|records|auth_user_id|coach_id/i);
  });
});
