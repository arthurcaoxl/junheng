import { ensureSession, getSupabase } from "../lib/supabase";
import { syncToCloud, type SyncResult } from "./checkinSync";
import { markBoxCodePendingReview, syncBoxCodeActivationCache, type CachedActivationState } from "./activationStorage";

export { hasBoxCodeActivation, hasPendingBoxCodeReview } from "./activationStorage";

export type LegacyActivationSource = "whitelist" | "runtime";

export type MyActivationStatus = {
  state: CachedActivationState;
  requestedAt: string | null;
  rejectionHint: string | null;
  source?: LegacyActivationSource | null;
};

export type ActivationStatusErrorKind = "unauthorized" | "unavailable";

export class ActivationStatusError extends Error {
  readonly kind: ActivationStatusErrorKind;

  constructor(kind: ActivationStatusErrorKind) {
    super(kind === "unauthorized" ? "登录状态已失效，请重新登录。" : "激活状态读取失败，请稍后重试。");
    this.name = "ActivationStatusError";
    this.kind = kind;
  }
}

function isUnauthorizedError(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  const error = cause as { code?: unknown; message?: unknown };
  const code = typeof error.code === "string" ? error.code.toUpperCase() : "";
  const message = typeof error.message === "string" ? error.message.toUpperCase() : "";
  return code === "42501" || code === "UNAUTHORIZED" || message.includes("UNAUTHORIZED");
}

function parseActivationStatus(data: unknown): MyActivationStatus {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ActivationStatusError("unavailable");
  }
  const result = data as Record<string, unknown>;
  const state = result.state;
  if (
    (state !== "none" && state !== "pending_review" && state !== "active" && state !== "rejected" && state !== "legacy_granted")
    || (result.requested_at !== null && typeof result.requested_at !== "string")
    || (result.rejection_hint !== null && typeof result.rejection_hint !== "string")
  ) {
    throw new ActivationStatusError("unavailable");
  }

  const source = result.source;
  if (state === "legacy_granted") {
    if (
      (source !== "whitelist" && source !== "runtime")
      || result.requested_at !== null
      || result.rejection_hint !== null
    ) {
      throw new ActivationStatusError("unavailable");
    }
  } else if (source !== undefined && source !== null) {
    throw new ActivationStatusError("unavailable");
  }

  return {
    state,
    requestedAt: result.requested_at as string | null,
    rejectionHint: result.rejection_hint as string | null,
    source: source as LegacyActivationSource | null | undefined,
  };
}

export async function fetchMyActivationStatus(): Promise<MyActivationStatus> {
  try {
    const { data, error } = await getSupabase().rpc("get_my_activation_status");
    if (error) {
      if (isUnauthorizedError(error)) throw new ActivationStatusError("unauthorized");
      throw new ActivationStatusError("unavailable");
    }
    const status = parseActivationStatus(data);
    // 只有成功且通过契约校验的服务端响应才能纠正本机 UX 缓存。
    syncBoxCodeActivationCache(status.state);
    return status;
  } catch (cause) {
    if (cause instanceof ActivationStatusError) throw cause;
    if (isUnauthorizedError(cause)) throw new ActivationStatusError("unauthorized");
    throw new ActivationStatusError("unavailable");
  }
}

const DEVICE_FINGERPRINT_STORAGE_KEY = "junheng-device-fingerprint-v1";
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getOrCreateDeviceHash(): string {
  const existing = window.localStorage.getItem(DEVICE_FINGERPRINT_STORAGE_KEY);
  if (existing && UUID_V4_PATTERN.test(existing)) return existing;

  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("当前浏览器不支持设备标识，请升级浏览器后重试。");
  }
  const deviceHash = globalThis.crypto.randomUUID();
  window.localStorage.setItem(DEVICE_FINGERPRINT_STORAGE_KEY, deviceHash);
  return deviceHash;
}

type ActivationErrorCode =
  | "UNAUTHORIZED"
  | "CODE_NOT_AVAILABLE"
  | "CODE_TYPE_MISMATCH"
  | "SHIPMENT_VERIFICATION_REQUIRED"
  | "PAYMENT_VERIFICATION_REQUIRED"
  | "ACTIVATION_STATE_CONFLICT"
  | "COACH_NOT_ELIGIBLE"
  | "INVENTORY_INSUFFICIENT"
  | "IDEMPOTENCY_CONFLICT"
  | "TOO_MANY_ATTEMPTS"
  | "CODE_HASH_NOT_CONFIGURED"
  | "DEVICE_FINGERPRINT_REQUIRED"
  | "SYSTEM_CONFIG_MISSING";

type ActivationResult = {
  ok?: boolean;
  errorCode?: ActivationErrorCode;
};

const ERROR_MESSAGES: Record<ActivationErrorCode, string> = {
  UNAUTHORIZED: "登录状态已失效，请刷新页面后重试。",
  CODE_NOT_AVAILABLE: "产品码无效、已使用或当前不可激活。",
  CODE_TYPE_MISMATCH: "产品码类型与当前激活申请不一致。",
  SHIPMENT_VERIFICATION_REQUIRED: "发货信息尚未核验完成，请稍后再试。",
  PAYMENT_VERIFICATION_REQUIRED: "付款信息尚未核验完成，请稍后再试。",
  ACTIVATION_STATE_CONFLICT: "激活状态已变化，请刷新页面后重试。",
  COACH_NOT_ELIGIBLE: "当前产品码暂不能绑定教练，请联系运营方。",
  INVENTORY_INSUFFICIENT: "教练库存不足，激活已取消，请联系运营方补货。",
  IDEMPOTENCY_CONFLICT: "激活请求已变化，请刷新页面后重试。",
  TOO_MANY_ATTEMPTS: "尝试次数过多，请稍后再试。",
  CODE_HASH_NOT_CONFIGURED: "激活服务暂不可用，请联系运营方。",
  DEVICE_FINGERPRINT_REQUIRED: "激活审核申请失败，请刷新页面后重试。",
  SYSTEM_CONFIG_MISSING: "激活服务暂不可用，请联系运营方。",
};

export async function requestBoxCodeActivation(
  code: string,
  idempotencyKey: string,
): Promise<{ syncResult: SyncResult }> {
  await ensureSession();

  // 申请 RPC 会核对 checkin_sync 中的终身 userCode，先确保匿名云端档案存在。
  if (await syncToCloud() === "offline") {
    throw new Error("云端数据尚未同步，请检查网络后重试。");
  }

  const { data, error } = await getSupabase().rpc("request_box_code_activation", {
    p_code: code,
    p_idempotency_key: idempotencyKey,
    p_device_hash: getOrCreateDeviceHash(),
  });
  if (error) throw new Error("激活审核申请失败，请检查网络后重试。");

  const result = data as ActivationResult | null;
  if (!result?.ok) {
    const code = result?.errorCode;
    throw new Error(code ? ERROR_MESSAGES[code] : "激活审核申请失败，请稍后重试。");
  }

  markBoxCodePendingReview();
  return { syncResult: "synced" };
}
