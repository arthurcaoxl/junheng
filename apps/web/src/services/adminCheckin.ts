import { getSupabase } from "../lib/supabase";
import { addDays, diffDays, isDateKey, TOTAL_DAYS } from "../utils/checkin";
import { getRepresentativeWeight, type NodeWeights } from "../utils/weight";
import { sendLoginCode } from "./checkinSync";
import { normalizeOtpInput } from "./otp";

export type AdminDayRecord = {
  weight: string;
  waist: string;
  meals: boolean[];
  water: boolean;
  movement: boolean;
  sleep: boolean;
  weights?: NodeWeights;
  clothes?: string;
};

export type AdminCamper = {
  authUserId: string; // 仅用于 React key 与内部关联，页面和导出均不展示
  email: string;
  userCode: string;
  startDate: string;
  updatedAt: string;
  records: Record<string, AdminDayRecord>;
  recordedDays: number;
};

export type CampDayMetric = {
  dayIndex: number;
  participants: number;
  avgWeightChangePercent: number | null;
  avgWaistChangePercent: number | null;
  mealCompletionRate: number | null;
  waterRate: number | null;
  movementRate: number | null;
  sleepRate: number | null;
};

type AdminOverviewRow = {
  auth_user_id: string;
  email: string | null;
  user_code: string;
  start_date: string;
  records: unknown;
  updated_at: string;
};

function normalizeRecords(input: unknown): Record<string, AdminDayRecord> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const records: Record<string, AdminDayRecord> = {};
  Object.entries(input as Record<string, unknown>).forEach(([date, raw]) => {
    if (!isDateKey(date) || !raw || typeof raw !== "object") return;
    const day = raw as Partial<AdminDayRecord>;
    const rawWeights = day.weights && typeof day.weights === "object" && !Array.isArray(day.weights) ? day.weights : undefined;
    const weights: NodeWeights = {};
    if (rawWeights) {
      (["morning", "noon", "evening"] as const).forEach((node) => {
        if (typeof rawWeights[node] === "string") weights[node] = rawWeights[node] as string;
      });
    }
    records[date] = {
      weight: typeof day.weight === "string" ? day.weight : "",
      waist: typeof day.waist === "string" ? day.waist : "",
      meals: Array.isArray(day.meals) && day.meals.length === 3 ? day.meals.map(Boolean) : [false, false, false],
      water: Boolean(day.water),
      movement: Boolean(day.movement),
      sleep: Boolean(day.sleep),
      ...(Object.keys(weights).length ? { weights } : {}),
      ...(typeof day.clothes === "string" ? { clothes: day.clothes } : {}),
    };
  });
  return records;
}

function hasRecord(day: AdminDayRecord | undefined): day is AdminDayRecord {
  const hasNodeWeight = Boolean(day?.weights && Object.values(day.weights).some((value) => typeof value === "string" && value.trim() !== ""));
  return Boolean(day && (hasNodeWeight || day.weight || day.waist || day.meals.some(Boolean) || day.water || day.movement || day.sleep));
}

function toCampers(rows: unknown): AdminCamper[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const item = row as Partial<AdminOverviewRow>;
    if (
      typeof item.auth_user_id !== "string" || !item.auth_user_id ||
      typeof item.user_code !== "string" || !item.user_code ||
      typeof item.start_date !== "string" || !isDateKey(item.start_date) ||
      typeof item.updated_at !== "string"
    ) return [];
    const records = normalizeRecords(item.records);
    return [{
      authUserId: item.auth_user_id,
      email: typeof item.email === "string" ? item.email : "未绑定邮箱",
      userCode: item.user_code,
      startDate: item.start_date,
      updatedAt: item.updated_at,
      records,
      recordedDays: Object.values(records).filter(hasRecord).length,
    }];
  });
}

/** 管理员邮箱验证码第一步，直接复用营员跨设备登录的发送逻辑与限流提示。 */
export async function sendAdminLoginCode(email: string): Promise<void> {
  await sendLoginCode(email);
}

/** 第二步：验证邮箱 OTP 后立即调用汇总 RPC；RPC 会再次校验 camp_admins 白名单。 */
export async function verifyAdminLogin(email: string, token: string): Promise<AdminCamper[]> {
  const code = normalizeOtpInput(token);
  const { error } = await getSupabase().auth.verifyOtp({ email, token: code, type: "email" });
  if (error) throw new Error("验证码不正确或已过期，请重新获取。");
  return fetchAdminCheckIns();
}

function toFetchError(error: unknown): Error {
  const e = error as { code?: string; message?: string };
  if (e.code === "P0001" || /不是管理员|row-level security|permission/i.test(e.message ?? "")) {
    return new Error("该邮箱没有管理员权限，请先在 Supabase 白名单中添加。账号与数据均未改动。");
  }
  return new Error("统计数据读取失败，请检查网络或稍后重试。");
}

export async function fetchAdminCheckIns(): Promise<AdminCamper[]> {
  try {
    const { data, error } = await getSupabase().rpc("admin_checkin_overview");
    if (error) throw error;
    return toCampers(data);
  } catch (error) {
    throw toFetchError(error);
  }
}

export async function logoutAdmin(): Promise<void> {
  await getSupabase().auth.signOut();
}

function metricValue(value: string): number | null {
  const number = Number(value);
  return value !== "" && Number.isFinite(number) && number > 0 ? number : null;
}

/** 后台与前台同口径：体重取综合代表体重，腰围取原值。 */
function metricOf(record: AdminDayRecord, metric: "weight" | "waist"): string {
  return metric === "weight" ? getRepresentativeWeight(record) : record.waist;
}

function firstMetric(camper: AdminCamper, metric: "weight" | "waist"): number | null {
  return Object.keys(camper.records).sort().map((key) => metricValue(metricOf(camper.records[key], metric))).find((value) => value !== null) ?? null;
}

function average(values: number[]): number | null {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null;
}

/** 将不同开营日按 D1–D21 对齐；体重/腰围用各自首条有效记录作为基线计算变化率。 */
export function buildCampDayMetrics(campers: AdminCamper[]): CampDayMetric[] {
  return Array.from({ length: TOTAL_DAYS }, (_, index) => {
    const dayIndex = index + 1;
    const points = campers.flatMap((camper) => {
      const record = camper.records[addDays(camper.startDate, index)];
      return hasRecord(record) ? [{ camper, record }] : [];
    });

    const weightChanges = points.flatMap(({ camper, record }) => {
      const baseline = firstMetric(camper, "weight");
      const current = metricValue(getRepresentativeWeight(record));
      return baseline && current ? [Number(((current - baseline) / baseline * 100).toFixed(1))] : [];
    });
    const waistChanges = points.flatMap(({ camper, record }) => {
      const baseline = firstMetric(camper, "waist");
      const current = metricValue(record.waist);
      return baseline && current ? [Number(((current - baseline) / baseline * 100).toFixed(1))] : [];
    });

    const participantCount = points.length;
    const rate = (count: number) => participantCount ? Number((count / participantCount * 100).toFixed(1)) : null;
    return {
      dayIndex,
      participants: participantCount,
      avgWeightChangePercent: average(weightChanges),
      avgWaistChangePercent: average(waistChanges),
      mealCompletionRate: rate(points.reduce((sum, point) => sum + point.record.meals.filter(Boolean).length, 0) / 3),
      waterRate: rate(points.filter((point) => point.record.water).length),
      movementRate: rate(points.filter((point) => point.record.movement).length),
      sleepRate: rate(points.filter((point) => point.record.sleep).length),
    };
  });
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

/** 脱敏导出：只含营员代码与打卡指标，不含 UID、邮箱等账户字段。 */
export function buildAdminCsv(campers: AdminCamper[]): string {
  const headers = ["camper_code", "record_date", "camp_day", "weight_kg", "waist_cm", "meal_breakfast", "meal_lunch", "meal_dinner", "water", "movement", "sleep"];
  const rows = campers.flatMap((camper) => Object.entries(camper.records)
    .filter(([, record]) => hasRecord(record))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, record]) => {
      const dayIndex = diffDays(camper.startDate, date) + 1;
      return [
        camper.userCode,
        date,
        dayIndex >= 1 && dayIndex <= TOTAL_DAYS ? String(dayIndex) : "",
        getRepresentativeWeight(record),
        record.waist,
        ...record.meals.map((value) => (value ? "1" : "0")),
        record.water ? "1" : "0",
        record.movement ? "1" : "0",
        record.sleep ? "1" : "0",
      ].map(csvCell).join(",");
    }));
  return `﻿${headers.join(",")}\n${rows.join("\n")}\n`;
}
