import type { DayRecord } from "../components/SevenDayCheckIn";
import { getRepresentativeWeight, type NodeWeights } from "./weight";

export const TOTAL_DAYS = 21;
export const STORAGE_KEY = "junheng-checkin-v3";
export const LEGACY_V2_KEY = "junheng-checkin-v2";
export const LEGACY_V1_KEY = "junheng-seven-day-checkin-v1";

export type CheckInState = {
  schema: 3;
  userCode: string;
  startDate: string;
  records: Record<string, DayRecord>;
  clothesWeight?: string; // 全局默认衣物重量（kg），缺省 "0"
};

export function emptyDay(): DayRecord {
  return { weight: "", waist: "", meals: [false, false, false], water: false, movement: false, sleep: false };
}

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

export function addDays(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return toDateKey(date);
}

export function diffDays(fromKey: string, toKey: string) {
  const [fromYear, fromMonth, fromDay] = fromKey.split("-").map(Number);
  const [toYear, toMonth, toDay] = toKey.split("-").map(Number);
  const from = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const to = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((to - from) / 86400000);
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function formatShortDate(key: string) {
  return key.slice(5).replace("-", "/");
}

export function generateUserCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const randomValues = new Uint32Array(5);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(randomValues);
  else randomValues.forEach((_, index) => { randomValues[index] = Math.floor(Math.random() * 4294967296); });
  return `JH-${Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join("")}`;
}

function normalizeWeights(input: unknown): NodeWeights | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const source = input as Record<string, unknown>;
  const weights: NodeWeights = {};
  (["morning", "noon", "evening"] as const).forEach((node) => {
    if (typeof source[node] === "string") weights[node] = source[node] as string;
  });
  return Object.keys(weights).length ? weights : undefined;
}

function normalizeDay(day: Partial<DayRecord> | undefined): DayRecord {
  const weights = normalizeWeights(day?.weights);
  return {
    ...emptyDay(),
    ...day,
    meals: Array.isArray(day?.meals) && day.meals.length === 3 ? day.meals.map(Boolean) : [false, false, false],
    // 多节点扩展：weights/clothes 可选放行；旧数据没有这些字段时保持缺省
    ...(weights ? { weights } : {}),
    ...(typeof day?.clothes === "string" ? { clothes: day.clothes } : {}),
  };
}

export function hasContent(day: DayRecord | undefined): day is DayRecord {
  if (!day) return false;
  const hasNodeWeight = Boolean(day.weights && Object.values(day.weights).some((value) => typeof value === "string" && value.trim() !== ""));
  return Boolean(hasNodeWeight || day.weight || day.waist || day.meals.some(Boolean) || day.water || day.movement || day.sleep);
}

export function createFreshState(): CheckInState {
  return { schema: 3, userCode: generateUserCode(), startDate: todayKey(), records: {} };
}

function migrateLegacyDays(days: Partial<DayRecord>[]): CheckInState {
  // 旧数据是过去发生的记录：映射到"截止今天"的连续 N 天，而非从今天往后排
  const startDate = addDays(todayKey(), -(days.length - 1));
  const records: Record<string, DayRecord> = {};
  days.forEach((day, index) => {
    const normalized = normalizeDay(day);
    if (hasContent(normalized)) records[addDays(startDate, index)] = normalized;
  });
  return { schema: 3, userCode: generateUserCode(), startDate, records };
}

function parseState(raw: string | null): CheckInState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CheckInState>;
    if (parsed.schema !== 3 || !isDateKey(parsed.startDate) || typeof parsed.userCode !== "string" || !parsed.records || typeof parsed.records !== "object") return null;
    const records: Record<string, DayRecord> = {};
    Object.entries(parsed.records).forEach(([key, day]) => {
      if (isDateKey(key)) records[key] = normalizeDay(day);
    });
    return {
      schema: 3,
      userCode: parsed.userCode,
      startDate: parsed.startDate,
      records,
      ...(typeof parsed.clothesWeight === "string" ? { clothesWeight: parsed.clothesWeight } : {}),
    };
  } catch {
    return null;
  }
}

export function loadState(): CheckInState {
  try {
    const current = parseState(window.localStorage.getItem(STORAGE_KEY));
    if (current) return current;
    const legacyRaw = window.localStorage.getItem(LEGACY_V2_KEY) ?? window.localStorage.getItem(LEGACY_V1_KEY);
    if (legacyRaw) {
      const days = JSON.parse(legacyRaw) as Partial<DayRecord>[];
      if (Array.isArray(days) && [7, TOTAL_DAYS].includes(days.length)) {
        const migrated = migrateLegacyDays(days);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch {
    // 存储不可用或数据损坏时回退到全新状态
  }
  const fresh = createFreshState();
  try {
    // 立即持久化，保证首次访问生成的营员代码在后续访问中保持稳定
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    // 存储不可用时仅保留内存态
  }
  return fresh;
}

export function getWindowDates(startDate: string) {
  return Array.from({ length: TOTAL_DAYS }, (_, index) => addDays(startDate, index));
}

export function buildWindowRecords(state: CheckInState): DayRecord[] {
  return getWindowDates(state.startDate).map((key) => state.records[key] ?? emptyDay());
}

export function clampActiveDate(state: CheckInState, currentKey = todayKey()) {
  const endDate = addDays(state.startDate, TOTAL_DAYS - 1);
  if (currentKey < state.startDate) return state.startDate;
  if (currentKey > endDate) return endDate;
  return currentKey;
}

export function getCampStats(state: CheckInState, currentKey = todayKey()) {
  const dates = getWindowDates(state.startDate);
  const recordedDays = dates.filter((key) => hasContent(state.records[key])).length;
  const elapsedDays = Math.min(Math.max(diffDays(state.startDate, currentKey) + 1, 0), TOTAL_DAYS);
  const endDate = dates[TOTAL_DAYS - 1];
  return {
    recordedDays,
    elapsedDays,
    endDate,
    adherence: elapsedDays ? Math.round((recordedDays / elapsedDays) * 100) : 0,
    isComplete: currentKey > endDate,
  };
}

const CSV_HEADERS = ["user_code", "record_date", "day_index", "weight_kg", "waist_cm", "meal_breakfast", "meal_lunch", "meal_dinner", "water", "movement", "sleep"];

export function exportCheckInCsv(state: CheckInState, currentStartDate = state.startDate) {
  const rows = Object.entries(state.records)
    .filter(([, day]) => hasContent(day))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, day]) => {
      const dayIndex = diffDays(currentStartDate, key) + 1;
      const inWindow = dayIndex >= 1 && dayIndex <= TOTAL_DAYS ? String(dayIndex) : "";
      return [
        state.userCode,
        key,
        inWindow,
        getRepresentativeWeight(day), // 列语义不变：综合代表体重（旧数据即原 weight）
        day.waist,
        ...day.meals.map((value) => (value ? "1" : "0")),
        day.water ? "1" : "0",
        day.movement ? "1" : "0",
        day.sleep ? "1" : "0",
      ].join(",");
    });
  return `﻿${CSV_HEADERS.join(",")}\n${rows.join("\n")}\n`;
}
