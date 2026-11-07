import { ensureSession, getSupabase } from "../lib/supabase";
import type { CheckInState } from "../utils/checkin";

export const CHECKIN_QUOTA_EVENT = "junheng-checkin-quota-updated";

export type CheckinQuota = {
  maxCheckins: number;
  usedCheckins: number;
  remainingCheckins: number;
  boxSpec: string;
  idempotent?: boolean;
  physicalDay?: string;
};

function parseQuota(value: unknown): CheckinQuota | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  if (
    result.ok !== true
    || typeof result.maxCheckins !== "number"
    || typeof result.usedCheckins !== "number"
    || typeof result.remainingCheckins !== "number"
    || typeof result.boxSpec !== "string"
    || !Number.isInteger(result.maxCheckins)
    || !Number.isInteger(result.usedCheckins)
    || !Number.isInteger(result.remainingCheckins)
    || result.maxCheckins <= 0
    || result.usedCheckins < 0
    || result.remainingCheckins < 0
    || result.remainingCheckins > result.maxCheckins
  ) return null;

  return {
    maxCheckins: result.maxCheckins,
    usedCheckins: result.usedCheckins,
    remainingCheckins: result.remainingCheckins,
    boxSpec: result.boxSpec,
    idempotent: typeof result.idempotent === "boolean" ? result.idempotent : undefined,
    physicalDay: typeof result.physicalDay === "string" ? result.physicalDay : undefined,
  };
}

function publishQuota(quota?: CheckinQuota): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHECKIN_QUOTA_EVENT, { detail: quota }));
  }
}

export function requestCheckinQuotaRefresh(): void {
  publishQuota();
}

export async function getCheckinQuota(): Promise<CheckinQuota | null> {
  await ensureSession();
  const { data, error } = await getSupabase().rpc("get_checkin_quota");
  if (error) throw new Error("剩余打卡次数读取失败，请稍后重试。");
  return parseQuota(data);
}

export async function verifyCheckinSnapshot(state: CheckInState): Promise<CheckinQuota> {
  const { data, error } = await getSupabase().rpc("verify_checkin", {
    p_start_date: state.startDate,
    p_records: state.records,
    p_height_cm: state.heightCm ?? null,
    p_initial_weight_kg: state.initialWeightKg ?? null,
  });
  if (error) throw error;
  const quota = parseQuota(data);
  if (!quota) throw new Error("打卡保存未通过服务端校验。");
  publishQuota(quota);
  return quota;
}
