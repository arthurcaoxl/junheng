import { describe, expect, it } from "vitest";
import sql from "../../../../services/supabase/migrations/20261107120000_verify_checkin.sql?raw";

describe("verify_checkin SQL 防刷契约", () => {
  it("为盒码增加配置默认值并兼容历史码零消耗", () => {
    expect(sql).toMatch(/add column if not exists max_checkins integer/i);
    expect(sql).toMatch(/add column if not exists used_checkins integer/i);
    expect(sql).toMatch(/add column if not exists box_spec text/i);
    expect(sql).toMatch(/max_checkins_per_box/i);
    expect(sql).toMatch(/default_box_spec/i);
    expect(sql).toMatch(/set default 21/i);
    expect(sql).toMatch(/set default '21_bags'/i);
    expect(sql).toMatch(/used_checkins\s*=\s*0/i);
  });

  it("用码行 FOR UPDATE 锁串行化校验和扣次", () => {
    expect(sql).toMatch(/from\s+public\.box_codes\s+b/i);
    expect(sql).toMatch(/for\s+update\s+of\s+b/i);
    expect(sql).toMatch(/used_checkins\s*=\s*v_code\.used_checkins\s*\+\s*1/i);
  });

  it("非 active 和额度耗尽均 fail-closed 抛出错误", () => {
    expect(sql).toMatch(/v_code\.state\s*<>\s*'active'/i);
    expect(sql).toMatch(/raise\s+exception\s+'CHECKIN_NOT_ACTIVE'/i);
    expect(sql).toMatch(/v_code\.used_checkins\s*>=\s*v_code\.max_checkins/i);
    expect(sql).toMatch(/raise\s+exception\s+'CHECKIN_QUOTA_EXHAUSTED'/i);
  });

  it("以 Asia\/Shanghai 物理日唯一记录保证同日只扣一次", () => {
    expect(sql).toMatch(/Asia\/Shanghai/);
    expect(sql).toMatch(/primary\s+key\s*\(code_id,\s*physical_day\)/i);
    expect(sql).toMatch(/on\s+conflict\s*\(code_id,\s*physical_day\)\s+do\s+nothing/i);
    expect(sql).toMatch(/'idempotent',\s*true/i);
  });

  it("扣次、快照和 CheckinVerified 审计在同一 RPC 内完成", () => {
    expect(sql).toMatch(/update\s+public\.checkin_sync/i);
    expect(sql).toMatch(/insert\s+into\s+public\.box_code_events/i);
    expect(sql).toMatch(/'CheckinVerified'/i);
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.verify_checkin/i);
  });

  it("只向 authenticated 开放打卡与只读额度 RPC", () => {
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.get_checkin_quota\(\)/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.verify_checkin\(date,\s*jsonb,\s*numeric,\s*numeric\)\s+to\s+authenticated/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.get_checkin_quota\(\)\s+to\s+authenticated/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.system_configs\s+from\s+anon,\s*authenticated/i);
  });

  it("历史回填满足版本触发器且直写保护不会被空设置绕过", () => {
    expect(sql).toMatch(/set used_checkins = 0,\s*version = version \+ 1/i);
    expect(sql).toMatch(/coalesce\(current_setting\('app\.checkin_quota_verified', true\), ''\)\s*<>\s*'on'/i);
  });
});
