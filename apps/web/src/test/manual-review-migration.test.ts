import { describe, expect, it } from "vitest";
import sql from "../../../../services/supabase/migrations/20261108130000_manual_review_trusteeship.sql?raw";
import checkinMigrationSql from "../../../../services/supabase/migrations/20261107120000_verify_checkin.sql?raw";

function migrationSql(): string {
  return sql;
}

function functionSql(name: string): string {
  return migrationSql().match(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}[\\s\\S]*?\\$function\\$;`, "i"),
  )?.[0] ?? "";
}

describe("TASK-10.9 人工审核与托管 SQL 契约", () => {
  it("用户提交只创建 pending_review 申请，不提前绑教练或扣库存", () => {
    const request = functionSql("request_box_code_activation");
    expect(request).toMatch(/state\s*<>\s*'unused'/i);
    expect(request).toMatch(/state\s*=\s*'pending_review'/i);
    expect(request).toMatch(/insert\s+into\s+public\.code_activations/i);
    expect(request).toMatch(/review_state[\s\S]*'pending'/i);
    expect(request).not.toMatch(/insert\s+into\s+public\.user_coach_relation/i);
    expect(request).not.toMatch(/update\s+public\.coach_inventory/i);
  });

  it("pending_review 打卡仍由 CHECKIN_NOT_ACTIVE 物理拦截且不扣次", () => {
    const verify = checkinMigrationSql;
    expect(verify).toMatch(/if\s+v_code\.state\s*<>\s*'active'\s+then\s+raise\s+exception\s+'CHECKIN_NOT_ACTIVE'/i);
    expect(verify.indexOf("CHECKIN_NOT_ACTIVE")).toBeLessThan(verify.search(/used_checkins\s*=\s*v_code\.used_checkins\s*\+\s*1/i));
    expect(migrationSql()).toMatch(/pending_review/i);
  });

  it("越权审核在锁定或改写申请之前被 admin 白名单拦截", () => {
    const review = functionSql("admin_review_box_code_activation");
    expect(review).toMatch(/from\s+public\.camp_admins/i);
    expect(review).toMatch(/a\.auth_user_id\s*=\s*v_auth_user_id/i);
    expect(review).toMatch(/a\.role\s*=\s*'admin'/i);
    expect(review).toMatch(/a\.is_active/i);
    expect(review.indexOf("FORBIDDEN")).toBeLessThan(review.search(/for\s+update/i));
    expect(review.indexOf("FORBIDDEN")).toBeLessThan(review.search(/update\s+public\.code_activations/i));
  });

  it("审核通过核验线下凭证并原子推进 active、归属与审计", () => {
    const review = functionSql("admin_review_box_code_activation");
    expect(review).toMatch(/SHIPMENT_VERIFICATION_REQUIRED/i);
    expect(review).toMatch(/PAYMENT_VERIFICATION_REQUIRED/i);
    expect(review).toMatch(/state\s*=\s*'active'/i);
    expect(review).toMatch(/review_state\s*=\s*'approved'/i);
    expect(review).toMatch(/insert\s+into\s+public\.user_coach_relation/i);
    expect(review).toMatch(/insert\s+into\s+public\.audit_logs/i);
  });

  it("审核拒绝进入 revoked、记录原因并补发全新 unused 码", () => {
    const review = functionSql("admin_review_box_code_activation");
    expect(review).toMatch(/REJECTION_REASON_REQUIRED/i);
    expect(review).toMatch(/state\s*=\s*'revoked'/i);
    expect(review).toMatch(/review_state\s*=\s*'rejected'/i);
    expect(review).toMatch(/replacement_code_id/i);
    expect(review).toMatch(/gen_random_uuid\(\)/i);
    expect(review).toMatch(/'CodeReplacementIssued'/i);
  });

  it("批量托管只处理 dormant 教练且必须有人工确认", () => {
    const transfer = functionSql("admin_transfer_dormant_coaches");
    expect(transfer).toMatch(/p_confirmed\s+boolean/i);
    expect(transfer).toMatch(/MANUAL_CONFIRMATION_REQUIRED/i);
    expect(transfer).toMatch(/coach_lifecycles/i);
    expect(transfer).toMatch(/state\s*=\s*'dormant'/i);
    expect(transfer).toMatch(/for\s+update/i);
  });

  it("托管关闭原关系区间、新建平台关系并逐用户写 audit_logs", () => {
    const transfer = functionSql("admin_transfer_dormant_coaches");
    expect(transfer).toMatch(/valid_to\s*=\s*v_effective_at/i);
    expect(transfer).toMatch(/reason\s*=\s*'dormancy_trusteeship'/i);
    expect(transfer).toMatch(/insert\s+into\s+public\.user_coach_relation/i);
    expect(transfer).toMatch(/referrer_id[\s\S]*v_platform_id/i);
    expect(transfer).toMatch(/insert\s+into\s+public\.audit_logs/i);
    expect(transfer).toMatch(/v_relation\.auth_user_id/i);
    expect(transfer).toMatch(/v_relation\.referrer_id/i);
  });

  it("平台账号只读服务端配置且审计与生命周期表不对客户端开放", () => {
    const sql = migrationSql();
    const transfer = functionSql("admin_transfer_dormant_coaches");
    expect(transfer).toMatch(/platform_official_account_id/i);
    expect(transfer).not.toMatch(/p_platform_id/i);
    expect(sql).toMatch(/create\s+table\s+public\.audit_logs/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.audit_logs\s+from\s+anon,\s*authenticated/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.coach_lifecycles\s+from\s+anon,\s*authenticated/i);
    expect(sql).toMatch(/AUDIT_LOG_APPEND_ONLY/i);
  });
});
