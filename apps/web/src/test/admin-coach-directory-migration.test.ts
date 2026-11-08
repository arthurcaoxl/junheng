import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = resolve(process.cwd(), "../../services/supabase/migrations/20261108230000_admin_coach_directory.sql");
const sql = existsSync(path) ? readFileSync(path, "utf8") : "";

describe("Admin 教练目录与审核归属 SQL 契约", () => {
  it("教练目录只返回 coach_id 和 email，并限制搜索范围与数量", () => {
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.admin_get_coach_directory\(\s*p_query\s+text\s*\)/i);
    expect(sql).toMatch(/returns\s+table\s*\(\s*coach_id\s+uuid\s*,\s*email\s+text\s*\)/i);
    expect(sql).toMatch(/a\.role\s*=\s*'coach'/i);
    expect(sql).toMatch(/a\.email\s+ilike/i);
    expect(sql).toMatch(/limit\s+10/i);
  });

  it("目录 RPC 强制 auth.uid 是有效 admin，不接受前端声明角色", () => {
    expect(sql).toMatch(/auth\.uid\(\)/i);
    expect(sql).toMatch(/a\.auth_user_id\s*=\s*v_auth_user_id/i);
    expect(sql).toMatch(/a\.role\s*=\s*'admin'/i);
    expect(sql).toMatch(/a\.is_active/i);
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*public,\s*pg_temp/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.admin_get_coach_directory\(text\)\s+to\s+authenticated/i);
  });

  it("审核包装自动接收目标 coach UUID，并在服务端核对后调用原审核事务", () => {
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.admin_review_box_code_activation_v2/i);
    expect(sql).toMatch(/p_target_coach_id\s+uuid/i);
    expect(sql).toMatch(/b\.coach_id\s*=\s*p_target_coach_id/i);
    expect(sql).toMatch(/COACH_SELECTION_MISMATCH/i);
    expect(sql).toMatch(/return\s+public\.admin_review_box_code_activation\(/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.admin_review_box_code_activation_v2\(/i);
  });

  it("两个新 RPC 均不返回健康原始记录", () => {
    const directoryReturn = sql.match(/admin_get_coach_directory[\s\S]*?returns\s+table\s*\(([\s\S]*?)\)\s*language/i)?.[1] ?? "";
    expect(directoryReturn).not.toMatch(/height|weight|records|phone|wechat/i);
  });
});
