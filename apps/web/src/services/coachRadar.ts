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
