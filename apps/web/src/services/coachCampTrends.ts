import { getSupabase } from "../lib/supabase";

export type CoachCampTrendScope = "own" | "all";

export type CoachCampTrendRow = {
  day_index: number;
  participants: number;
  weight_samples: number;
  waist_samples: number;
  avg_weight_change_percent: number | null;
  avg_waist_change_percent: number | null;
  meal_completion_rate: number | null;
  water_rate: number | null;
  movement_rate: number | null;
  sleep_rate: number | null;
};

export type CoachPromotionState = "camper" | "promotion_pending" | "promotion_rejected" | "probational_coach" | "coach";

const PROMOTION_STATES: CoachPromotionState[] = ["camper", "promotion_pending", "promotion_rejected", "probational_coach", "coach"];

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("趋势数据格式异常");
  return value;
}

function nullableMetric(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("趋势数据格式异常");
  return value;
}

function toTrendRow(input: unknown, index: number): CoachCampTrendRow {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("趋势数据格式异常");
  const row = input as Record<string, unknown>;
  if (row.day_index !== index + 1) throw new Error("趋势数据必须严格按 D1-D21 返回");
  return {
    day_index: row.day_index,
    participants: count(row.participants),
    weight_samples: count(row.weight_samples),
    waist_samples: count(row.waist_samples),
    avg_weight_change_percent: nullableMetric(row.avg_weight_change_percent),
    avg_waist_change_percent: nullableMetric(row.avg_waist_change_percent),
    meal_completion_rate: nullableMetric(row.meal_completion_rate),
    water_rate: nullableMetric(row.water_rate),
    movement_rate: nullableMetric(row.movement_rate),
    sleep_rate: nullableMetric(row.sleep_rate),
  };
}

export async function fetchCoachCampTrends(scope: CoachCampTrendScope): Promise<CoachCampTrendRow[]> {
  const { data, error } = await getSupabase().rpc("get_coach_camp_trends_v1", { p_scope: scope });
  if (error) throw new Error("趋势读取失败，请稍后重试。");
  if (!Array.isArray(data) || data.length !== 21) throw new Error("趋势数据必须固定返回 21 行");
  return data.map(toTrendRow);
}

export async function fetchMyCoachPromotionState(): Promise<CoachPromotionState> {
  const { data, error } = await getSupabase().rpc("get_my_coach_promotion");
  if (error) throw new Error("教练晋升状态读取失败");
  const state = (data as { state?: unknown } | null)?.state;
  if (typeof state !== "string" || !PROMOTION_STATES.includes(state as CoachPromotionState)) {
    throw new Error("教练晋升状态格式异常");
  }
  return state as CoachPromotionState;
}
