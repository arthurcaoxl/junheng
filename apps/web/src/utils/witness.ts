import { getRepresentativeWeight, parseKg, type WeightReadableDay } from "./weight";

export type WitnessVariant = "reward" | "encouragement";
export type WitnessDay = WeightReadableDay & { waist?: string };
export type WitnessRecords = Record<string, WitnessDay>;

export type WitnessSummary = {
  /** 是否存在至少一条有效体重或腰围记录，用于阻止空白见证。 */
  hasMeasurements: boolean;
  /** 仅奖励牌保留该字段；无正向减重时为 null。 */
  weightDelta?: number | null;
  /** 仅保留正向腰围缩减；无正向变化时为 null。 */
  waistDelta: number | null;
};

type MeasurementDeltas = {
  hasMeasurements: boolean;
  weightDelta: number | null;
  waistDelta: number | null;
};

function round1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

function firstMinusLatest(values: number[]): number | null {
  if (values.length < 2) return null;
  return round1(values[0] - values[values.length - 1]);
}

function readMeasurementDeltas(records: WitnessRecords): MeasurementDeltas {
  const weights: number[] = [];
  const waists: number[] = [];

  Object.keys(records).sort().forEach((date) => {
    const day = records[date];
    const weight = parseKg(getRepresentativeWeight(day));
    const waist = parseKg(day.waist);
    if (weight !== null) weights.push(weight);
    if (waist !== null) waists.push(waist);
  });

  return {
    hasMeasurements: weights.length > 0 || waists.length > 0,
    weightDelta: firstMinusLatest(weights),
    waistDelta: firstMinusLatest(waists),
  };
}

function isReward(deltas: MeasurementDeltas): boolean {
  return (deltas.weightDelta !== null && deltas.weightDelta > 0)
    || (deltas.waistDelta !== null && deltas.waistDelta >= 1.5);
}

function positiveOnly(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

/** 体重减少，或腰围缩减至少 1.5cm，均可获得奖励牌。 */
export function getWitnessVariant(records: WitnessRecords): WitnessVariant {
  return isReward(readMeasurementDeltas(records)) ? "reward" : "encouragement";
}

/** 输出可直接用于 Canvas 的非负摘要；鼓励牌从结构上移除体重字段。 */
export function buildWitnessSummary(records: WitnessRecords): WitnessSummary {
  const deltas = readMeasurementDeltas(records);
  const reward = isReward(deltas);
  return {
    hasMeasurements: deltas.hasMeasurements,
    ...(reward ? { weightDelta: positiveOnly(deltas.weightDelta) } : {}),
    waistDelta: positiveOnly(deltas.waistDelta),
  };
}
