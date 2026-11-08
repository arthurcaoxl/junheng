import { describe, expect, it } from "vitest";
import sql from "../../../../services/supabase/migrations/20261108140000_activation_request_rate_limit.sql?raw";

function functionSql(name: string): string {
  return sql.match(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}[\\s\\S]*?\\$function\\$;`, "i"),
  )?.[0] ?? "";
}

describe("TASK-10.10 申请入口三维限流 SQL 契约", () => {
  it("单 IP 第 31 次拒绝：默认阈值 30 且到达阈值后的下一次返回 false", () => {
    const request = functionSql("request_box_code_activation");
    const attempt = functionSql("box_code_request_attempt_allowed");

    expect(sql).toMatch(/'activation_request_ip_rate_limit_per_minute'\s*,\s*'30'::jsonb/i);
    expect(request).toMatch(/config_key\s*=\s*'activation_request_ip_rate_limit_per_minute'/i);
    expect(request).toMatch(/box_code_request_attempt_allowed\(\s*'ip'\s*,\s*v_ip_hash\s*,\s*v_ip_rate_limit\s*\)/i);
    expect(attempt).toMatch(/failure_count\s*>=\s*p_max_attempts/i);
    expect(attempt.indexOf("failure_count >= p_max_attempts")).toBeLessThan(attempt.search(/failure_count\s*=\s*v_guard\.failure_count\s*\+\s*1/i));
    expect(attempt).toMatch(/interval\s*'1 minute'/i);
  });

  it("单设备第 4 次拒绝：默认阈值 3 且设备维使用同一分钟窗口", () => {
    const request = functionSql("request_box_code_activation");
    const attempt = functionSql("box_code_request_attempt_allowed");

    expect(sql).toMatch(/'activation_request_device_rate_limit_per_minute'\s*,\s*'3'::jsonb/i);
    expect(request).toMatch(/config_key\s*=\s*'activation_request_device_rate_limit_per_minute'/i);
    expect(request).toMatch(/box_code_request_attempt_allowed\(\s*'device'\s*,\s*v_device_hash\s*,\s*v_device_rate_limit\s*\)/i);
    expect(attempt).toMatch(/scope_type[\s\S]*p_scope_type/i);
    expect(attempt).toMatch(/window_started_at/i);
  });

  it("共享 IP 下 10 台设备各 2 次只累计 IP 桶，不互相占用设备桶", () => {
    const request = functionSql("request_box_code_activation");

    expect(request).toMatch(/v_trusted_ip[\s\S]*hmac\(v_trusted_ip\s*,\s*v_pepper\s*,\s*'sha256'\)/i);
    expect(request).toMatch(/hmac\(p_device_hash\s*,\s*v_pepper\s*,\s*'sha256'\)/i);
    expect(sql).toMatch(/box_code_attempt_guards/i);
    expect(functionSql("box_code_request_attempt_allowed")).toMatch(/where\s+scope_type\s*=\s*p_scope_type\s+and\s+scope_hash\s*=\s*p_scope_hash/i);
  });

  it("取不到受信 IP 只跳过 IP 维，同设备第 4 次仍被设备维拒绝", () => {
    const request = functionSql("request_box_code_activation");
    const ipGuard = request.match(/if\s+v_ip_hash\s+is\s+not\s+null\s+then[\s\S]*?end\s+if;/i)?.[0] ?? "";

    expect(request).toMatch(/current_setting\('app\.trusted_client_ip',\s*true\)/i);
    expect(ipGuard).toMatch(/box_code_request_attempt_allowed\(\s*'ip'/i);
    expect(ipGuard).not.toMatch(/box_code_request_attempt_allowed\(\s*'device'/i);
    expect(request).toMatch(/box_code_request_attempt_allowed\(\s*'device'\s*,\s*v_device_hash\s*,\s*v_device_rate_limit\s*\)/i);
    expect(request).toMatch(/v_device_allowed[\s\S]*v_ip_allowed[\s\S]*TOO_MANY_ATTEMPTS/i);
  });

  it("SystemConfig 阈值改为 1 后第 2 次即拒绝，逻辑代码无 30/3 兜底", () => {
    const request = functionSql("request_box_code_activation");
    const attempt = functionSql("box_code_request_attempt_allowed");

    expect(request).toMatch(/config_value\s*#>>\s*'\{\}'/i);
    expect(request).toMatch(/v_ip_rate_limit\s+is\s+null[\s\S]*v_device_rate_limit\s+is\s+null/i);
    expect(request).toMatch(/SYSTEM_CONFIG_MISSING/i);
    expect(request).not.toMatch(/coalesce\([^)]*,\s*(30|3)\s*\)/i);
    expect(attempt).toMatch(/p_max_attempts\s+integer/i);
    expect(attempt).not.toMatch(/\b(30|3)\b/);
  });

  it("既有 auth_user 维仍调用原防护函数且不重新定义既有安全实现", () => {
    const request = functionSql("request_box_code_activation");

    expect(request).toMatch(/box_code_attempt_allowed\(\s*'auth_user'\s*,\s*v_actor_hash\s*\)/i);
    expect(request).toMatch(/box_code_note_failure\(\s*'auth_user'\s*,\s*v_actor_hash\s*\)/i);
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.box_code_attempt_allowed/i);
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.box_code_note_failure/i);
  });

  it("设备只以散列入桶，旧两参 RPC 被移除且新入口只对 authenticated 开放", () => {
    const request = functionSql("request_box_code_activation");

    expect(sql).toMatch(/drop\s+function\s+public\.request_box_code_activation\(text,\s*text\)/i);
    expect(sql).toMatch(/scope_type\s+in\s*\('auth_user',\s*'ip',\s*'device'\)/i);
    expect(request).toMatch(/p_device_hash\s+text/i);
    expect(request).toMatch(/DEVICE_FINGERPRINT_REQUIRED/i);
    expect(request).not.toMatch(/insert\s+into[\s\S]*p_device_hash/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.request_box_code_activation\(text,\s*text,\s*text\)\s+from\s+public,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.request_box_code_activation\(text,\s*text,\s*text\)\s+to\s+authenticated/i);
  });
});
