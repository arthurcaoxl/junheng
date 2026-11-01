import type { DayRecord } from "../types/checkin";
import { getWindowDates } from "./checkin";
import { getRepresentativeWeight, parseKg, type WeightReadableDay } from "./weight";

export const BMI_SCALE_MIN = 14;
export const BMI_SCALE_MAX = 35;

export type BmiCategory = "underweight" | "normal" | "overweight" | "obese";

export type BmiTrackingInput = {
  startDate: string;
  heightCm?: string;
  initialWeightKg?: string;
  records: Record<string, WeightReadableDay | DayRecord>;
};

export type BmiMeasurement = {
  /** 自定义初始体重没有对应打卡日期，因此 date 为 null。 */
  date: string | null;
  weightKg: number;
  /** 原始 BMI，不提前四舍五入，避免临界值误分类。 */
  bmi: number;
};

export type BmiPoint = BmiMeasurement & { date: string };

export type BmiTrackingResult = {
  initial: BmiMeasurement | null;
  current: BmiPoint | null;
  /** 当前原始 BMI 减初始原始 BMI。 */
  change: number | null;
  series: BmiPoint[];
};

/** BMI = 体重 kg / 身高 m²；非法输入返回 null。 */
export function calculateBmi(weightKg: unknown, heightCm: unknown): number | null {
  const weight = parseKg(weightKg);
  const height = parseKg(heightCm);
  if (weight === null || height === null) return null;
  const bmi = weight / ((height / 100) ** 2);
  return Number.isFinite(bmi) ? bmi : null;
}

/** WS/T 428—2013 成人分类；调用方不得先对 bmi 四舍五入。 */
export function classifyBmi(bmi: number): BmiCategory | null {
  if (!Number.isFinite(bmi)) return null;
  if (bmi < 18.5) return "underweight";
  if (bmi < 24) return "normal";
  if (bmi < 28) return "overweight";
  return "obese";
}

/** 展示统一保留 1 位，并把极小负值产生的 -0 归一为 0。 */
export function roundBmi(value: number): number {
  const rounded = Number(value.toFixed(1));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export type BmiTargetDiff = {
  status: "reduce" | "safe" | "underweight";
  targetWeightKg: number;
  diffKg: number;
};

/** 以 BMI 24 对应的体重为界，计算当前体重与正常范围边界的差距。 */
export function getBmiTargetDiff(currentWeightKg: unknown, heightCm: unknown): BmiTargetDiff | null {
  const weight = parseKg(currentWeightKg);
  const height = parseKg(heightCm);
  const bmi = calculateBmi(weight, height);
  const category = bmi === null ? null : classifyBmi(bmi);
  if (weight === null || height === null || category === null) return null;

  const targetWeightKg = roundBmi(24 * (height / 100) ** 2);
  return {
    status: category === "underweight" ? "underweight" : category === "normal" ? "safe" : "reduce",
    targetWeightKg,
    diffKg: roundBmi(weight - targetWeightKg),
  };
}

/** 当前 BMI 在 14–35 量尺上的百分比位置，超界值截断到两端。 */
export function getBmiScalePosition(bmi: number): number {
  const position = ((bmi - BMI_SCALE_MIN) / (BMI_SCALE_MAX - BMI_SCALE_MIN)) * 100;
  return Math.min(100, Math.max(0, position));
}

/**
 * 从当前 21 天窗口构建 BMI 追踪数据。
 * 初始值：自定义体重优先，否则 D1 / 最早有效体重；当前值取最晚有效体重。
 */
export function getBmiTracking(input: BmiTrackingInput): BmiTrackingResult {
  const height = parseKg(input.heightCm);
  if (height === null) return { initial: null, current: null, change: null, series: [] };

  const series = getWindowDates(input.startDate).flatMap((date): BmiPoint[] => {
    const weightKg = parseKg(getRepresentativeWeight(input.records[date]));
    const bmi = calculateBmi(weightKg, height);
    return weightKg === null || bmi === null ? [] : [{ date, weightKg, bmi }];
  });

  const customInitialWeight = parseKg(input.initialWeightKg);
  const customInitialBmi = calculateBmi(customInitialWeight, height);
  const initial: BmiMeasurement | null = customInitialWeight !== null && customInitialBmi !== null
    ? { date: null, weightKg: customInitialWeight, bmi: customInitialBmi }
    : (series[0] ?? null);
  const current = series[series.length - 1] ?? null;

  return {
    initial,
    current,
    change: initial && current ? current.bmi - initial.bmi : null,
    series,
  };
}
