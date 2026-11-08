import { describe, expect, it } from "vitest";
import sql from "../../../../services/supabase/migrations/20261108120000_code_pool_inventory.sql?raw";

function migrationSql(): string {
  return sql;
}

describe("码池与云库存 SQL 契约", () => {
  it("先播种 coach_restock_point=12 且保留既有配置", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/insert\s+into\s+public\.system_configs[\s\S]*'coach_restock_point'[\s\S]*'12'::jsonb/i);
    expect(sql).toMatch(/on\s+conflict\s*\(config_key\)\s+do\s+nothing/i);
  });

  it("建立教练库存和含线下凭证号的追加流水并关闭客户端表权限", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create\s+table\s+public\.coach_inventory/i);
    expect(sql).toMatch(/available_count\s+integer[\s\S]*check\s*\(available_count\s*>=\s*0\)/i);
    expect(sql).toMatch(/create\s+table\s+public\.inventory_logs/i);
    expect(sql).toMatch(/offline_receipt_no\s+text/i);
    expect(sql).toMatch(/operator_id\s+uuid\s+not\s+null/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.coach_inventory\s+from\s+anon,\s*authenticated/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.inventory_logs\s+from\s+anon,\s*authenticated/i);
  });

  it("教练越权调用生成 RPC 时被服务端 admin 白名单 FORBIDDEN 拦截", () => {
    const sql = migrationSql();
    const generate = sql.match(/create\s+or\s+replace\s+function\s+public\.generate_platform_codes[\s\S]*?\$function\$;/i)?.[0] ?? "";
    expect(generate).toMatch(/from\s+public\.camp_admins/i);
    expect(generate).toMatch(/a\.auth_user_id\s*=\s*v_auth_user_id/i);
    expect(generate).toMatch(/a\.role\s*=\s*'admin'/i);
    expect(generate).toMatch(/a\.is_active/i);
    expect(generate).toMatch(/raise\s+exception\s+'FORBIDDEN'/i);
    expect(generate.indexOf("FORBIDDEN")).toBeLessThan(generate.search(/insert\s+into\s+public\.box_codes/i));
  });

  it("生成码显式读取配置快照并强制线下凭证而不依赖列默认值", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/config_key\s*=\s*'max_checkins_per_box'[\s\S]*for\s+update/i);
    expect(sql).toMatch(/config_key\s*=\s*'default_box_spec'[\s\S]*for\s+update/i);
    expect(sql).toMatch(/max_checkins[\s\S]*box_spec[\s\S]*code_ciphertext/i);
    expect(sql).toMatch(/v_max_checkins/i);
    expect(sql).toMatch(/v_box_spec/i);
    expect(sql).toMatch(/nullif\(btrim\(p_offline_receipt_no\),\s*''\)\s+is\s+null/i);
    expect(sql).toMatch(/OFFLINE_RECEIPT_REQUIRED/i);
  });

  it("生成与划拨均写台账且划拨锁定平台码行防止超发", () => {
    const sql = migrationSql();
    const allocate = sql.match(/create\s+or\s+replace\s+function\s+public\.allocate_codes_to_coach[\s\S]*?\$function\$;/i)?.[0] ?? "";
    expect(sql).toMatch(/'platform_generated'/i);
    expect(allocate).toMatch(/'FORBIDDEN'/i);
    expect(allocate).toMatch(/inventory_status\s*=\s*'platform'/i);
    expect(allocate).toMatch(/for\s+update\s+skip\s+locked/i);
    expect(allocate).toMatch(/INVENTORY_INSUFFICIENT/i);
    expect(allocate).toMatch(/update\s+public\.coach_inventory/i);
    expect(allocate).toMatch(/'coach_allocated'/i);
  });

  it("激活同事务锁定并扣减教练库存且留激活流水", () => {
    const sql = migrationSql();
    const activate = sql.match(/create\s+or\s+replace\s+function\s+public\.activate_box_code[\s\S]*?\$function\$;/i)?.[0] ?? "";
    expect(activate).toMatch(/from\s+public\.coach_inventory[\s\S]*for\s+update/i);
    expect(activate).toMatch(/available_count\s*<\s*1/i);
    expect(activate).toMatch(/available_count\s*=\s*available_count\s*-\s*1/i);
    expect(activate).toMatch(/'code_activated'/i);
  });

  it("教练码库只解本人未激活码且不向客户端开放密文列", () => {
    const sql = migrationSql();
    const inventory = sql.match(/create\s+or\s+replace\s+function\s+public\.get_my_code_inventory[\s\S]*?\$function\$;/i)?.[0] ?? "";
    expect(inventory).toMatch(/b\.coach_id\s*=\s*v_auth_user_id/i);
    expect(inventory).toMatch(/b\.state\s*=\s*'unused'/i);
    expect(inventory).toMatch(/b\.inventory_status\s*=\s*'coach'/i);
    expect(inventory).toMatch(/pgp_sym_decrypt/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.box_codes\s+from\s+anon,\s*authenticated/i);
  });
});
