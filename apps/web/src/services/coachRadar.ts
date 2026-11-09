import { getSupabase } from "../lib/supabase";

export type CoachRadarAlert = "red" | "yellow" | "green";

export type CoachRadarRow = {
  camperCode: string;
  weightDelta: number | null;
  waistDelta: number | null;
  bmi: number | null;
  alertLevel: CoachRadarAlert;
};

export class CoachRadarPermissionError extends Error {
  constructor() {
    super("暂无教练雷达查看权限");
    this.name = "CoachRadarPermissionError";
  }
}

function nullableNumber(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error("雷达数据格式异常");
}

function toRadarRow(input: unknown): CoachRadarRow {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("雷达数据格式异常");
  }
  const row = input as Record<string, unknown>;
  if (
    typeof row.camper_code !== "string"
    || !row.camper_code
    || (row.alert_level !== "red" && row.alert_level !== "yellow" && row.alert_level !== "green")
  ) {
    throw new Error("雷达数据格式异常");
  }
  return {
    camperCode: row.camper_code,
    weightDelta: nullableNumber(row.weight_delta),
    waistDelta: nullableNumber(row.waist_delta),
    bmi: nullableNumber(row.bmi),
    alertLevel: row.alert_level,
  };
}

function isPermissionError(error: { code?: string; message?: string }): boolean {
  return error.code === "42501"
    || error.code === "P0001"
    || /permission|forbidden|不是管理员|没有.*权限/i.test(error.message ?? "");
}

export async function fetchCoachRadar(): Promise<CoachRadarRow[]> {
  const { data, error } = await getSupabase().rpc("get_coach_radar_v1");
  if (error) {
    if (isPermissionError(error)) throw new CoachRadarPermissionError();
    throw new Error("雷达读取失败");
  }
  if (!Array.isArray(data)) throw new Error("雷达数据格式异常");
  return data.map(toRadarRow);
}

export type CoachActivityStatus = "new_registered" | "active";
export type FollowupStatus = "pending" | "contacted" | "waiting_reply" | "resolved" | "escalated";

export type CoachCamper = {
  camperRef: string;
  camperCode: string;
  activityStatus: CoachActivityStatus;
  followupStatus: FollowupStatus;
  followupNote: string;
  followupVersion: number;
};

const FOLLOWUP_STATUSES: FollowupStatus[] = ["pending", "contacted", "waiting_reply", "resolved", "escalated"];

function isFollowupStatus(value: unknown): value is FollowupStatus {
  return typeof value === "string" && FOLLOWUP_STATUSES.includes(value as FollowupStatus);
}

function toCoachCamper(input: unknown): CoachCamper {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("营员列表数据格式异常");
  const row = input as Record<string, unknown>;
  if (
    typeof row.camper_ref !== "string" || !row.camper_ref
    || typeof row.camper_code !== "string" || !row.camper_code
    || (row.activity_status !== "new_registered" && row.activity_status !== "active")
    || !isFollowupStatus(row.followup_status)
    || typeof row.followup_note !== "string"
    || typeof row.followup_version !== "number" || !Number.isSafeInteger(row.followup_version) || row.followup_version < 0
  ) throw new Error("营员列表数据格式异常");
  return {
    camperRef: row.camper_ref,
    camperCode: row.camper_code,
    activityStatus: row.activity_status,
    followupStatus: row.followup_status,
    followupNote: row.followup_note,
    followupVersion: row.followup_version,
  };
}

export async function fetchCoachCampers(): Promise<CoachCamper[]> {
  const { data, error } = await getSupabase().rpc("get_coach_campers_v1");
  if (error) {
    if (isPermissionError(error)) throw new CoachRadarPermissionError();
    throw new Error("营员列表读取失败");
  }
  if (!Array.isArray(data)) throw new Error("营员列表数据格式异常");
  return data.map(toCoachCamper);
}

export async function saveCoachCamperFollowup(
  camperRef: string,
  followupStatus: FollowupStatus,
  note: string,
  expectedVersion: number,
): Promise<{ version: number }> {
  const { data, error } = await getSupabase().rpc("set_coach_camper_followup_v1", {
    p_camper_ref: camperRef,
    p_followup_status: followupStatus,
    p_note: note.trim(),
    p_expected_version: expectedVersion,
  });
  if (error) {
    if (/FOLLOWUP_VERSION_CONFLICT/i.test(error.message)) throw new Error("跟进记录已被更新，请刷新后重试。");
    if (isPermissionError(error)) throw new CoachRadarPermissionError();
    throw new Error("跟进保存失败，请稍后重试。");
  }
  const version = (data as { version?: unknown } | null)?.version;
  if ((data as { ok?: unknown } | null)?.ok !== true || typeof version !== "number") throw new Error("跟进返回数据格式异常");
  return { version };
}
