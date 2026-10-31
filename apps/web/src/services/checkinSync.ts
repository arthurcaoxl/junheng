import { ensureSession, getSupabase } from "../lib/supabase";
import type { CheckInState } from "../utils/checkin";
import {
  backupLocalSnapshot,
  readV3SnapshotStrict,
  validateV3Snapshot,
  writeV3Snapshot,
} from "../utils/storageBridge";
import { normalizeOtpInput } from "./otp";

export type SyncResult = "synced" | "offline";
export type InitialMergeResult = "already-merged" | "cloud-restored" | "local-seeded" | "local-merged" | "empty";

export const MERGED_FLAG_KEY = "junheng-checkin-merged-flag";
const MERGED_DATA_VERSION = "junheng-checkin-v3";

type MergedFlag = { dataVersion: string; mergedAt: string };
type MergedFlags = Record<string, MergedFlag>;
type CloudRow = { user_code: string; start_date: string; records: CheckInState["records"] };

const inFlightMerges = new Map<string, Promise<InitialMergeResult>>();

function readMergedFlags(): MergedFlags {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MERGED_FLAG_KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as MergedFlags : {};
  } catch {
    return {};
  }
}

function hasMergedFlag(uid: string): boolean {
  return readMergedFlags()[uid]?.dataVersion === MERGED_DATA_VERSION;
}

function markMerged(uid: string): void {
  const flags = readMergedFlags();
  flags[uid] = { dataVersion: MERGED_DATA_VERSION, mergedAt: new Date().toISOString() };
  window.localStorage.setItem(MERGED_FLAG_KEY, JSON.stringify(flags));
}

async function readCloudSnapshot(uid: string): Promise<CheckInState | null> {
  const { data, error } = await getSupabase()
    .from("checkin_sync")
    .select("user_code,start_date,records")
    .eq("auth_user_id", uid)
    .maybeSingle();
  if (error) throw new Error("云端数据读取失败，请稍后重试。");
  if (!data) return null;
  const row = data as CloudRow;
  return validateV3Snapshot({ schema: 3, userCode: row.user_code, startDate: row.start_date, records: row.records });
}

async function writeCloudSnapshot(uid: string, state: CheckInState, cloudUserCode: string | null): Promise<void> {
  const client = getSupabase();
  if (cloudUserCode !== null) {
    const { error } = await client.from("checkin_sync").update({
      start_date: state.startDate,
      records: state.records,
      updated_at: new Date().toISOString(),
    }).eq("auth_user_id", uid);
    if (error) throw new Error("云端数据写入失败，请稍后重试。");
    if (cloudUserCode && cloudUserCode !== state.userCode) {
      writeV3Snapshot({ ...state, userCode: cloudUserCode });
    }
    return;
  }

  const { error } = await client.from("checkin_sync").insert({
    auth_user_id: uid,
    user_code: state.userCode,
    start_date: state.startDate,
    records: state.records,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("云端数据写入失败，请稍后重试。");
}

async function runInitialMerge(uid: string): Promise<InitialMergeResult> {
  const local = readV3SnapshotStrict();
  const cloud = await readCloudSnapshot(uid);
  const hasLocalRecords = Object.keys(local.records).length > 0;

  if (!hasLocalRecords) {
    if (!cloud) return "empty";
    backupLocalSnapshot();
    writeV3Snapshot(cloud);
    return "cloud-restored";
  }

  if (!cloud) {
    await writeCloudSnapshot(uid, local, null);
    return "local-seeded";
  }

  const records = { ...cloud.records };
  let recordsChanged = false;
  Object.entries(local.records).forEach(([date, localDay]) => {
    if (!(date in records) || JSON.stringify(records[date]) !== JSON.stringify(localDay)) {
      records[date] = localDay; // 同日期冲突以本地为准；云端独有日期保持不动
      recordsChanged = true;
    }
  });
  const merged = { ...local, userCode: cloud.userCode, records };
  if (recordsChanged || cloud.startDate !== local.startDate) {
    await writeCloudSnapshot(uid, merged, cloud.userCode);
  }
  if (cloud.userCode !== local.userCode) {
    writeV3Snapshot({ ...local, userCode: cloud.userCode }); // 仅对齐营员代码，不回填云端日期
  }
  return "local-merged";
}

function ensureInitialMergeForUid(uid: string): Promise<InitialMergeResult> {
  if (hasMergedFlag(uid)) return Promise.resolve("already-merged");
  const existing = inFlightMerges.get(uid);
  if (existing) return existing;

  const task = runInitialMerge(uid)
    .then((result) => {
      markMerged(uid); // 只有读写全部成功才标记；标记前崩溃时重跑也具有相同结果
      return result;
    })
    .finally(() => inFlightMerges.delete(uid));
  inFlightMerges.set(uid, task);
  return task;
}

/** OTP 成功、恢复已登录 session 或首次备份前，均通过此入口保证合并只执行一次。 */
export function ensureInitialMerge(): Promise<InitialMergeResult> {
  return ensureSession().then((session) => ensureInitialMergeForUid(session.user.id));
}

async function uploadCurrentSnapshot(uid: string): Promise<void> {
  const v3 = readV3SnapshotStrict();
  const client = getSupabase();
  // 营员代码终身唯一：云端已有记录时以云端 user_code 为准，绝不覆盖
  const { data: existing, error: lookupError } = await client
    .from("checkin_sync")
    .select("user_code")
    .eq("auth_user_id", uid)
    .maybeSingle();
  if (lookupError) throw lookupError;
  await writeCloudSnapshot(uid, v3, existing ? (existing as { user_code: string }).user_code : null);
}

/** 首次调用先做日期并集合并；后续保持既有覆盖式增量备份语义。失败不影响本地。 */
export async function syncToCloud(): Promise<SyncResult> {
  try {
    const session = await ensureSession();
    const mergeResult = await ensureInitialMergeForUid(session.user.id);
    if (mergeResult !== "already-merged") return "synced";
    await uploadCurrentSnapshot(session.user.id);
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

export type RestoreSource = InitialMergeResult;

/** 验码登录后统一走首次合并：本地非空补全云端，只有本地为空才恢复云端。 */
export async function loginWithEmail(email: string, token: string): Promise<RestoreSource> {
  const code = normalizeOtpInput(token); // 6 或 8 位都接受，由服务端校验
  const { error } = await getSupabase().auth.verifyOtp({ email, token: code, type: "email" });
  if (error) throw new Error("验证码不正确或已过期，请重新获取。");
  return ensureInitialMerge(); // cloud-restored 时由 UI reload 完成水合
}
