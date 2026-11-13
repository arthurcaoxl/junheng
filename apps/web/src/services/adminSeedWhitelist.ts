import { getSupabase } from "../lib/supabase";

export type SeedWhitelistSnapshot = {
  configExists: boolean;
  emails: string[];
  updatedAt: string | null;
};

export type SeedWhitelistMutation = SeedWhitelistSnapshot & {
  changed: boolean;
  reason: string | null;
  auditId: string | null;
  auditedAt: string | null;
};

const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function normalizeSeedWhitelistEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidSeedWhitelistEmail(email: string): boolean {
  const normalized = normalizeSeedWhitelistEmail(email);
  return normalized.length >= 3
    && normalized.length <= 254
    && !normalized.includes("..")
    && EMAIL_PATTERN.test(normalized);
}

function rpcError(error: unknown): Error {
  const value = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const diagnostic = [value?.code, value?.message, value?.details, value?.hint].filter(Boolean).join(" ");
  if (value?.code === "40001" || /40001|SEED_USER_WHITELIST_VERSION_CONFLICT/i.test(diagnostic)) {
    return new Error("数据已过期，请刷新重试");
  }
  if (/UNAUTHORIZED|FORBIDDEN|42501/i.test(diagnostic)) {
    return new Error("当前账号没有白名单管理权限。");
  }
  if (/SEED_USER_WHITELIST_CONFIG_INVALID/i.test(diagnostic)) {
    return new Error("白名单配置格式异常，已停止写入，请联系管理员检查。");
  }
  if (/INVALID_EMAIL/i.test(diagnostic)) return new Error("请输入有效邮箱。");
  return new Error("白名单操作失败，请稍后重试。");
}

function parseSnapshot(data: unknown): SeedWhitelistSnapshot {
  const value = data as Record<string, unknown> | null;
  if (
    value?.ok !== true
    || typeof value.configExists !== "boolean"
    || !Array.isArray(value.emails)
    || !value.emails.every((email) => typeof email === "string")
    || !(typeof value.updatedAt === "string" || value.updatedAt === null)
  ) throw new Error("白名单返回格式异常。");
  return {
    configExists: value.configExists,
    emails: [...value.emails] as string[],
    updatedAt: value.updatedAt,
  };
}

function parseMutation(data: unknown): SeedWhitelistMutation {
  const snapshot = parseSnapshot(data);
  const value = data as Record<string, unknown>;
  if (
    typeof value.changed !== "boolean"
    || !(typeof value.reason === "string" || value.reason === null)
    || !(typeof value.auditId === "string" || value.auditId === null)
    || !(typeof value.auditedAt === "string" || value.auditedAt === null)
  ) throw new Error("白名单写入返回格式异常。");
  return {
    ...snapshot,
    changed: value.changed,
    reason: value.reason,
    auditId: value.auditId,
    auditedAt: value.auditedAt,
  };
}

export async function fetchSeedWhitelist(): Promise<SeedWhitelistSnapshot> {
  const { data, error } = await getSupabase().rpc("admin_get_seed_user_whitelist");
  if (error) throw rpcError(error);
  return parseSnapshot(data);
}

export async function addSeedWhitelistEmail(
  email: string,
  expected: SeedWhitelistSnapshot,
): Promise<SeedWhitelistMutation> {
  const normalized = normalizeSeedWhitelistEmail(email);
  if (!isValidSeedWhitelistEmail(normalized)) throw new Error("请输入有效邮箱。");
  const { data, error } = await getSupabase().rpc("admin_add_seed_user_whitelist_email", {
    p_email: normalized,
    p_expected_config_exists: expected.configExists,
    p_expected_updated_at: expected.updatedAt,
  });
  if (error) throw rpcError(error);
  return parseMutation(data);
}

export async function removeSeedWhitelistEmail(
  email: string,
  expected: SeedWhitelistSnapshot,
): Promise<SeedWhitelistMutation> {
  const normalized = normalizeSeedWhitelistEmail(email);
  if (!isValidSeedWhitelistEmail(normalized)) throw new Error("请输入有效邮箱。");
  const { data, error } = await getSupabase().rpc("admin_remove_seed_user_whitelist_email", {
    p_email: normalized,
    p_expected_config_exists: expected.configExists,
    p_expected_updated_at: expected.updatedAt,
  });
  if (error) throw rpcError(error);
  return parseMutation(data);
}
