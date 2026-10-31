import { ensureSession, getSupabase } from "../lib/supabase";
import { backupLocalSnapshot, readV3Snapshot, writeV3Snapshot } from "../utils/storageBridge";
import { normalizeOtpInput } from "./otp";

export type SyncResult = "synced" | "offline";

/** 立即上传一次（覆盖式）。任何失败都静默降级，绝不影响本地数据。 */
export async function syncToCloud(): Promise<SyncResult> {
  try {
    const session = await ensureSession();
    const v3 = readV3Snapshot();
    const client = getSupabase();
    // 营员代码终身唯一：云端已有记录时以云端 user_code 为准，绝不覆盖
    const { data: existing, error: lookupError } = await client
      .from("checkin_sync")
      .select("user_code")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing) {
      const { error } = await client.from("checkin_sync").update({
        start_date: v3.startDate,
        records: v3.records,
        updated_at: new Date().toISOString(),
      }).eq("auth_user_id", session.user.id);
      if (error) throw error;
      // 本地与云端代码不一致时，本地立即对齐云端固定值（营销码以云端为准）
      if (typeof existing.user_code === "string" && existing.user_code && existing.user_code !== v3.userCode) {
        writeV3Snapshot({ ...v3, userCode: existing.user_code });
      }
    } else {
      const { error } = await client.from("checkin_sync").insert({
        auth_user_id: session.user.id,
        user_code: v3.userCode,
        start_date: v3.startDate,
        records: v3.records,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    }
    return "synced";
  } catch {
    return "offline"; // 断网/未配置/RLS 拒绝：本地为准，下次保存自动重试
  }
}

// ---- 防抖：打卡改动只调度，停止操作 4 秒后才真正上传 ----
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pending = false;

export function scheduleSyncToCloud(delayMs = 4000): void {
  pending = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushSyncToCloud();
  }, delayMs);
}

export async function flushSyncToCloud(): Promise<SyncResult | "noop"> {
  if (!pending) return "noop";
  pending = false;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  return syncToCloud();
}

/** 在应用入口调用一次即可；离开页面时尽力冲刷。 */
export function installSyncLifecycle(): () => void {
  const onHide = () => { void flushSyncToCloud(); };
  const onVisibility = () => { if (document.visibilityState === "hidden") onHide(); };
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("pagehide", onHide);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

// ---- 发送验证码：客户端 60 秒重发冷却 + 429 友好提示 ----
const RESEND_COOLDOWN_MS = 60_000;
const lastSentAt = new Map<string, number>();

export function resendRemainingSeconds(email: string): number {
  const last = lastSentAt.get(email.toLowerCase()) ?? 0;
  return Math.max(0, Math.ceil((last + RESEND_COOLDOWN_MS - Date.now()) / 1000));
}

export async function sendLoginCode(email: string): Promise<void> {
  const key = email.toLowerCase();
  const wait = resendRemainingSeconds(key);
  if (wait > 0) throw new Error(`发送太频繁，请 ${wait} 秒后再试。`);

  try {
    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }, // 输错邮箱不新建空账户
    });
    if (error) throw error;
    lastSentAt.set(key, Date.now());
  } catch (error) {
    const e = error as { status?: number; code?: string; message?: string };
    if (e.status === 429 || /rate|limit|60 seconds|security/i.test(e.message ?? "")) {
      lastSentAt.set(key, Date.now()); // 服务端也在冷却，本地同步计时
      throw new Error("发送太频繁，请 1 分钟后再试（种子期 QQ 邮箱有日发送限额，连续测试请间隔更久）。");
    }
    console.error("OTP delivery failed", {
      status: e.status,
      code: e.code,
      emailDomain: key.split("@")[1] ?? "unknown",
      message: e.message,
    });
    throw new Error("验证码发送失败，请检查邮箱地址或网络后重试。");
  }
}

export type RestoreSource = "cloud-restored" | "local-seeded";

/** 新设备：验码登录 → 拉云端 → 覆盖本地（先备份）。云端无行则把本机推成种子。 */
export async function loginWithEmail(email: string, token: string): Promise<RestoreSource> {
  const code = normalizeOtpInput(token); // 6 或 8 位都接受，由服务端校验
  const { error } = await getSupabase().auth.verifyOtp({ email, token: code, type: "email" });
  if (error) throw new Error("验证码不正确或已过期，请重新获取。");

  const { data, error: fetchError } = await getSupabase()
    .from("checkin_sync").select("user_code,start_date,records").single();
  if (fetchError && fetchError.code !== "PGRST116") throw new Error("云端数据读取失败，请稍后重试。");

  if (!data) {
    await syncToCloud();
    return "local-seeded";
  }
  backupLocalSnapshot();
  writeV3Snapshot({ schema: 3, userCode: data.user_code, startDate: data.start_date, records: data.records });
  return "cloud-restored"; // UI 层收到后执行 window.location.reload() 完成水合
}
