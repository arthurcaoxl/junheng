import { getSupabase } from "../lib/supabase";
import { readLocalConsent, writeLocalConsent } from "../utils/consent";

/** 云端授权表态：true=明确同意 / false=明确拒绝（含未授权建档的默认标记）/ null=从未表态。 */
export type CloudConsent = boolean | null;

/**
 * 查询用户云端授权表态，作为“总授权”拦截的唯一判据。
 * 匿名 session 未建立、或云端查询失败时，降级以本机留痕为准——
 * 保证老用户在本地已表态的情况下不被重复弹窗骚扰。
 */
export async function fetchCloudConsent(): Promise<CloudConsent> {
  const client = getSupabase();
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError) return readLocalConsent();
  const uid = session?.user.id;
  if (!uid) return readLocalConsent();

  const { data, error } = await client
    .from("checkin_sync")
    .select("consent_granted")
    .eq("auth_user_id", uid)
    .maybeSingle();
  if (error) return readLocalConsent();

  const granted = (data as { consent_granted?: unknown } | null)?.consent_granted;
  if (typeof granted === "boolean") return granted;
  // 云端从未表态：看本机是否有历史留痕（老版本授权过的用户直接承继）
  return readLocalConsent();
}

/**
 * 记录用户的明确表态（同意或拒绝，两者都必须留下痕迹，保证“绝不再弹”）。
 * 行已存在 → update（只碰 consent 三列，零约束风险）；
 * 行不存在 → insert 最小 consent 行；若表约束拒绝则降级本地留痕并放行，
 * 之后数据同步建档时 writeCloudSnapshot 会默认盖上 consent_granted: false。
 */
export async function saveCloudConsent(granted: boolean): Promise<void> {
  const client = getSupabase();
  const { data: { session } } = await client.auth.getSession();
  const uid = session?.user.id;
  if (!uid) {
    writeLocalConsent(granted);
    return;
  }

  const consentAt = new Date().toISOString();
  const { data: existing } = await client
    .from("checkin_sync")
    .select("auth_user_id")
    .eq("auth_user_id", uid)
    .maybeSingle();

  if (existing) {
    const { error } = await client.from("checkin_sync").update({
      consent_granted: granted,
      consent_at: consentAt,
      updated_at: consentAt,
    }).eq("auth_user_id", uid);
    writeLocalConsent(granted);
    if (error) throw new Error("授权状态同步失败，请稍后重试。");
    return;
  }

  const { error } = await client.from("checkin_sync").insert({
    auth_user_id: uid,
    consent_granted: granted,
    consent_at: consentAt,
    updated_at: consentAt,
  });
  writeLocalConsent(granted);
  if (error) {
    console.warn("授权云端建档失败（可能是历史表约束），已保留本机授权记录。", error);
  }
}
