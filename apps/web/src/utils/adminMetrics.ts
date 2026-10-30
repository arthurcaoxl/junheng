import type { AdminCamper, AdminDayRecord } from "../services/adminCheckin";
import type { DayRecord } from "../components/SevenDayCheckIn";
import { addDays, diffDays, emptyDay, getWindowDates, isDateKey, TOTAL_DAYS } from "./checkin";

/** 后台可视化专用纯计算：不接触 Supabase，不改动 storage-v3 契约。 */

export type CampKpis = {
  totalCampers: number;
  boundCampers: number;
  boundRate: number | null;
  todayCheckedIn: number;
  avgWeightChangePercent: number | null;
};

export type CamperDayDetail = {
  dayIndex: number;
  date: string;
  record: AdminDayRecord | null;
  weightChangePercent: number | null;
  waistChangePercent: number | null;
};

export type CamperFilter = "all" | "unbound" | "inactive2d";

function hasContent(day: AdminDayRecord | undefined): day is AdminDayRecord {
  return Boolean(day && (day.weight || day.waist || day.meals.some(Boolean) || day.water || day.movement || day.sleep));
}

function metricValue(value: string): number | null {
  const number = Number(value);
  return value !== "" && Number.isFinite(number) && number > 0 ? number : null;
}

function changePercent(baseline: number | null, current: string): number | null {
  const value = metricValue(current);
  return baseline && value ? Number(((value - baseline) / baseline * 100).toFixed(1)) : null;
}

function firstMetric(camper: AdminCamper, metric: "weight" | "waist"): number | null {
  return Object.keys(camper.records).sort()
    .map((key) => metricValue(camper.records[key][metric]))
    .find((value) => value !== null) ?? null;
}

function latestChangePercent(camper: AdminCamper, metric: "weight" | "waist"): number | null {
  const baseline = firstMetric(camper, metric);
  const dates = Object.keys(camper.records).sort().reverse();
  for (const date of dates) {
    const change = changePercent(baseline, camper.records[date][metric]);
    if (change !== null) return change;
  }
  return null;
}

function average(values: number[]): number | null {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null;
}

/** 全局 KPI：总人数、邮箱绑定率、今日打卡人数、全营平均体重变化（各自最新记录对基线）。 */
export function buildCampKpis(campers: AdminCamper[], today: string): CampKpis {
  const boundCampers = campers.filter((camper) => camper.email !== "未绑定邮箱").length;
  return {
    totalCampers: campers.length,
    boundCampers,
    boundRate: campers.length ? Number((boundCampers / campers.length * 100).toFixed(1)) : null,
    todayCheckedIn: campers.filter((camper) => hasContent(camper.records[today])).length,
    avgWeightChangePercent: average(campers.flatMap((camper) => {
      const change = latestChangePercent(camper, "weight");
      return change === null ? [] : [change];
    })),
  };
}

/** 单个营员 D1–D21 明细：无记录的日子保留空行，变化率相对各自首条有效记录。 */
export function buildCamperDays(camper: AdminCamper): CamperDayDetail[] {
  const weightBaseline = firstMetric(camper, "weight");
  const waistBaseline = firstMetric(camper, "waist");
  return Array.from({ length: TOTAL_DAYS }, (_, index) => {
    const date = addDays(camper.startDate, index);
    const record = camper.records[date];
    return {
      dayIndex: index + 1,
      date,
      record: hasContent(record) ? record : null,
      weightChangePercent: hasContent(record) ? changePercent(weightBaseline, record.weight) : null,
      waistChangePercent: hasContent(record) ? changePercent(waistBaseline, record.waist) : null,
    };
  });
}

/** 快捷筛选：全部 / 未绑定邮箱 / 今天与昨天连续两天都未打卡（含从未打卡）。 */
export function filterCampers(campers: AdminCamper[], filter: CamperFilter, today: string): AdminCamper[] {
  if (!isDateKey(today)) return campers;
  const yesterday = addDays(today, -1);
  return campers.filter((camper) => {
    if (filter === "unbound") return camper.email === "未绑定邮箱";
    if (filter === "inactive2d") return !hasContent(camper.records[today]) && !hasContent(camper.records[yesterday]);
    return true;
  });
}

/** 最近一次有内容打卡的日期键；从未打卡返回 null。 */
export function lastCheckInDate(camper: AdminCamper): string | null {
  return Object.keys(camper.records).filter((key) => hasContent(camper.records[key])).sort().reverse()[0] ?? null;
}

/** 距今天未打卡天数，用于列表辅助提示。 */
export function daysSinceLastCheckIn(camper: AdminCamper, today: string): number | null {
  const last = lastCheckInDate(camper);
  return last && isDateKey(today) ? diffDays(last, today) : null;
}

/** 将后台日期键 records 适配为前台组件需要的 21 天窗口数组（AdminDayRecord 与 DayRecord 同构）。 */
export function toWindowRecords(camper: AdminCamper): DayRecord[] {
  return getWindowDates(camper.startDate).map((key) => camper.records[key] ?? emptyDay());
}
