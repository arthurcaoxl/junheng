import type { DayRecord } from "../types/checkin";
import { getRepresentativeWeight } from "./weight";

/** 本期首个有效综合代表体重到最近有效值的变化；不足两条时不计算。 */
export function getPeriodWeightChange(records: DayRecord[]): number | null {
  const values = records
    .map((day) => Number(getRepresentativeWeight(day)))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (values.length < 2) return null;
  return values[values.length - 1]! - values[0]!;
}
